"""Serve the fixed public workstation and verify completion without returning secrets."""
from hashlib import sha256
from hmac import compare_digest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json, os
ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
EXPECTED = (ROOT / 'completion.sha256').read_text(encoding='ascii').strip()
if len(EXPECTED) != 64 or any(c not in '0123456789abcdef' for c in EXPECTED):
    raise RuntimeError('Invalid completion configuration')
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()
    def list_directory(self, path):
        self.send_error(404)
        return None
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404)
            return
        super().do_GET()
    def do_HEAD(self):
        path = unquote(urlsplit(self.path).path)
        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404)
            return
        super().do_HEAD()
    def do_POST(self):
        if urlsplit(self.path).path != '/api/completion':
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 1 or size > 512 or self.headers.get_content_type() != 'application/json':
                raise ValueError('Invalid request')
            payload = json.loads(self.rfile.read(size))
            candidate = payload.get('flag') if isinstance(payload, dict) else None
            if not isinstance(candidate, str) or len(candidate) > 128:
                raise ValueError('Invalid flag value')
        except (ValueError, TypeError, UnicodeDecodeError):
            self.send_error(400)
            return
        valid = compare_digest(sha256(candidate.encode('utf-8')).hexdigest(), EXPECTED)
        body = json.dumps({'valid': valid}, separators=(',', ':')).encode('ascii')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler).serve_forever()
