"""In-memory SMTP sink for the isolated probe network. Never relays mail."""
import json
import os
import socketserver
import threading
from email import policy
from email.parser import Parser
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
MESSAGES = []
FAIL = False
DROP_REPLY = False


class Smtp(socketserver.StreamRequestHandler):
    def handle(self):
        def say(value):
            self.wfile.write((value + "\r\n").encode())
            self.wfile.flush()
        say("220 p0-sink ESMTP")
        recipient = ""
        while line := self.rfile.readline(8192):
            command = line.decode(errors="replace").strip()
            verb = command.split(" ")[0].upper()
            if verb in ["EHLO", "HELO"]:
                say("250 p0-sink")
            elif verb == "RCPT":
                recipient = command.split(":", 1)[1].strip(" <>")
                say("250 OK")
            elif verb == "DATA":
                say("354 End with dot")
                content = []
                while (part := self.rfile.readline(8192)) not in [b".\r\n", b".\n", b""]:
                    content.append(part)
                with LOCK:
                    fail = FAIL
                    drop_reply = DROP_REPLY
                    if not fail:
                        MESSAGES.append({"recipient": recipient, "body": b"".join(content).decode(errors="replace")})
                if drop_reply:
                    return
                say("451 Local simulated failure" if fail else "250 Captured locally")
            elif verb == "QUIT":
                say("221 Bye")
                return
            else:
                say("250 OK")


class Api(BaseHTTPRequestHandler):
    def do_GET(self):
        with LOCK:
            messages = list(MESSAGES)
        if self.path == "/inbox":
            articles = []
            for entry in reversed(messages):
                message = Parser(policy=policy.default).parsestr(entry["body"])
                body = message.get_body(preferencelist=("plain",))
                text = body.get_content() if body else ""
                articles.append(f'<article><h2>{escape(str(message.get("Subject", "")))}</h2>'
                                f'<p>{escape(entry["recipient"])}</p><pre>{escape(text)}</pre></article>')
            data = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
                    '<title>Nexora 本地收件箱</title><h1>Nexora 本地收件箱</h1>' + ''.join(articles) + '</html>').encode()
            content_type = "text/html; charset=utf-8"
        else:
            data = json.dumps(messages).encode()
            content_type = "application/json"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        global FAIL, DROP_REPLY
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        with LOCK:
            FAIL = bool(data.get("fail"))
            DROP_REPLY = bool(data.get("dropReply"))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


host = os.getenv("NEXORA_SMTP_SINK_HOST", "0.0.0.0")
smtp_port = int(os.getenv("NEXORA_SMTP_SINK_PORT", "2525"))
api_port = int(os.getenv("NEXORA_SMTP_SINK_API_PORT", "8025"))
threading.Thread(target=Server((host, smtp_port), Smtp).serve_forever, daemon=True).start()
ThreadingHTTPServer((host, api_port), Api).serve_forever()
