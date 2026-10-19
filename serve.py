#!/usr/bin/env python3
"""Serve this folder's production build on this computer only.

Always serves *this* version: if this same folder is already being served it
just reopens that page instead of starting a second copy; if the port is taken
by something else (for example an older version) it moves to the next free
port; and it tells the browser not to cache, so Safari/Chrome never mix an
older island.glb with new code.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import threading
import urllib.request
import webbrowser

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=4173)
parser.add_argument('--open', action='store_true')
args = parser.parse_args()
here = Path(__file__).resolve().parent
root = here / 'dist'
if not (root / 'index.html').exists():
    raise SystemExit('Missing dist/index.html. Run pnpm install && pnpm build first.')


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path == '/__yunshui_folder__':
            body = str(here).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


def serving_this_folder(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/__yunshui_folder__', timeout=.4) as r:
            return r.read().decode() == str(here)
    except Exception:
        return False


for port in range(args.port, args.port + 20):
    if serving_this_folder(port):
        url = f'http://127.0.0.1:{port}/'
        print(f'云水仙洲（{here.name}）已在运行：{url}\n直接打开该页面，不再重复启动。', flush=True)
        if args.open:
            webbrowser.open(url)
        raise SystemExit(0)

server = None
for port in range(args.port, args.port + 20):
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), partial(NoCache, directory=str(root)))
        break
    except OSError:
        continue
if server is None:
    raise SystemExit('No free port between %d and %d.' % (args.port, args.port + 19))
url = f'http://127.0.0.1:{port}/'
print(f'云水仙洲（{here.name}）：{url}\n按 Ctrl+C 停止本机预览。', flush=True)
if port != args.port:
    print(f'端口 {args.port} 已被占用（可能是旧版本仍在运行），已改用 {port}。', flush=True)
if args.open:
    threading.Timer(.5, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
