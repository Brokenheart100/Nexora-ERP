"""Build and test the P0 Keycloak SPI on two local clustered nodes, then remove owned containers.

Requires Docker Linux engine and Python requests. No Java/Maven installation or external mailbox.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import html
import json
import os
import ipaddress
import re
import secrets
import shutil
import ssl
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from email import policy
from email.parser import Parser
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

import requests
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name("keycloak-email-otp")
OUTPUT = ROOT / "artifacts/p0/email-otp-probe"
IMAGE_BASELINE = json.loads(Path(__file__).with_name("keycloak-email-otp-images.json").read_text(encoding="utf-8"))
KEYCLOAK, MAVEN, POSTGRES, SMTP = (IMAGE_BASELINE[k] for k in ["keycloak", "maven", "postgres", "smtp"])
IMAGES = list(IMAGE_BASELINE.values())
USERS = ["happy", "wrong", "expired", "binding", "race", "rate", "failure", "disabled", "changed", "afterbudget", "pkce", "malformed", "disabledlater"]
BACKENDS = []


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def docker(*arguments, timeout=300):
    process = subprocess.run(["docker", *map(str, arguments)], capture_output=True, encoding="utf-8", errors="replace", timeout=timeout)
    if process.returncode:
        # Arguments can contain generated ephemeral secrets: never print command lines.
        raise RuntimeError(f"Docker operation {arguments[0]} failed: {process.stderr[-2000:]}")
    return process.stdout.strip()


def wait_until(check, seconds=180):
    deadline = time.monotonic() + seconds
    last_error = None
    while time.monotonic() < deadline:
        try:
            value = check()
            if value:
                return value
        except (requests.RequestException, RuntimeError, ValueError) as error:
            last_error = type(error).__name__
        time.sleep(1)
    raise TimeoutError(f"Local probe readiness timeout ({last_error})")


class Proxy(BaseHTTPRequestHandler):
    def handle_request(self):
        index = int(self.headers.get("X-P0-Node", "1")) - 1
        require(index in [0, 1], "Invalid test route")
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ["host", "connection", "content-length", "x-p0-node"]}
        headers.update({"X-Forwarded-Host": f"127.0.0.1:{self.server.server_port}", "X-Forwarded-Port": str(self.server.server_port), "X-Forwarded-Proto": "https", "X-Forwarded-For": "127.0.0.1"})
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        response = requests.request(self.command, BACKENDS[index] + self.path, headers=headers, data=data, allow_redirects=False, timeout=60)
        self.send_response(response.status_code)
        for key, value in response.headers.items():
            if key.lower() not in ["connection", "content-length", "transfer-encoding", "content-encoding", "set-cookie"]:
                self.send_header(key, value)
        for cookie in response.raw.headers.getlist("Set-Cookie"):
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(response.content)))
        self.end_headers()
        self.wfile.write(response.content)

    do_GET = handle_request
    do_POST = handle_request
    do_PUT = handle_request

    def log_message(self, *args):
        pass


class Form(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.action = None
        self.inputs = set()
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "form" and attrs.get("id") == "otp-form":
            self.action = html.unescape(attrs["action"])
        if tag == "input":
            self.inputs.add(attrs.get("name"))


def encode(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


class Flow:
    def __init__(self, base, node=1):
        self.base = base
        self.session = requests.Session()
        self.session.headers["X-P0-Node"] = str(node)
        self.verifier = secrets.token_urlsafe(48)
        self.state = secrets.token_urlsafe(18)
        self.nonce = secrets.token_urlsafe(18)
        response = self.session.get(base + "/realms/nexora-p0/protocol/openid-connect/auth", params={
            "client_id": "p0-browser", "redirect_uri": base + "/callback", "response_type": "code",
            "scope": "openid email", "state": self.state, "nonce": self.nonce,
            "code_challenge": encode(hashlib.sha256(self.verifier.encode()).digest()), "code_challenge_method": "S256",
        }, timeout=30)
        self.form = Form(response.text)
        require(response.status_code == 200 and "email" in self.form.inputs, "Email form did not load")

    def send(self, email):
        response = self.session.post(self.form.action, data={"email": email}, timeout=30)
        self.form = Form(response.text)
        require(response.status_code == 200 and "code" in self.form.inputs, "Generic code form did not load")
        return response

    def verify(self, code, node=None, action=None, session=None):
        response = (session or self.session).post(action or self.form.action, data={"code": code}, headers={"X-P0-Node": str(node or 1)}, allow_redirects=False, timeout=30)
        refreshed = Form(response.text)
        if session is None and refreshed.action:
            self.form = refreshed
        return response

    def exchange(self, response, verifier=None):
        require(response.status_code == 302, "Expected authorization redirect")
        query = parse_qs(urlsplit(response.headers.get("Location", "")).query)
        require(query.get("state") == [self.state] and "code" in query, "Authorization state/code invalid")
        return self.session.post(self.base + "/realms/nexora-p0/protocol/openid-connect/token", data={
            "client_id": "p0-browser", "grant_type": "authorization_code", "code": query["code"][0],
            "redirect_uri": self.base + "/callback", "code_verifier": verifier or self.verifier,
        }, timeout=30)


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--scratch", type=Path, help="Reuse an exact source snapshot and its already compiled target JAR")
    args = parser.parse_args()
    run_id = uuid.uuid4().hex[:10]
    output = OUTPUT / run_id
    output.mkdir(parents=True)
    scratch = args.scratch.resolve() if args.scratch else Path(tempfile.mkdtemp(prefix="nexora-p0-otp-"))
    prefix = "nexora-p0-otp-" + run_id
    owned = []
    secret_files = []
    network = False
    proxy = None
    old_ca_bundle = os.environ.get("REQUESTS_CA_BUNDLE")
    report = {"checkedAtUtc": datetime.now(timezone.utc).isoformat(), "runId": run_id, "status": "running",
              "keycloakVersion": "26.8.2", "providerVersion": "0.1.0", "cases": [], "images": {},
              "pythonPackages": {name: version(name) for name in ["requests", "cryptography"]},
              "testSettings": {"otpTtlSeconds": 10, "resendCooldownSeconds": 60, "ipRequestsPerMinute": 30},
              "limitations": ["Isolated local candidate, not production provider approval or ERP/BFF integration",
                              "No real email delivery, Google callback or independent MFA exercised",
                              "No multi-site partition, cache total-loss recovery or timing side-channel proof"],
              "evidenceDirectory": str(output.relative_to(ROOT)), "scratchDirectory": str(scratch)}

    def record(name, evidence):
        report["cases"].append({"name": name, "status": "passed", "evidence": evidence})
        print("PASS " + name, flush=True)

    def envfile(name, values):
        path = scratch / name
        path.write_text("".join(f"{k}={v}\n" for k, v in values.items()), encoding="utf-8")
        secret_files.append(path)
        return path

    def run_container(suffix, image, options, command=()):
        name = prefix + "-" + suffix
        docker("run", "-d", "--name", name, "--label", "nexora.p0.run=" + run_id,
               "--network", prefix, *options, image, *command)
        owned.append(name)
        return name

    def port(name, number):
        data = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Ports}}", name))
        return "http://127.0.0.1:" + data[f"{number}/tcp"][0]["HostPort"]

    try:
        if args.scratch:
            for path in SOURCE.rglob("*"):
                if path.is_file():
                    relative = path.relative_to(SOURCE)
                    require((scratch / relative).read_bytes() == path.read_bytes(), f"Reused source snapshot differs: {relative}")
            if (OUTPUT / "build.log").is_file():
                shutil.copy2(OUTPUT / "build.log", output / "maven-build.log")
        else:
            shutil.copytree(SOURCE, scratch, dirs_exist_ok=True)
            process = subprocess.run(["docker", "run", "--rm", "--mount", f"type=bind,source={scratch},target=/work", "-w", "/work", MAVEN, "mvn", "-B", "-ntp", "-Dmaven.repo.local=/work/.m2", "package", "-DskipTests"], capture_output=True, encoding="utf-8", errors="replace", timeout=600)
            (output / "maven-build.log").write_text(process.stdout + process.stderr, encoding="utf-8")
            require(process.returncode == 0, "Maven build failed; inspect build log")
        jar = scratch / "target/nexora-p0-email-otp.jar"
        require(jar.is_file(), "Provider JAR missing")
        report["providerJarSha256"] = hashlib.sha256(jar.read_bytes()).hexdigest()
        shutil.copy2(jar, output / jar.name)
        report["sourceSha256"] = {str(p.relative_to(SOURCE)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE.rglob("*") if p.is_file()}
        image = prefix + ":probe"
        build = subprocess.run(["docker", "build", "-t", image, str(scratch)], capture_output=True, encoding="utf-8", errors="replace", timeout=600)
        (output / "image-build.log").write_text(build.stdout + build.stderr, encoding="utf-8")
        require(build.returncode == 0, "Provider image build failed")
        report["builtImage"] = {"tag": image, "id": docker("image", "inspect", "--format", "{{.Id}}", image)}
        for item in IMAGES:
            report["images"][item] = json.loads(docker("image", "inspect", "--format", "{{json .RepoDigests}}", item))
        record("fixed-version-provider-build", "Java 21 / Keycloak 26.8.2 SPI JAR compiled and optimized server image built")
        # Dedicated bridge; host bindings are loopback-only. Docker Desktop's internal
        # networks do not publish the host ports needed by this local harness.
        docker("network", "create", "--label", "nexora.p0.run=" + run_id, prefix)
        network = True
        password = secrets.token_urlsafe(32)
        pg_env = envfile("postgres.env", {"POSTGRES_DB": "keycloak", "POSTGRES_USER": "keycloak", "POSTGRES_PASSWORD": password})
        pg = run_container("db", POSTGRES, ["--network-alias", "database", "--env-file", pg_env, "--memory=512m"])
        wait_until(lambda: subprocess.run(["docker", "exec", pg, "pg_isready", "-U", "keycloak"], capture_output=True).returncode == 0)
        smtp = run_container("smtp", SMTP, ["--network-alias", "mail-sink", "--memory=128m", "-p", "127.0.0.1::8025", "--mount", f"type=bind,source={scratch / 'smtp_sink.py'},target=/sink.py,readonly"], ["python", "/sink.py"])
        sink = port(smtp, 8025)
        wait_until(lambda: requests.get(sink, timeout=2).status_code == 200)
        # Real local HTTPS keeps Secure authentication cookies intact. Trust this
        # one temporary certificate instead of disabling TLS certificate checks.
        tls_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Nexora P0 loopback")])
        now = datetime.now(timezone.utc)
        tls_cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
                    .public_key(tls_key.public_key()).serial_number(x509.random_serial_number())
                    .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(days=1))
                    .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1")), x509.DNSName("localhost")]), critical=False)
                    .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
                    .sign(tls_key, hashes.SHA256()))
        key_path, cert_path = scratch / "loopback.key", scratch / "loopback.crt"
        key_path.write_bytes(tls_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        secret_files.append(key_path)
        cert_path.write_bytes(tls_cert.public_bytes(serialization.Encoding.PEM))
        os.environ["REQUESTS_CA_BUNDLE"] = str(cert_path)
        proxy = ThreadingHTTPServer(("127.0.0.1", 0), Proxy)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(cert_path, key_path)
        proxy.socket = tls.wrap_socket(proxy.socket, server_side=True)
        threading.Thread(target=proxy.serve_forever, daemon=True).start()
        base = f"https://127.0.0.1:{proxy.server_port}"
        realm = {"realm": "nexora-p0", "enabled": True, "sslRequired": "none", "loginTheme": "nexora-p0",
                 "registrationAllowed": False, "duplicateEmailsAllowed": False, "loginWithEmailAllowed": True,
                 "browserFlow": "p0-email", "eventsEnabled": True, "eventsListeners": ["jboss-logging"],
                 "smtpServer": {"host": "mail-sink", "port": "2525", "from": "noreply@example.invalid", "auth": "false", "ssl": "false", "starttls": "false"},
                 "authenticationFlows": [{"alias": "p0-email", "providerId": "basic-flow", "topLevel": True, "builtIn": False,
                                          "authenticationExecutions": [{"authenticator": "nexora-p0-email-otp", "requirement": "REQUIRED", "priority": 10, "authenticatorFlow": False}]}],
                 "clients": [{"clientId": "p0-browser", "enabled": True, "publicClient": True, "fullScopeAllowed": False, "protocol": "openid-connect", "standardFlowEnabled": True, "directAccessGrantsEnabled": False, "redirectUris": [base + "/callback"], "attributes": {"pkce.code.challenge.method": "S256"}, "defaultClientScopes": ["email", "profile"]}],
                 "users": [{"username": name, "email": name + "@example.invalid", "enabled": name != "disabled", "emailVerified": False, "firstName": "P0", "lastName": name, "requiredActions": []} for name in USERS]}
        realm_path = scratch / "realm.json"
        realm_path.write_text(json.dumps(realm), encoding="utf-8")
        admin_password = secrets.token_urlsafe(32)
        kc_env = envfile("keycloak.env", {"KC_DB": "postgres", "KC_DB_URL": "jdbc:postgresql://database:5432/keycloak", "KC_DB_USERNAME": "keycloak", "KC_DB_PASSWORD": password,
                                          "KC_BOOTSTRAP_ADMIN_USERNAME": "p0-admin", "KC_BOOTSTRAP_ADMIN_PASSWORD": admin_password,
                                          "KC_HOSTNAME": base, "KC_HTTP_ENABLED": "true", "KC_PROXY_HEADERS": "xforwarded",
                                          "JAVA_OPTS_KC_HEAP": "-Xms128m -Xmx512m", "NEXORA_OTP_HMAC_KEY": secrets.token_urlsafe(48),
                                          "NEXORA_OTP_TTL_SECONDS": "10", "NEXORA_OTP_COOLDOWN_SECONDS": "60", "NEXORA_OTP_IP_BUDGET": "30"})
        nodes = []
        for suffix in ["a", "b"]:
            options = ["--env-file", kc_env, "--memory=1g", "--cpus=2", "-p", "127.0.0.1::8080"]
            command = ["start", "--optimized", "--cache=ispn", "--cache-stack=jdbc-ping"]
            if suffix == "a":
                options += ["--mount", f"type=bind,source={realm_path},target=/opt/keycloak/data/import/realm.json,readonly"]
                command += ["--import-realm"]
            name = run_container(suffix, image, options, command)
            nodes.append(name)
            BACKENDS.append(port(name, 8080))
            wait_until(lambda: requests.get(BACKENDS[-1] + "/realms/nexora-p0/.well-known/openid-configuration", timeout=3).status_code == 200)
        wait_until(lambda: all(re.search(r"\(2\)\s*\[", docker("logs", name)) for name in nodes), seconds=90)
        record("two-node-cluster", "Both nodes report a two-member JDBC_PING Infinispan cluster")

        def captured():
            return requests.get(sink, timeout=5).json()

        def code_for(name):
            messages = [m for m in captured() if m["recipient"] == name + "@example.invalid"]
            require(messages, "Local SMTP capture missing")
            message = Parser(policy=policy.default).parsestr(messages[-1]["body"])
            body = message.get_body(preferencelist=("plain",)).get_content() if message.is_multipart() else message.get_content()
            match = re.search(r"Code: ([0-9]{6})", body)
            require(match, "Six-digit OTP missing from local mail")
            return match[1]

        def send(name, node=1):
            flow = Flow(base, node)
            response = flow.send(name + "@example.invalid")
            return flow, response

        def rejected(response):
            require(not success(response), "Unexpected successful authentication")
            require(response.status_code < 500, "Server exception is not a rejection result")

        def success(response):
            location = urlsplit(response.headers.get("Location", ""))
            query = parse_qs(location.query)
            return response.status_code == 302 and location.path == "/callback" and "code" in query and "error" not in query

        flow, _ = send("happy")
        otp = code_for("happy")
        action = flow.form.action
        response = flow.verify(otp, node=2)
        tokens = flow.exchange(response)
        require(tokens.status_code == 200, "Code + PKCE token exchange failed")
        access = tokens.json()["access_token"]
        userinfo = flow.session.get(base + "/realms/nexora-p0/protocol/openid-connect/userinfo", headers={"Authorization": "Bearer " + access}, timeout=10)
        require(userinfo.status_code == 200 and userinfo.json().get("email") == "happy@example.invalid" and userinfo.json().get("email_verified") is True, "Authenticated identity mismatch")
        record("login-code-pkce-cross-node", "Node A issued OTP; node B verified; token exchange and userinfo email_verified passed")
        replay = flow.verify(otp, node=1, action=action)
        rejected(replay)
        record("otp-and-form-replay-rejected", "Successful challenge/form cannot mint a second authorization result")
        second_exchange = flow.exchange(response)
        require(second_exchange.status_code == 400, "Authorization code replay was accepted")
        record("authorization-code-replay-rejected", "Second token exchange returned 400")

        flow, _ = send("pkce")
        response = flow.verify(code_for("pkce"), node=2)
        invalid_pkce = flow.exchange(response, verifier=secrets.token_urlsafe(48))
        require(invalid_pkce.status_code == 400 and "access_token" not in invalid_pkce.json(), "Wrong PKCE verifier issued tokens")
        record("wrong-pkce-verifier-rejected", "A valid OTP authorization result cannot be exchanged with a different PKCE verifier")

        flow, _ = send("wrong")
        real_code = code_for("wrong")
        rejected(flow.verify("000000" if real_code != "000000" else "111111", node=2))
        rejected(flow.verify(real_code))
        record("wrong-code-consumes-challenge", "Wrong code rejected; correct code submitted afterwards also rejected")

        flow, _ = send("malformed")
        otp = code_for("malformed")
        rejected(flow.verify("12x456", node=2))
        rejected(flow.verify(otp))
        record("malformed-code-rejected-server-side", "Non-digit code submitted directly over HTTP rejected and challenge consumed")

        flow, _ = send("expired")
        otp = code_for("expired")
        time.sleep(11)
        rejected(flow.verify(otp, node=2))
        record("expired-code-rejected", "10-second test TTL elapsed before verification; defaults remain 300 seconds")

        owner, _ = send("binding")
        otp = code_for("binding")
        other, _ = send("unknown-binding")
        rejected(other.verify(otp, node=2))
        require(owner.verify(otp, node=2).status_code == 302, "Wrong-session attempt consumed the owner's challenge")
        record("cross-session-binding", "OTP rejected in another session; original session still accepted")

        flow, _ = send("race")
        otp = code_for("race")
        gate = threading.Barrier(2)
        def race(node):
            session = requests.Session()
            session.cookies.update(flow.session.cookies)
            gate.wait(timeout=10)
            return flow.verify(otp, node=node, session=session)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(race, [1, 2]))
        winners = [r for r in results if success(r)]
        require(len(winners) == 1, "Concurrent cross-node verification must have exactly one winner")
        for result in results:
            require(result.status_code < 500, "Concurrent loser returned server error")
        record("cross-node-concurrent-consumption", {"successfulAuthorizationResults": len(winners), "responses": [r.status_code for r in results]})

        first, first_response = send("rate")
        count = len(captured())
        second, second_response = send("rate", node=2)
        require(len(captured()) == count and first_response.text.split('id="probe-message">')[1].split("</p>")[0] == second_response.text.split('id="probe-message">')[1].split("</p>")[0], "Resend cooldown or generic response failed")
        rejected(second.verify(code_for("rate"), node=2))
        require(first.verify(code_for("rate"), node=2).status_code == 302, "Resend throttle invalidated first valid session")
        record("distributed-resend-cooldown", "Same mailbox across two nodes received exactly one message within 60 seconds")

        count = len(captured())
        requests.post(sink, json={"fail": True}, timeout=5).raise_for_status()
        flow, failure_response = send("failure")
        rejected(flow.verify("000000", node=2))
        require(len(captured()) == count, "Failed SMTP delivery was recorded as sent")
        requests.post(sink, json={"fail": False}, timeout=5).raise_for_status()
        require(any("NEXORA_P0_OTP_MAIL_FAILED" in docker("logs", n) for n in nodes), "SMTP failure path was not exercised")
        record("smtp-failure-fails-closed", "Local SMTP 451 produced no authenticated session and a sanitized failure marker")

        for name in ["disabled", "unknown"]:
            count = len(captured())
            flow, generic_response = send(name, node=2)
            require(len(captured()) == count, "Unknown/disabled mailbox received mail")
            rejected(flow.verify("000000"))
            require(Form(generic_response.text).inputs == Form(failure_response.text).inputs
                    and generic_response.text.split('id="probe-message">')[1].split("</p>")[0] == failure_response.text.split('id="probe-message">')[1].split("</p>")[0], "Account availability leaked through form/status")
        record("unknown-disabled-generic-ui", "Unknown/disabled/SMTP-failure paths share form, message and 200 status; no timing claim")

        admin_response = requests.post(base + "/realms/master/protocol/openid-connect/token", data={"client_id": "admin-cli", "grant_type": "password", "username": "p0-admin", "password": admin_password}, timeout=20)
        require(admin_response.status_code == 200, "Local test admin bootstrap failed")
        admin_headers = {"Authorization": "Bearer " + admin_response.json()["access_token"]}
        flow, _ = send("changed")
        otp = code_for("changed")
        users = requests.get(base + "/admin/realms/nexora-p0/users", params={"username": "changed", "exact": "true"}, headers=admin_headers, timeout=10).json()
        require(len(users) == 1, "Test user lookup failed")
        updated_user = dict(users[0], email="changed-new@example.invalid")
        change = requests.put(base + "/admin/realms/nexora-p0/users/" + users[0]["id"], headers=admin_headers, json=updated_user, timeout=10)
        require(change.status_code == 204, f"Test email change failed ({change.status_code}: {change.text[:200]})")
        rejected(flow.verify(otp, node=2))
        record("email-changed-after-issue", "Changing registered mailbox invalidates a previously issued challenge across nodes")

        flow, _ = send("disabledlater")
        otp = code_for("disabledlater")
        users = requests.get(base + "/admin/realms/nexora-p0/users", params={"username": "disabledlater", "exact": "true"}, headers=admin_headers, timeout=10).json()
        require(len(users) == 1, "Test disabled user lookup failed")
        updated_user = dict(users[0], enabled=False)
        change = requests.put(base + "/admin/realms/nexora-p0/users/" + users[0]["id"], headers=admin_headers, json=updated_user, timeout=10)
        require(change.status_code == 204, f"Test disable failed ({change.status_code}: {change.text[:200]})")
        rejected(flow.verify(otp, node=2))
        record("disabled-after-issue", "Disabling an account invalidates an already issued OTP on the other node")

        count = len(captured())
        # Keep the fixed-window budget test away from a minute boundary.
        if time.time() % 60 > 45:
            time.sleep(61 - time.time() % 60)
        for index in range(31):
            send("unknown-budget-" + str(index), node=1 + index % 2)
        flow, _ = send("afterbudget", node=2)
        require(len(captured()) == count, "IP send budget did not block additional real mailbox send")
        rejected(flow.verify("000000"))
        record("distributed-ip-budget", "30-slot per-IP minute budget prevents an additional send across both nodes")
        report["capturedMessageCount"] = len(captured())
        report["status"] = "passed"
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        raise
    finally:
        report["cleanup"] = {"containers": [], "networkRemoved": False, "ephemeralSecretFilesRemoved": True}
        for name in reversed(owned):
            try:
                log = subprocess.run(["docker", "logs", name], capture_output=True, encoding="utf-8", errors="replace", timeout=15)
                text = log.stdout + log.stderr
                # Test identities only; redact bearer/authorization artifacts defensively.
                text = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED-JWT]", text)
                text = re.sub(r"Code '[^']+'", "Code '[REDACTED-CODE]'", text)
                (output / (name.rsplit("-", 1)[1] + ".log")).write_text(text, encoding="utf-8")
                # Remove only containers that carry this exact run's ownership label.
                label = docker("inspect", "--format", '{{index .Config.Labels "nexora.p0.run"}}', name)
                require(label == run_id, "Container ownership label mismatch")
                docker("rm", "-f", "-v", name, timeout=40)
                report["cleanup"]["containers"].append({"name": name, "removed": True})
            except Exception as error:
                report["cleanup"]["containers"].append({"name": name, "removed": False, "error": str(error)})
        if network:
            try:
                docker("network", "rm", prefix, timeout=20)
                report["cleanup"]["networkRemoved"] = True
            except Exception as error:
                report["cleanup"]["networkError"] = str(error)
        if proxy:
            proxy.shutdown()
            proxy.server_close()
        if old_ca_bundle is None:
            os.environ.pop("REQUESTS_CA_BUNDLE", None)
        else:
            os.environ["REQUESTS_CA_BUNDLE"] = old_ca_bundle
        for path in secret_files:
            try:
                require(path.parent.resolve() == scratch, "Secret path escaped scratch directory")
                path.unlink(missing_ok=True)
            except Exception:
                report["cleanup"]["ephemeralSecretFilesRemoved"] = False
        if report["status"] == "passed" and (not report["cleanup"]["networkRemoved"]
                or not report["cleanup"]["ephemeralSecretFilesRemoved"]
                or any(not row["removed"] for row in report["cleanup"]["containers"])):
            report["status"] = "failed"
            report["error"] = "Probe cleanup incomplete"
        report["finishedAtUtc"] = datetime.now(timezone.utc).isoformat()
        data = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        (output / "result.json").write_text(data, encoding="utf-8")
        (OUTPUT / "result.json").write_text(data, encoding="utf-8")
    print(json.dumps({"status": report["status"], "cases": len(report["cases"]), "runId": run_id}, ensure_ascii=False))


if __name__ == "__main__":
    main()
