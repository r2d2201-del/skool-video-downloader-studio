#!/usr/bin/env python3
"""
Skool Video Downloader - Download Utility Script
Executes yt-dlp with optimized headers, concurrent fragments, and clean title naming for Skool.com videos.
"""

import argparse
import os
import re
import subprocess
import sys

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
REFERER = "https://www.skool.com"

def sanitize_filename(name: str) -> str:
    """Sanitize title string for filesystem paths."""
    clean = re.sub(r'[^\w\s-]', '', name).strip()
    return re.sub(r'[-\s]+', '_', clean) or "skool_video"

def build_ytdlp_command(url: str, output_dir: str = ".", title: str = None, concurrent_fragments: int = 10, use_cookies: bool = False) -> list:
    os.makedirs(os.path.expanduser(output_dir), exist_ok=True)
    
    if title:
        safe_title = sanitize_filename(title)
        out_template = os.path.join(os.path.expanduser(output_dir), f"{safe_title}.%(ext)s")
    else:
        out_template = os.path.join(os.path.expanduser(output_dir), "%(title)s.%(ext)s")

    cmd = [
        "yt-dlp",
        "--add-header", f"Referer: {REFERER}",
        "--user-agent", USER_AGENT,
        "--output", out_template,
        "--no-playlist",
    ]

    # For HLS streams (.m3u8), add concurrency
    if ".m3u8" in url or "fastly.video.skool.com" in url or "stream.video.skool.com" in url:
        cmd.extend(["--concurrent-fragments", str(concurrent_fragments)])

    if use_cookies:
        cmd.extend(["--cookies-from-browser", "chrome"])

    cmd.append(url)
    return cmd

def download_video(url: str, output_dir: str = ".", title: str = None, concurrent_fragments: int = 10, use_cookies: bool = False) -> int:
    cmd = build_ytdlp_command(url, output_dir, title, concurrent_fragments, use_cookies)
    print(f"🎬 Executing yt-dlp command:\n{' '.join(cmd)}\n")
    try:
        process = subprocess.run(cmd)
        if process.returncode == 0:
            print("\n✅ Video downloaded successfully!")
        else:
            print(f"\n❌ Error: yt-dlp exited with return code {process.returncode}")
            if "403" in str(process.stderr or ""):
                print("💡 Hint: If you received a 403 Forbidden, the stream token may have expired. Refresh the page in your browser to get a new signed URL.")
        return process.returncode
    except FileNotFoundError:
        print("❌ Error: 'yt-dlp' executable was not found in your PATH.")
        print("💡 Install it via: brew install yt-dlp (macOS) or pip install yt-dlp")
        return 1

def main():
    parser = argparse.ArgumentParser(description="Download videos from Skool.com using yt-dlp with optimized headers.")
    parser.add_argument("--url", "-u", required=True, help="Video URL or signed .m3u8 stream URL")
    parser.add_argument("--output-dir", "-o", default="./downloads", help="Output directory path (default: ./downloads)")
    parser.add_argument("--title", "-t", default=None, help="Custom video title/filename")
    parser.add_argument("--concurrent-fragments", "-c", type=int, default=10, help="Number of concurrent fragments for HLS (default: 10)")
    parser.add_argument("--use-cookies", action="store_true", help="Use session cookies from Chrome browser")

    args = parser.parse_args()
    code = download_video(args.url, args.output_dir, args.title, args.concurrent_fragments, args.use_cookies)
    sys.exit(code)

if __name__ == "__main__":
    main()
