"""Serve the repo for tests/browser/pe900_batch.html and save the PES files it POSTs.

usage: .venv/bin/python tests/batch_server.py OUT_DIR [port]   then open http://127.0.0.1:8765/tests/browser/pe900_batch.html
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = sys.argv[1]


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        name = os.path.basename(unquote(self.path[len("/save/"):]))
        if not self.path.startswith("/save/") or not name.endswith(".pes"):
            self.send_error(404); return
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(self.rfile.read(int(self.headers["Content-Length"])))
        self.send_response(204); self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=ROOT)).serve_forever()
