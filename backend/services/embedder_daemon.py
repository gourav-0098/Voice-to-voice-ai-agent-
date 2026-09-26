"""
Persistent In-Memory Embedding Daemon for Voice AI RAG.
Runs a local, zero-dependency HTTP server on port 5005.
Keeps 'all-MiniLM-L6-v2' preloaded in GPU/RAM for sub-10ms query embeddings.
"""

import sys
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from sentence_transformers import SentenceTransformer

PORT = 5005
MODEL_NAME = "all-MiniLM-L6-v2"

print(f"🚀 [EMBEDDER DAEMON] Loading model '{MODEL_NAME}' into memory...")
t0 = time.time()
model = SentenceTransformer(MODEL_NAME)
# Warm-up inference
model.encode("warmup")
print(f"✅ [EMBEDDER DAEMON] Model preloaded in {time.time() - t0:.2f}s. Ready on http://127.0.0.1:{PORT}")


class EmbedHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence default request logs to prevent console noise
        pass

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ready", "model": MODEL_NAME, "dimension": 384}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/embed":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                data = json.loads(body)
                text = data.get("text", "").strip()

                if not text:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b'{"error": "Empty text provided"}')
                    return

                t_start = time.time()
                vector = model.encode(text).tolist()
                duration_ms = (time.time() - t_start) * 1000

                response_bytes = json.dumps({
                    "vector": vector,
                    "dimension": len(vector),
                    "latency_ms": round(duration_ms, 2)
                }).encode("utf-8")

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(response_bytes)))
                self.end_headers()
                self.wfile.write(response_bytes)

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()


def run():
    server = HTTPServer(("127.0.0.1", PORT), EmbedHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping embedder daemon...")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
