#!/usr/bin/env python3
"""
Skool Downloader - Local Background Companion Server (v2.1.1)
Allows the Chrome extension to trigger 1-click high-speed MP4 downloads in background without terminal commands.
"""

import json
import os
import re
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 4545
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def sanitize(name):
    return re.sub(r'[^\w\s-]', '', name or 'skool_video').strip().replace(' ', '_')

def resolve_target_dir(folder_name):
    # Try ~/Downloads first, fallback to project ./downloads
    home_downloads = os.path.expanduser("~/Downloads")
    candidate = os.path.join(home_downloads, folder_name)
    try:
        os.makedirs(candidate, exist_ok=True)
        return candidate
    except Exception:
        fallback = os.path.join(BASE_DIR, "downloads", folder_name)
        os.makedirs(fallback, exist_ok=True)
        return fallback

class DownloaderHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == '/status':
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "online",
                "version": "2.1.1",
                "ytdlp": True
            }).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/download':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                url = data.get('url')
                title = data.get('title') or 'Skool_Video'
                folder = data.get('folder') or 'Skool_Downloads'
                
                if not url:
                    raise ValueError("No URL provided")

                target_dir = resolve_target_dir(folder)
                clean_title = sanitize(title)
                out_template = os.path.join(target_dir, f"{clean_title}.%(ext)s")

                # Optimal yt-dlp flags for Skool / YouTube / Fastly / Loom / Vimeo
                cmd = [
                    "yt-dlp",
                    "--no-check-certificate",
                    "--no-playlist",
                    "--referer", "https://www.skool.com",
                    "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
                    "--extractor-args", "youtube:player_client=ios,android,web",
                    "--concurrent-fragments", "10",
                    "-o", out_template,
                    url
                ]

                print(f"\n🚀 [Local Server] Starting download: {url}")
                print(f"📁 Destination: {target_dir}")

                subprocess.Popen(cmd)

                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "message": "Descarga iniciada en segundo plano",
                    "destination": target_dir,
                    "filename": f"{clean_title}.mp4"
                }).encode('utf-8'))

            except Exception as e:
                print(f"❌ [Local Server] Error: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": str(e)
                }).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    server = HTTPServer(('127.0.0.1', PORT), DownloaderHandler)
    print(f"⚡ [Skool Downloader Bridge] Server running on http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()

if __name__ == '__main__':
    run_server()
