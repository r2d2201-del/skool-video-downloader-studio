#!/usr/bin/env python3
"""
Skool Batch Downloader Script Generator
Generates executable Bash (.sh) or Windows Batch (.bat) scripts for bulk video downloading.
"""

import argparse
import os
import sys

def generate_bash(urls: list, output_dir: str = "./downloads") -> str:
    urls_formatted = "\n".join([f'  "{u.strip()}"' for u in urls if u.strip()])
    return f"""#!/bin/bash
# ==============================================================================
# Skool Course Batch Downloader (Bash)
# Requirements: yt-dlp (brew install yt-dlp)
# ==============================================================================

OUTPUT_DIR="{output_dir}"
mkdir -p "$OUTPUT_DIR"

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"

echo "🚀 Iniciando descarga masiva de lecciones de Skool..."

declare -a URLS=(
{urls_formatted}
)

TOTAL=${{#URLS[@]}}
INDEX=1

for url in "${{URLS[@]}}"; do
  echo ""
  echo "🎬 [$INDEX/$TOTAL] Descargando: $url"
  
  yt-dlp \\
    --cookies-from-browser chrome \\
    --referer "https://www.skool.com" \\
    --user-agent "$UA" \\
    --concurrent-fragments 10 \\
    --output "$OUTPUT_DIR/%(autonumber)02d - %(title)s.%(ext)s" \\
    "$url"
    
  ((INDEX++))
done

echo ""
echo "✅ ¡Descargas completadas!"
"""

def generate_bat(urls: list, output_dir: str = "downloads") -> str:
    commands = []
    clean_urls = [u.strip() for u in urls if u.strip()]
    for i, u in enumerate(clean_urls, 1):
        commands.append(f'echo.\necho [{i}/{len(clean_urls)}] Descargando: {u}\nyt-dlp --cookies-from-browser chrome --referer "https://www.skool.com" --concurrent-fragments 10 -o "%OUTPUT_DIR%\\{str(i).zfill(2)} - %(title)s.%(ext)s" "{u}"')
    
    body = "\n".join(commands)
    return f"""@echo off
:: ==============================================================================
:: Skool Course Batch Downloader (Windows CMD/BAT)
:: Requirements: yt-dlp
:: ==============================================================================

set OUTPUT_DIR={output_dir}
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo ======================================================
echo  Iniciando descarga masiva de {len(clean_urls)} lecciones de Skool...
echo ======================================================

{body}

echo.
echo ======================================================
echo  Descargas completadas!
echo ======================================================
pause
"""

def main():
    parser = argparse.ArgumentParser(description="Generate executable batch scripts for Skool video downloading.")
    parser.add_argument("--urls-file", "-f", required=True, help="Path to text file containing URLs (one per line)")
    parser.add_argument("--format", choices=["bash", "bat"], default="bash", help="Target script format: bash (.sh) or bat (.bat)")
    parser.add_argument("--output-dir", default="./downloads", help="Destination folder for downloaded videos")
    parser.add_argument("--output-script", "-o", default=None, help="Output script file path")

    args = parser.parse_args()

    if not os.path.exists(args.urls_file):
        print(f"❌ Error: URLs file not found: {args.urls_file}")
        sys.exit(1)

    with open(args.urls_file, 'r', encoding='utf-8', errors='ignore') as f:
        urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]

    if args.format == "bash":
        content = generate_bash(urls, args.output_dir)
        out_name = args.output_script or "download_skool_course.sh"
    else:
        content = generate_bat(urls, args.output_dir)
        out_name = args.output_script or "download_skool_course.bat"

    with open(out_name, 'w', encoding='utf-8') as f:
        f.write(content)

    if args.format == "bash":
        os.chmod(out_name, 0o755)

    print(f"✅ Generated {args.format} script with {len(urls)} URLs: {out_name}")

if __name__ == "__main__":
    main()
