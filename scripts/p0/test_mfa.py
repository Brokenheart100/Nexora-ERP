"""Keycloak 26.8.2 built-in password + TOTP / recovery, enrollment and step-up probe.

Uses the existing P0 Python requirements and Docker image manifest. No external IdP/mail.
"""
from __future__ import annotations

import base64
import concurrent.futures
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import shutil
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer
from importlib.metadata import version
from pathlib import Path
from urllib.parse import parse_qs, urlsplit, urljoin

import requests
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID

import test_email_otp as shared

ROOT, require, docker, wait_until, encode = shared.ROOT, shared.require, shared.docker, shared.wait_until, shared.encode
OUTPUT = ROOT / "artifacts/p0/mfa-probe"
REALM = "nexora-p0-mfa"
PERIOD = 30
USED = {}


class Proxy(shared.Proxy):
    do_DELETE = shared.Proxy.handle_request


class Forms(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.forms, self.current, self.button = [], None, None
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "form":
            self.current = {"id": attrs.get("id"), "action": attrs.get("action"), "fields": {}, "names": set(), "buttons": []}
            self.forms.append(self.current)
        elif self.current is not None and tag in ["input", "button"]:
            if attrs.get("name"):
                self.current["names"].add(attrs["name"])
            if tag == "input" and attrs.get("type") == "hidden":
                self.current["fields"][attrs["name"]] = attrs.get("value", "")
            if tag == "button":
                self.button = dict(attrs, text="")
                self.current["buttons"].append(self.button)

    def handle_data(self, text):
        if self.button is not None:
            self.button["text"] += text

    def handle_endtag(self, tag):
        if tag == "form":
            self.current = None
        if tag == "button":
            self.button = None

    def with_field(self, name):
        return next((f for f in self.forms if name in f["names"]), None)


def totp(secret, timestamp=None, digits=6):
    counter = int(time.time() if timestamp is None else timestamp) // PERIOD
    key = base64.b32decode(secret.replace(" ", "").upper() + "=" * (-len(secret.replace(" ", "")) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % (10 ** digits)).zfill(digits)


def fresh_code(secret):
    # Avoid mistaking intentional no-reuse policy for an authentication failure.
    while USED.get(secret) == int(time.time()) // PERIOD or PERIOD - time.time() % PERIOD < 3:
        time.sleep(0.25)
    USED[secret] = int(time.time()) // PERIOD
    return totp(secret)


def success(response):
    location = urlsplit(response.headers.get("Location", ""))
    query = parse_qs(location.query)
    return response.status_code == 302 and location.path == "/callback" and "code" in query and "error" not in query


def rejected(response):
    require(not success(response), "Authentication unexpectedly succeeded")
    require(response.status_code < 500, "Server error is not an accepted rejection")


class Flow:
    recovery_execution = None
    totp_execution = None
    def __init__(self, base, client="mfa-high", session=None, node=1, **extra):
        self.base, self.client = base, client
        self.session = session or requests.Session()
        self.verifier, self.state, self.nonce = (secrets.token_urlsafe(40) for _ in range(3))
        params = {"client_id": client, "redirect_uri": base + "/callback", "response_type": "code", "scope": "openid email",
                  "state": self.state, "nonce": self.nonce, "code_challenge": encode(hashlib.sha256(self.verifier.encode()).digest()), "code_challenge_method": "S256"}
        params.update(extra)
        self.response = self.session.get(base + f"/realms/{REALM}/protocol/openid-connect/auth", params=params, headers={"X-P0-Node": str(node)}, allow_redirects=False, timeout=30)
        self.follow_internal(node)

    def follow_internal(self, node):
        for _ in range(8):
            if self.response.status_code not in [302, 303]:
                return
            target = urljoin(self.base, self.response.headers.get("Location", ""))
            if not target.startswith(self.base + f"/realms/{REALM}/"):
                return
            self.response = self.session.get(target, headers={"X-P0-Node": str(node)}, allow_redirects=False, timeout=30)
        raise AssertionError("Unexpected internal redirect loop")

    @property
    def forms(self):
        return Forms(self.response.text)

    def post(self, form, values, node=1):
        require(form and form["action"], "Expected authentication form missing")
        self.response = self.session.post(form["action"], data={**form["fields"], **values}, headers={"X-P0-Node": str(node)}, allow_redirects=False, timeout=30)
        self.follow_internal(node)
        return self.response

    def password(self, name, password, node=1):
        return self.post(self.forms.with_field("password"), {"username": name, "password": password}, node)

    def otp(self, code, node=2):
        self.choose_method("otp", self.totp_execution)
        return self.post(self.forms.with_field("otp"), {"otp": code}, node)

    def recovery(self):
        self.choose_method("recoveryCodeInput", self.recovery_execution)

    def choose_method(self, field, execution):
        if self.forms.with_field(field):
            return
        self.post(self.forms.with_field("tryAnotherWay"), {"tryAnotherWay": "on"})
        # keycloak.v2 uses one hidden-value form per choice, while the base
        # theme uses submit buttons. Select by the actual configured execution,
        # never by a guessed translated label or a form's position.
        form = next((f for f in self.forms.forms if f["fields"].get("authenticationExecution") == execution
                     or any(b.get("value") == execution for b in f["buttons"])), None)
        require(form, "Requested second factor missing from the selection form")
        self.post(form, {"authenticationExecution": execution}, node=2)
        require(self.forms.with_field(field), "Requested second-factor challenge did not appear")

    def recovery_code(self, code, node=2):
        return self.post(self.forms.with_field("recoveryCodeInput"), {"recoveryCodeInput": code}, node)

    def setup(self, label="P0 authenticator"):
        form = self.forms.with_field("totpSecret")
        require(form, "TOTP enrollment form missing")
        # Keycloak's hidden field is raw UTF-8; authenticator apps receive its
        # Base32 encoding in the QR/manual setup, not the raw hidden value.
        secret = base64.b32encode(form["fields"]["totpSecret"].encode()).decode()
        code = fresh_code(secret)
        self.post(form, {"totp": code, "userLabel": label}, node=2)
        return secret

    def recovery_setup(self):
        form = self.forms.with_field("generatedRecoveryAuthnCodes")
        require(form, "Recovery setup missing")
        codes = form["fields"]["generatedRecoveryAuthnCodes"].split(",")
        require(len(codes) == 12 and len(set(codes)) == 12, "Expected 12 distinct recovery codes")
        self.post(form, {"kcRecoveryCodesConfirmationCheck": "on"}, node=1)
        return codes

    def tokens(self):
        require(success(self.response), "Expected completed authorization")
        query = parse_qs(urlsplit(self.response.headers["Location"]).query)
        require(query.get("state") == [self.state], "OIDC state mismatch")
        response = self.session.post(self.base + f"/realms/{REALM}/protocol/openid-connect/token", data={"client_id": self.client, "grant_type": "authorization_code", "code": query["code"][0], "redirect_uri": self.base + "/callback", "code_verifier": self.verifier}, timeout=30)
        require(response.status_code == 200, "Code/PKCE exchange failed")
        return response.json()


def realm_config(base, passwords):
    def execution(auth, requirement="REQUIRED", priority=10, config=None):
        value = {"authenticator": auth, "requirement": requirement, "priority": priority, "authenticatorFlow": False}
        if config:
            value["authenticatorConfig"] = config
        return value

    def sub(alias, requirement, priority):
        return {"flowAlias": alias, "authenticatorFlow": True, "requirement": requirement, "priority": priority}

    def flow(alias, executions, top=False):
        return {"alias": alias, "providerId": "basic-flow", "topLevel": top, "builtIn": False, "authenticationExecutions": executions}

    def ref(alias, value):
        return {"alias": alias, "config": {"default.reference.value": value, "default.reference.maxAge": "300"}}

    def client(name, level):
        return {"clientId": name, "enabled": True, "publicClient": True, "fullScopeAllowed": False, "protocol": "openid-connect", "standardFlowEnabled": True, "directAccessGrantsEnabled": False,
                "redirectUris": [base + "/callback"], "defaultClientScopes": ["profile", "email", "acr"],
                "attributes": {"pkce.code.challenge.method": "S256", "default.acr.values": str(level), "minimum.acr.value": str(level)},
                "protocolMappers": [{"name": "amr", "protocol": "openid-connect", "protocolMapper": "oidc-amr-mapper", "config": {"id.token.claim": "true", "access.token.claim": "true"}}]}

    return {"realm": REALM, "enabled": True, "sslRequired": "external", "registrationAllowed": False, "resetPasswordAllowed": False, "browserFlow": "p0-stepup",
            "attributes": {"acr.loa.map": json.dumps({"1": 1, "2": 2})},
            "otpPolicyType": "totp", "otpPolicyAlgorithm": "HmacSHA1", "otpPolicyDigits": 6, "otpPolicyPeriod": PERIOD, "otpPolicyLookAheadWindow": 0, "otpPolicyCodeReusable": False,
            "bruteForceProtected": True, "permanentLockout": False, "failureFactor": 3, "waitIncrementSeconds": 60, "maxFailureWaitSeconds": 60, "minimumQuickLoginWaitSeconds": 1, "quickLoginCheckMilliSeconds": 0,
            "eventsEnabled": True, "eventsListeners": ["jboss-logging"],
            "requiredActions": [{"alias": "CONFIGURE_TOTP", "providerId": "CONFIGURE_TOTP", "enabled": True, "defaultAction": False, "priority": 10, "config": {"add-recovery-codes": "true"}},
                                {"alias": "CONFIGURE_RECOVERY_AUTHN_CODES", "providerId": "CONFIGURE_RECOVERY_AUTHN_CODES", "enabled": True, "defaultAction": False, "priority": 20}],
            "authenticatorConfig": [{"alias": "loa1", "config": {"loa-condition-level": "1", "loa-max-age": "36000"}},
                                    {"alias": "loa2", "config": {"loa-condition-level": "2", "loa-max-age": "0"}},
                                    {"alias": "fallback", "config": {"flow_to_check": "p0-second-factor", "check_result": "not-executed"}},
                                    ref("password-ref", "pwd"), ref("otp-ref", "otp"), ref("recovery-ref", "recovery")],
            "authenticationFlows": [flow("p0-stepup", [execution("auth-cookie", "ALTERNATIVE"), sub("p0-forms", "ALTERNATIVE", 20)], True),
                flow("p0-forms", [sub("p0-loa1", "CONDITIONAL", 10), sub("p0-loa2", "CONDITIONAL", 20)]),
                flow("p0-loa1", [execution("conditional-level-of-authentication", config="loa1"), execution("auth-username-password-form", priority=20, config="password-ref")]),
                flow("p0-loa2", [execution("conditional-level-of-authentication", config="loa2"), sub("p0-second-factor", "CONDITIONAL", 20), sub("p0-enforce-setup", "CONDITIONAL", 30)]),
                flow("p0-second-factor", [execution("conditional-user-configured"), execution("auth-otp-form", "ALTERNATIVE", 20, "otp-ref"), execution("auth-recovery-authn-code-form", "ALTERNATIVE", 30, "recovery-ref")]),
                flow("p0-enforce-setup", [execution("conditional-sub-flow-executed", config="fallback"), execution("auth-otp-form", priority=20, config="otp-ref")])],
            "clients": [client("mfa-low", 1), client("mfa-high", 2)],
            "users": [{"username": name, "enabled": True, "emailVerified": True, "email": name + "@example.invalid", "firstName": "P0", "lastName": name,
                       "credentials": [{"type": "password", "value": password, "temporary": False}]} for name, password in passwords.items()]}


def verify_id_token(token, flow, jwks):
    header_segment, payload_segment, signature_segment = token.split(".")
    def decode(value):
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    header = json.loads(decode(header_segment))
    claims = json.loads(decode(payload_segment))
    require(header.get("alg") == "RS256", "Unexpected JWT algorithm")
    key = next(k for k in jwks["keys"] if k["kid"] == header["kid"] and k.get("use") == "sig")
    public_key = rsa.RSAPublicNumbers(int.from_bytes(decode(key["e"]), "big"), int.from_bytes(decode(key["n"]), "big")).public_key()
    public_key.verify(decode(signature_segment), (header_segment + "." + payload_segment).encode(), padding.PKCS1v15(), hashes.SHA256())
    require(claims.get("iss") == flow.base + f"/realms/{REALM}" and claims.get("aud") == flow.client, "JWT issuer/audience mismatch")
    require(claims.get("exp", 0) > time.time() and claims.get("nonce") == flow.nonce, "JWT expiry/nonce invalid")
    return claims


def main():
    run_id = uuid.uuid4().hex[:10]
    output = OUTPUT / run_id
    output.mkdir(parents=True)
    scratch = Path(tempfile.mkdtemp(prefix="nexora-p0-mfa-"))
    prefix, owned, secret_files = "nexora-p0-mfa-" + run_id, [], []
    proxy, network, previous_ca = None, False, os.environ.get("REQUESTS_CA_BUNDLE")
    passwords = {name: secrets.token_urlsafe(24) for name in ["enroll", "normal", "invalid", "timewindow", "race", "recovery", "rebind", "locked", "stepup", "unbound"]}
    report = {"checkedAtUtc": datetime.now(timezone.utc).isoformat(), "status": "running", "runId": run_id, "keycloakVersion": "26.8.2", "cases": [],
              "harnessSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "sharedHarnessSha256": hashlib.sha256(Path(shared.__file__).read_bytes()).hexdigest(),
              "evidenceDirectory": str(output.relative_to(ROOT)), "scratchDirectory": str(scratch), "pythonPackages": {p: version(p) for p in ["requests", "cryptography"]},
              "limitations": ["Local HTTP integration probe; no phone authenticator, WebAuthn, Google or ERP/BFF acceptance",
                              "Recovery rotation includes explicit controlled administrator revocation, not a completed self-service recovery product",
                              "No network partition, full cache loss, production clock drift or external support identity-proofing acceptance"]}

    def save():
        data = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        (output / "result.json").write_text(data, encoding="utf-8")
        (OUTPUT / "result.json").write_text(data, encoding="utf-8")

    def record(name, evidence):
        report["cases"].append({"name": name, "status": "passed", "evidence": evidence})
        save()
        print("PASS " + name, flush=True)

    def envfile(name, data):
        path = scratch / name
        path.write_text("".join(f"{k}={v}\n" for k, v in data.items()), encoding="utf-8")
        secret_files.append(path)
        return path

    def container(suffix, image, options, command=()):
        name = prefix + "-" + suffix
        docker("run", "-d", "--name", name, "--label", "nexora.p0.mfa.run=" + run_id, "--network", prefix, *options, image, *command)
        owned.append(name)
        return name

    def port(name):
        ports = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Ports}}", name))
        return "http://127.0.0.1:" + ports["8080/tcp"][0]["HostPort"]

    try:
        save()
        test_secret = base64.b32encode(b"12345678901234567890").decode()
        require(totp(test_secret, 59, 8) == "94287082" and totp(test_secret, 1111111109, 8) == "07081804", "RFC6238 generator vector failed")
        record("rfc6238-generator-vectors", "Two published SHA1 8-digit reference vectors passed; server policy is 6 digits / 30 seconds")
        image = prefix + ":probe"
        build = subprocess.run(["docker", "build", "-t", image, str(Path(__file__).with_name("keycloak-mfa"))], capture_output=True, encoding="utf-8", errors="replace", timeout=300)
        (output / "image-build.log").write_text(build.stdout + build.stderr, encoding="utf-8")
        require(build.returncode == 0, "MFA image build failed")
        report["images"] = {key: json.loads(docker("image", "inspect", "--format", "{{json .RepoDigests}}", value)) for key, value in shared.IMAGE_BASELINE.items() if key in ["keycloak", "postgres"]}
        report["builtImageId"] = docker("image", "inspect", "--format", "{{.Id}}", image)
        docker("network", "create", "--label", "nexora.p0.mfa.run=" + run_id, prefix)
        network = True
        db_password, admin_password = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        pg = container("db", shared.POSTGRES, ["--network-alias", "database", "--memory=512m", "--env-file", envfile("postgres.env", {"POSTGRES_USER": "keycloak", "POSTGRES_DB": "keycloak", "POSTGRES_PASSWORD": db_password})])
        wait_until(lambda: subprocess.run(["docker", "exec", pg, "pg_isready", "-U", "keycloak"], capture_output=True).returncode == 0)
        tls_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Nexora P0 MFA loopback")])
        now = datetime.now(timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(tls_key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(days=1))
                .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
                .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True).sign(tls_key, hashes.SHA256()))
        key_path, cert_path = scratch / "loopback.key", scratch / "loopback.crt"
        key_path.write_bytes(tls_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        secret_files.append(key_path)
        cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        os.environ["REQUESTS_CA_BUNDLE"] = str(cert_path)
        proxy = ThreadingHTTPServer(("127.0.0.1", 0), Proxy)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(cert_path, key_path)
        proxy.socket = tls.wrap_socket(proxy.socket, server_side=True)
        threading.Thread(target=proxy.serve_forever, daemon=True).start()
        base = f"https://127.0.0.1:{proxy.server_port}"
        config = realm_config(base, passwords)
        realm_path = scratch / "realm.json"
        realm_path.write_text(json.dumps(config), encoding="utf-8")
        secret_files.append(realm_path)
        # Archive a redacted configuration: never persist temporary passwords or TOTP/recovery secrets.
        public_config = json.loads(json.dumps(config))
        for user in public_config["users"]:
            user["credentials"][0]["value"] = "[REDACTED]"
        (output / "realm-redacted.json").write_text(json.dumps(public_config, indent=2), encoding="utf-8")
        kc_env = envfile("keycloak.env", {"KC_DB": "postgres", "KC_DB_URL": "jdbc:postgresql://database:5432/keycloak", "KC_DB_USERNAME": "keycloak", "KC_DB_PASSWORD": db_password,
            "KC_BOOTSTRAP_ADMIN_USERNAME": "p0-admin", "KC_BOOTSTRAP_ADMIN_PASSWORD": admin_password, "KC_HOSTNAME": base, "KC_HTTP_ENABLED": "true", "KC_PROXY_HEADERS": "xforwarded", "JAVA_OPTS_KC_HEAP": "-Xms128m -Xmx512m"})
        nodes = []
        for suffix in ["a", "b"]:
            options = ["--env-file", kc_env, "--memory=1g", "--cpus=2", "-p", "127.0.0.1::8080"]
            command = ["start", "--optimized", "--cache=ispn", "--cache-stack=jdbc-ping"]
            if suffix == "a":
                options += ["--mount", f"type=bind,source={realm_path},target=/opt/keycloak/data/import/realm.json,readonly"]
                command += ["--import-realm"]
            node = container(suffix, image, options, command)
            nodes.append(node)
            shared.BACKENDS.append(port(node))
            def ready():
                require(docker("inspect", "--format", "{{.State.Status}}", node) != "exited", "Keycloak exited during bootstrap; inspect node log")
                return requests.get(shared.BACKENDS[-1] + f"/realms/{REALM}/.well-known/openid-configuration", timeout=3).status_code == 200
            wait_until(ready)
        wait_until(lambda: all(re.search(r"\(2\)\s*\[", docker("logs", node)) for node in nodes), seconds=90)
        record("fixed-version-two-node-mfa", "Built-in TOTP / recovery-codes:v1 / step-up:v1 loaded; two-member JDBC_PING cluster")
        admin = {}
        def admin_call(method, path, **kwargs):
            if time.monotonic() - admin.get("at", -99999) > 25:
                response = requests.post(base + "/realms/master/protocol/openid-connect/token", data={"client_id": "admin-cli", "grant_type": "password", "username": "p0-admin", "password": admin_password}, timeout=20)
                require(response.status_code == 200, "Local admin bootstrap failed")
                admin.update(token=response.json()["access_token"], at=time.monotonic())
            response = requests.request(method, base + f"/admin/realms/{REALM}/" + path, headers={"Authorization": "Bearer " + admin["token"]}, timeout=20, **kwargs)
            require(response.status_code < 400, f"Local admin operation failed: {method} ({response.status_code})")
            return response

        ids = {u["username"]: u["id"] for u in admin_call("GET", "users", params={"max": 100}).json()}
        executions = admin_call("GET", "authentication/flows/p0-second-factor/executions").json()
        Flow.recovery_execution = next(e["id"] for e in executions if e.get("providerId") == "auth-recovery-authn-code-form" or e.get("displayName") == "Recovery Authentication Code Form")
        Flow.totp_execution = next(e["id"] for e in executions if e.get("providerId") == "auth-otp-form" or e.get("displayName") == "OTP Form")
        def credentials(name):
            return admin_call("GET", f"users/{ids[name]}/credentials").json()
        jwks = requests.get(base + f"/realms/{REALM}/protocol/openid-connect/certs", timeout=10).json()
        seeds, backups = {}, {}

        def login(name, **kwargs):
            flow = Flow(base, **kwargs)
            flow.password(name, passwords[name])
            return flow

        flow = login("enroll")
        require(flow.forms.with_field("totpSecret") and not success(flow.response), f"Unbound user did not reach setup (HTTP {flow.response.status_code}; fields {sorted(set().union(*(f['names'] for f in flow.forms.forms)))})")
        record("unbound-user-must-enroll", "A valid password alone reaches mandatory TOTP enrollment, not authorization")
        form = flow.forms.with_field("totpSecret")
        secret = base64.b32encode(form["fields"]["totpSecret"].encode()).decode()
        bad = "000000" if totp(secret) != "000000" else "111111"
        rejected(flow.post(form, {"totp": bad, "userLabel": "P0"}, node=2))
        require(not any(c["type"] == "otp" for c in credentials("enroll")), "Invalid enrollment persisted a TOTP credential")
        record("invalid-enrollment-not-persisted", "Wrong setup code rejected; admin credential listing confirms no OTP stored")
        seeds["enroll"] = flow.setup()
        backups["enroll"] = flow.recovery_setup()
        require(success(flow.response), "Setup did not complete")
        flow.tokens()
        require({"otp", "recovery-authn-codes"}.issubset({c["type"] for c in credentials("enroll")}), "Second-factor credentials missing")
        record("totp-and-recovery-enrollment", "TOTP confirmed and 12 sequential recovery codes generated/acknowledged through required-action forms")

        for username in passwords:
            if username in ["enroll", "unbound"]:
                continue
            flow = login(username)
            seeds[username] = flow.setup()
            backups[username] = flow.recovery_setup()
            require(success(flow.response), "Fixture enrollment failed")

        flow = Flow(base)
        rejected(flow.password("normal", "incorrect-password"))
        require(flow.forms.with_field("password"), "Wrong password reached second factor")
        record("first-factor-required", "Wrong password cannot proceed to the independent TOTP challenge")
        flow = login("normal")
        require(flow.forms.with_field("otp") and not success(flow.response), "Password-only authentication succeeded")
        rejected(flow.otp(""))
        record("missing-second-factor-rejected", "Password plus empty TOTP cannot obtain an authorization result")
        value = fresh_code(seeds["normal"])
        require(success(flow.otp(value)), "Valid TOTP failed")
        id_token = flow.tokens()["id_token"]
        claims = verify_id_token(id_token, flow, jwks)
        require(str(claims.get("acr")) == "2" and {"pwd", "otp"}.issubset(set(claims.get("amr", []))), "Verified MFA claims missing")
        record("password-totp-cross-node-signed-claims", {"acr": claims["acr"], "amr": claims["amr"], "signature": "RS256 verified with trusted realm JWKS", "nonceIssuerAudienceExpiry": "checked"})
        parts = id_token.split(".")
        tampered = dict(claims, acr="9")
        try:
            verify_id_token(parts[0] + "." + encode(json.dumps(tampered).encode()) + "." + parts[2], flow, jwks)
        except InvalidSignature:
            pass
        else:
            raise AssertionError("Tampered assurance claim passed signature verification")
        record("tampered-assurance-claim-rejected", "Changing the JWT ACR without the realm signing key fails cryptographic verification")

        again = login("normal")
        rejected(again.otp(value, node=1))
        record("totp-time-step-reuse-rejected", "A previously accepted TOTP is rejected in a fresh authentication session on the other node")
        flow = login("invalid")
        rejected(flow.otp("12x456"))
        require(flow.forms.with_field("otp"), "Invalid TOTP response lost challenge")
        record("malformed-totp-rejected", "Direct HTTP submission with non-digit TOTP is rejected server-side")
        flow = login("timewindow")
        rejected(flow.otp(totp(seeds["timewindow"], time.time() - 120)))
        rejected(flow.otp(totp(seeds["timewindow"], time.time() + 120)))
        record("stale-and-future-totp-rejected", "Codes four time steps away are rejected with look-ahead window 0")

        one, two = login("race"), login("race")
        code = fresh_code(seeds["race"])
        gate = threading.Barrier(2)
        def race(pair):
            flow, node = pair
            gate.wait(timeout=10)
            return flow.otp(code, node)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(race, [(one, 1), (two, 2)]))
        require(sum(success(r) for r in results) == 1 and all(r.status_code < 500 for r in results), "Cross-node TOTP consumption was not single-use")
        record("totp-cross-node-race", {"successfulAuthorizations": 1, "responses": [r.status_code for r in results]})

        flow = login("recovery")
        flow.recovery()
        rejected(flow.recovery_code("not-a-recovery-code"))
        require(success(flow.recovery_code(backups["recovery"][0])), "Recovery code failed")
        claims = verify_id_token(flow.tokens()["id_token"], flow, jwks)
        require(str(claims.get("acr")) == "2" and {"pwd", "recovery"}.issubset(set(claims.get("amr", []))), "Recovery MFA claims missing")
        record("lost-device-recovery-code", "Password plus the next sequential offline recovery code completes level 2 without the TOTP device")
        flow = login("recovery")
        flow.recovery()
        rejected(flow.recovery_code(backups["recovery"][0], node=1))
        require(success(flow.recovery_code(backups["recovery"][1])), "Next recovery code not usable after replay rejection")
        record("recovery-replay-rejected-next-code-valid", "Consumed recovery code rejected on a fresh form; next code succeeds")

        flow = login("recovery", kc_action="CONFIGURE_RECOVERY_AUTHN_CODES")
        flow.recovery()
        flow.recovery_code(backups["recovery"][2])
        new_backups = flow.recovery_setup()
        require(success(flow.response), "Recovery regeneration failed")
        flow = login("recovery")
        flow.recovery()
        rejected(flow.recovery_code(backups["recovery"][3]))
        require(success(flow.recovery_code(new_backups[0])), "New recovery code unusable")
        record("recovery-regeneration-revokes-old-set", "Re-authenticated AIA replaces recovery set; an unused old code fails and a new code works")

        old_credential = next(c for c in credentials("rebind") if c["type"] == "otp")
        old_secret = seeds["rebind"]
        attempt = login("rebind", kc_action="CONFIGURE_TOTP")
        require(attempt.forms.with_field("otp") and not attempt.forms.with_field("totpSecret"), "Password-only AIA bypassed the existing second factor")
        rejected(attempt.otp(""))
        require(not attempt.forms.with_field("totpSecret"), "Empty second factor revealed a replacement enrollment seed")
        record("rebind-requires-existing-second-factor", "Knowing only the password cannot enter replacement-device enrollment")
        flow = login("rebind", kc_action="CONFIGURE_TOTP")
        flow.recovery()
        flow.recovery_code(backups["rebind"][0])
        new_secret = flow.setup("P0 replacement device")
        require(success(flow.response), "Replacement-device enrollment did not finish")
        require(len([c for c in credentials("rebind") if c["type"] == "otp"]) == 2, "Expected old and replacement devices before revocation")
        admin_call("DELETE", f"users/{ids['rebind']}/credentials/{old_credential['id']}")
        admin_call("POST", f"users/{ids['rebind']}/logout")
        revoked = Flow(base, client="mfa-low", session=flow.session, prompt="none", node=2)
        rejected(revoked.response)
        revoke_error = parse_qs(urlsplit(revoked.response.headers.get("Location", "")).query).get("error", [])
        require(revoke_error == ["login_required"], "Revoked SSO cookie still allowed silent authorization")
        flow = login("rebind")
        rejected(flow.otp(totp(old_secret)))
        require(success(flow.otp(fresh_code(new_secret))), "Replacement device did not authenticate")
        record("device-rebind-old-device-revoked", "Password + recovery proof -> new TOTP confirmation -> explicit administrator revocation of old device and sessions -> old SSO cookie prompt=none returned login_required -> old code rejected/new code accepted")

        flow = login("locked")
        for _ in range(3):
            rejected(flow.otp("000000" if totp(seeds["locked"]) != "000000" else "111111"))
        wait_until(lambda: admin_call("GET", f"attack-detection/brute-force/users/{ids['locked']}").json().get("disabled"), seconds=15)
        flow = Flow(base, node=2)
        rejected(flow.password("locked", passwords["locked"], node=2))
        require(not flow.forms.with_field("otp"), "Temporary lock bypassed on second node")
        record("cross-node-brute-force-lock", "Three invalid TOTP submissions trigger a temporary account lock; correct first factor on node B cannot bypass it")

        low = login("stepup", client="mfa-low", acr_values="1")
        low_claims = verify_id_token(low.tokens()["id_token"], low, jwks)
        require(str(low_claims.get("acr")) == "1", "Low assurance fixture did not reach level 1")
        high = Flow(base, session=low.session, acr_values="1", node=2)
        require(high.forms.with_field("otp") and not success(high.response), "Low SSO/request parameter downgraded mandatory MFA")
        rejected(high.otp(""))
        high.otp(fresh_code(seeds["stepup"]))
        high_claims = verify_id_token(high.tokens()["id_token"], high, jwks)
        require(str(high_claims.get("acr")) == "2", "Step-up did not reach level 2")
        record("sso-step-up-and-downgrade-prevention", "Existing level-1 SSO still challenges TOTP; high client's minimum ACR 2 overrides acr_values=1")
        silent = Flow(base, session=low.session, prompt="none", acr_values="1")
        rejected(silent.response)
        silent_error = parse_qs(urlsplit(silent.response.headers.get("Location", "")).query).get("error", [])
        require(silent_error and silent_error[0] in ["interaction_required", "login_required"], "Silent fresh-MFA request did not fail with interaction error")
        fresh = Flow(base, session=low.session)
        require(fresh.forms.with_field("otp"), "MFA max-age=0 did not demand a new challenge")
        record("fresh-mfa-and-silent-auth-denial", "LoA2 max-age=0 forces each new high-assurance authorization to challenge; prompt=none cannot mint tokens")
        require(int(low_claims["acr"]) < 2 and int(high_claims["acr"]) >= 2, "Assurance predicate failed")
        record("verified-assurance-boundary", "Only cryptographically verified level-2 claims meet the local BFF assurance predicate; no production business API implemented")
        report["status"] = "passed"
    except Exception as error:
        report.update(status="failed", error=str(error))
        raise
    finally:
        report["cleanup"] = {"containers": [], "networkRemoved": False, "ephemeralSecretFilesRemoved": True}
        for name in reversed(owned):
            try:
                text = subprocess.run(["docker", "logs", name], capture_output=True, encoding="utf-8", errors="replace", timeout=15)
                log = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED-JWT]", text.stdout + text.stderr)
                log = re.sub(r"Code '[^']+'", "Code '[REDACTED-CODE]'", log)
                (output / (name.rsplit("-", 1)[1] + ".log")).write_text(log, encoding="utf-8")
                require(docker("inspect", "--format", '{{index .Config.Labels "nexora.p0.mfa.run"}}', name) == run_id, "Container ownership mismatch")
                docker("rm", "-f", "-v", name, timeout=40)
                report["cleanup"]["containers"].append({"name": name, "removed": True})
            except Exception as error:
                report["cleanup"]["containers"].append({"name": name, "removed": False, "error": str(error)})
        if network:
            try:
                docker("network", "rm", prefix)
                report["cleanup"]["networkRemoved"] = True
            except Exception as error:
                report["cleanup"]["networkError"] = str(error)
        if proxy:
            proxy.shutdown()
            proxy.server_close()
        if previous_ca is None:
            os.environ.pop("REQUESTS_CA_BUNDLE", None)
        else:
            os.environ["REQUESTS_CA_BUNDLE"] = previous_ca
        for path in secret_files:
            try:
                require(path.parent.resolve() == scratch, "Secret file escaped scratch directory")
                path.unlink(missing_ok=True)
            except Exception:
                report["cleanup"]["ephemeralSecretFilesRemoved"] = False
        if report["status"] == "passed" and (not report["cleanup"]["networkRemoved"] or not report["cleanup"]["ephemeralSecretFilesRemoved"] or any(not c["removed"] for c in report["cleanup"]["containers"])):
            report.update(status="failed", error="Probe cleanup incomplete")
        report["finishedAtUtc"] = datetime.now(timezone.utc).isoformat()
        save()
    print(json.dumps({"status": report["status"], "cases": len(report["cases"]), "runId": run_id}))


if __name__ == "__main__":
    main()
