import http.server
import socketserver
import os
import urllib.request
import shutil

PORT = 3000
BACKEND_URL = "http://localhost:8000"
DIST_DIR = os.path.join(os.path.dirname(__file__), "dist")

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        # Proxy /api requests to backend
        if self.path.startswith("/api") or self.path.startswith("/ws"):
            self.proxy_request()
            return

        # Serve static files or fallback to index.html
        path = self.translate_path(self.path)
        if os.path.exists(path) and os.path.isfile(path):
            super().do_GET()
        else:
            # Check if it's a file request (has extension) or a route
            # Ideally, we verify if it is a standard file extension. 
            # For now, if file doesn't exist, serve index.html
            self.serve_index()

    def proxy_request(self):
        url = f"{BACKEND_URL}{self.path}"
        try:
            req = urllib.request.Request(url, method=self.command)
            # Copy headers
            for header, value in self.headers.items():
                req.add_header(header, value)
            
            with urllib.request.urlopen(req) as response:
                self.send_response(response.status)
                for header, value in response.headers.items():
                    if header.lower() not in ['transfer-encoding', 'content-length']:
                        self.send_header(header, value)
                self.end_headers()
                shutil.copyfileobj(response, self.wfile)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_error(500, str(e))

    def serve_index(self):
        self.path = "/index.html"
        super().do_GET()
    
    # Handle POST/PUT/DELETE by proxying if it matches /api, else 405
    def do_POST(self):
        if self.path.startswith("/api"):
            self.proxy_request_with_body()
        else:
            self.send_error(405, "Method Not Allowed")

    def proxy_request_with_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        url = f"{BACKEND_URL}{self.path}"
        try:
            req = urllib.request.Request(url, data=body, method=self.command)
            for header, value in self.headers.items():
                if header.lower() != 'host':
                    req.add_header(header, value)
            
            with urllib.request.urlopen(req) as response:
                self.send_response(response.status)
                for header, value in response.headers.items():
                    if header.lower() not in ['transfer-encoding', 'content-length']:
                        self.send_header(header, value)
                self.end_headers()
                shutil.copyfileobj(response, self.wfile)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_error(500, str(e))

print(f"Starting server at http://localhost:{PORT}")
print(f"Serving content from {DIST_DIR}")
print(f"Proxying API to {BACKEND_URL}")

with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
    httpd.serve_forever()
