"""Authenticated, stateless Vercel Function for the existing CP-SAT solver."""
import hmac
import importlib.util
import json
import math
import os
from http.server import BaseHTTPRequestHandler
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "sai_group_solver", Path(__file__).resolve().parents[1] / "backend" / "group-solver.py"
)
solver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(solver)


def validate(data):
    if not isinstance(data, dict):
        raise ValueError("invalid input")
    count, group_count = data.get("count"), data.get("groupCount")
    candidates, hints = data.get("candidates"), data.get("hints", [])
    if type(count) is not int or not 3 <= count <= 30:
        raise ValueError("invalid participant count")
    if type(group_count) is not int or not 1 <= group_count <= 10:
        raise ValueError("invalid group count")
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 16000:
        raise ValueError("invalid candidates")
    for candidate in candidates:
        if not isinstance(candidate, dict):
            raise ValueError("invalid candidate")
        members = candidate.get("members")
        if not isinstance(members, list) or not 2 <= len(members) <= 5:
            raise ValueError("invalid members")
        if any(type(i) is not int or not 0 <= i < count for i in members) or len(set(members)) != len(members):
            raise ValueError("invalid members")
        for key in ("utility", "pairCoverage"):
            value = candidate.get(key)
            if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError("invalid score")
    if not isinstance(hints, list) or len(hints) > 3:
        raise ValueError("invalid hints")
    for hint in hints:
        if not isinstance(hint, list) or len(hint) != group_count:
            raise ValueError("invalid hint")
        if any(type(i) is not int or not 0 <= i < len(candidates) for i in hint):
            raise ValueError("invalid hint")
    return data


class handler(BaseHTTPRequestHandler):
    def respond(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        self.respond(405, {"error": "method not allowed"})

    def do_POST(self):
        token = os.environ.get("GROUP_SOLVER_TOKEN", "")
        if len(token) < 32:
            self.respond(503, {"error": "solver not configured"})
            return
        given = self.headers.get("Authorization", "")
        if not hmac.compare_digest(given.encode(), f"Bearer {token}".encode()):
            self.respond(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 3 * 1024 * 1024:
                self.respond(413, {"error": "invalid request size"})
                return
            data = validate(json.loads(self.rfile.read(length)))
        except (ValueError, TypeError):
            self.respond(400, {"error": "invalid optimization input"})
            return
        try:
            self.respond(200, solver.optimize(data))
        except Exception:
            self.respond(500, {"error": "optimization failed"})
