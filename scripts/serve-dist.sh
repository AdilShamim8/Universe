#!/usr/bin/env bash
# Minimal static server for e2e over apps/web/dist.
# Serves with 404.html fallback; port configurable via UNIVERSE_E2E_PORT.
set -eu
DIR="$(cd "$(dirname "$0")/../apps/web/dist" && pwd)"
PORT="${UNIVERSE_E2E_PORT:-4173}"
exec python3 - "$DIR" "$PORT" <<'PY'
import http.server, socketserver, sys, os
directory, port = sys.argv[1], int(sys.argv[2])
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and not path.startswith("/pagefind"):
            return os.path.join(directory, "404.html")
        return p
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
os.chdir(directory)
with socketserver.ThreadingTCPServer(("127.0.0.1", port), H) as s:
    s.serve_forever()
PY
