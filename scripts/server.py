#!/usr/bin/env python3
"""
Skool Downloader - Local Background Companion Server (v2.3.3)
Features:
- Native Mux & Fastly Signed HLS Stream Resolver (1080p Full HD)
- Course Resource Scanner API (/scan-course-resources) to aggregate all Figma, Drive, PDFs across course
- Verified Google Drive Uploader with Auto-Retry & Existence Validation
- Course Auditor API (/audit-course) to cross-check Drive files against lesson list
- Live Queue Feedback (/queue-status) with per-item progress and Direct Drive link
- Thread-safe Google Drive Folder Hierarchy Synchronization (0 Root Leaks)
"""

import json
import os
import re
import ssl
import sys
import shutil
import subprocess
import threading
import time
import http.cookiejar
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor

PORT = 4545
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COOKIES_FILE = os.path.join(BASE_DIR, "skool_session_cookies.txt")

DOWNLOAD_LOCK = threading.Lock()
GDRIVE_FOLDER_LOCK = threading.Lock()
ACTIVE_DOWNLOADS = {}
COMPLETED_DOWNLOADS = {}
FAILED_DOWNLOADS = {}

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

def find_binary(name):
    """Find absolute path to binary across macOS Homebrew, Local, and system paths."""
    candidates = [
        f"/opt/homebrew/bin/{name}",
        f"/usr/local/bin/{name}",
        f"/usr/bin/{name}",
        os.path.expanduser(f"~/Library/Python/3.9/bin/{name}"),
        os.path.expanduser(f"~/.local/bin/{name}")
    ]
    for c in candidates:
        if os.path.exists(c) and os.access(c, os.X_OK):
            return c
    return name

YTDLP_BIN = find_binary("yt-dlp")
FFMPEG_BIN = find_binary("ffmpeg")

def get_exec_env():
    """Build execution environment with full PATH including Homebrew and system binaries."""
    env = os.environ.copy()
    env["PATH"] = f"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{env.get('PATH', '')}"
    return env

def save_cookies(cookie_content):
    """Save browser exported Netscape cookies to local session file."""
    if not cookie_content:
        return
    try:
        with open(COOKIES_FILE, "w", encoding="utf-8") as f:
            f.write(cookie_content)
        print(f"🍪 [Companion Server] Saved authenticated session cookies ({len(cookie_content)} bytes)", flush=True)
    except Exception as e:
        print(f"⚠️ [Companion Server] Cookie save error: {e}", flush=True)

def resolve_skool_video_stream(page_url, cookie_file):
    """Fetch Skool lesson page with authenticated cookies and resolve exact signed stream."""
    if not os.path.exists(cookie_file) or os.path.getsize(cookie_file) < 50:
        return None

    try:
        target_md = None
        if "?md=" in page_url:
            target_md = page_url.split("?md=")[1].split("&")[0].strip()

        jar = http.cookiejar.MozillaCookieJar(cookie_file)
        jar.load()

        # Build raw Cookie header from cookie_file
        cookie_header_parts = []
        try:
            with open(cookie_file, "r", encoding="utf-8") as cf:
                for line in cf:
                    parts = line.strip().split("\t")
                    if len(parts) >= 7 and not line.startswith("#"):
                        cookie_header_parts.append(f"{parts[5]}={parts[6]}")
        except Exception:
            pass
        cookie_header_str = "; ".join(cookie_header_parts)

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            "Referer": "https://www.skool.com/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
        if cookie_header_str:
            headers["Cookie"] = cookie_header_str

        req = urllib.request.Request(page_url, headers=headers)
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
            html = res.read().decode("utf-8", "ignore")

        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if m:
            data = json.loads(m.group(1))
            page_props = data.get("props", {}).get("pageProps", {})

            def find_node_by_id(obj, tid):
                if isinstance(obj, dict):
                    if obj.get("id") == tid or obj.get("_id") == tid:
                        return obj
                    for v in obj.values():
                        res = find_node_by_id(v, tid)
                        if res: return res
                elif isinstance(obj, list):
                    for item in obj:
                        res = find_node_by_id(item, tid)
                        if res: return res
                return None

            # 1. If target_md is specified, strictly locate that specific lesson node
            if target_md:
                les_node = find_node_by_id(page_props, target_md)
                if les_node:
                    meta = les_node.get("metadata", {})
                    # A. Embed / external link (Loom, YouTube, Wistia, Vimeo)
                    vlink = meta.get("videoLink") or les_node.get("videoLink") or meta.get("videoUrl") or les_node.get("videoUrl")
                    if vlink and isinstance(vlink, str) and vlink.startswith("http"):
                        print(f"🎯 [Companion Server] Resolved exact lesson videoLink ({target_md}): {vlink}", flush=True)
                        return vlink

                    # B. Mux / Native Skool stream for this specific videoId
                    vid_id = meta.get("videoId") or les_node.get("videoId")
                    page_vid = page_props.get("video") or {}
                    if vid_id and page_vid.get("id") == vid_id:
                        pid = page_vid.get("playbackId")
                        tok = page_vid.get("playbackToken")
                        if pid and tok:
                            mux_url = f"https://stream.mux.com/{pid}.m3u8?token={tok}"
                            print(f"🎯 [Companion Server] Resolved native Mux stream ({target_md}): {mux_url[:60]}...", flush=True)
                            return mux_url
                        elif pid:
                            mux_url = f"https://stream.mux.com/{pid}.m3u8"
                            print(f"🎯 [Companion Server] Resolved native Mux stream ({target_md}): {mux_url}", flush=True)
                            return mux_url

            # 2. General page video (when no specific ?md= or single lesson page)
            page_vid = page_props.get("video") or {}
            pid = page_vid.get("playbackId")
            tok = page_vid.get("playbackToken")
            if pid and tok:
                return f"https://stream.mux.com/{pid}.m3u8?token={tok}"
            elif pid:
                return f"https://stream.mux.com/{pid}.m3u8"

            vlink = page_vid.get("url") or page_vid.get("videoLink")
            if vlink and isinstance(vlink, str) and vlink.startswith("http"):
                return vlink

    except Exception as e:
        print(f"⚠️ [Companion Server] Stream resolution note for {page_url}: {e}", flush=True)

def resolve_loom_stream_url(loom_url):
    """Directly extracts high quality Luna HLS playlist stream from Loom video pages."""
    if not loom_url or 'loom.com' not in loom_url:
        return None
    try:
        lid_m = re.search(r'/(?:share|embed)/([a-f0-9]+)', loom_url)
        if not lid_m:
            return None
        lid = lid_m.group(1)
        page_url = f"https://www.loom.com/share/{lid}"
        req = urllib.request.Request(page_url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode("utf-8")
        hls_m = re.search(r'(https://luna\.loom\.com/[^"\'\s<>]*\.m3u8[^"\'\s<>]*)', html)
        if hls_m:
            return hls_m.group(1).replace("&amp;", "&")
    except Exception as e:
        print(f"⚠️ [Companion Server] Loom direct stream resolution error: {e}", flush=True)
    return None

# ==========================================
# STRING & PATH NORMALIZERS
# ==========================================

def clean_folder_name(name):
    """Normalize folder names to clean human-readable titles."""
    if not name:
        return 'Skool'
    if name in ('ultimate-editors-5412', 'ultimate_editors_5412'):
        return 'Ultimate editors'
    if name in ('ultimateeditors2', 'ultimate_editors_2'):
        return 'Ultimate Editors 2.0'
    clean = re.sub(r'[<>:"/\\|?*]', '', name).strip()
    clean = ' '.join(clean.split())
    if '_' in clean and ' ' not in clean:
        clean = clean.replace('_', ' ')
    return clean or 'Carpeta'

def clean_file_name(name):
    """Normalize filenames (preserves extension, replaces invalid chars with underscores)."""
    if not name:
        return 'archivo.mp4'
    clean = re.sub(r'[<>:"/\\|?*]', '', name).strip()
    clean = clean.replace(' ', '_')
    clean = re.sub(r'_+', '_', clean)
    return clean

def resolve_target_dir(folder_path):
    """Deterministically resolve target directory to physical OS paths."""
    if not folder_path:
        folder_path = "Documentos/Skool Downloads"
        
    clean = folder_path.strip().replace('\\', '/')
    home = os.path.expanduser("~")
    
    if clean.startswith("~"):
        target = os.path.expanduser(clean)
        os.makedirs(target, exist_ok=True)
        return target
        
    if os.path.isabs(clean) or re.match(r'^[a-zA-Z]:', clean):
        os.makedirs(clean, exist_ok=True)
        return os.path.abspath(clean)
        
    parts = [p for p in clean.split('/') if p]
    if not parts:
        target = os.path.join(home, 'Documents', 'Skool Downloads')
        os.makedirs(target, exist_ok=True)
        return target

    first = parts[0].lower()
    rest = [clean_folder_name(p) for p in parts[1:]]
    
    if first in ['documentos', 'documents', 'doc', 'docs']:
        target = os.path.join(home, 'Documents', *rest)
    elif first in ['escritorio', 'desktop']:
        target = os.path.join(home, 'Desktop', *rest)
    elif first in ['descargas', 'downloads']:
        target = os.path.join(home, 'Downloads', *rest)
    elif first in ['videos', 'movies', 'peliculas']:
        target = os.path.join(home, 'Movies' if sys.platform == 'darwin' else 'Videos', *rest)
    elif first in ['musica', 'music']:
        target = os.path.join(home, 'Music', *rest)
    else:
        target = os.path.join(home, 'Documents', clean_folder_name(parts[0]), *rest)

    os.makedirs(target, exist_ok=True)
    return target

def create_url_shortcut(file_path, url, title):
    clean_base = file_path.rsplit('.', 1)[0]
    url_file = clean_base + '.url'
    with open(url_file, 'w', encoding='utf-8') as f:
        f.write(f"[InternetShortcut]\nURL={url}\n")

    if sys.platform == 'darwin':
        webloc_file = clean_base + '.webloc'
        with open(webloc_file, 'w', encoding='utf-8') as f:
            f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>{url}</string>\n</dict>\n</plist>')

# ==========================================
# GOOGLE DRIVE INTEGRATION ENGINE
# ==========================================

GDRIVE_CACHE = {
    "token": None,
    "token_time": 0,
    "folders": {},
    "user_email": "r2d2201@gmail.com"
}

def get_gdrive_access_token():
    token_path = os.path.expanduser('~/.gemini/gdrive_token.json')
    if not os.path.exists(token_path):
        return None

    try:
        with open(token_path, 'r', encoding='utf-8') as f:
            token_data = json.load(f)

        access_token = token_data.get('token')
        refresh_token = token_data.get('refresh_token')
        client_id = token_data.get('client_id')
        client_secret = token_data.get('client_secret')

        if refresh_token and client_id and client_secret:
            data = urllib.parse.urlencode({
                'client_id': client_id,
                'client_secret': client_secret,
                'refresh_token': refresh_token,
                'grant_type': 'refresh_token'
            }).encode('utf-8')
            req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
                new_tokens = json.loads(res.read().decode('utf-8'))
                access_token = new_tokens.get('access_token', access_token)
                GDRIVE_CACHE["token"] = access_token
                GDRIVE_CACHE["token_time"] = time.time()
                return access_token
    except Exception as e:
        print(f"⚠️ [Google Drive] Token refresh note: {e}", flush=True)

    return access_token

def get_or_create_gdrive_folder(folder_name, parent_id=None, token=None):
    if not token:
        token = get_gdrive_access_token()
    if not token:
        return None

    normalized_name = clean_folder_name(folder_name)
    cache_key = f"{parent_id or 'root'}/{normalized_name}"

    with GDRIVE_FOLDER_LOCK:
        if cache_key in GDRIVE_CACHE["folders"]:
            cached_id = GDRIVE_CACHE["folders"][cache_key]
            # Verify if cached folder still exists and is not trashed in Google Drive
            try:
                verify_url = f"https://www.googleapis.com/drive/v3/files/{cached_id}?fields=id,trashed"
                req = urllib.request.Request(verify_url, headers={'Authorization': f'Bearer {token}'})
                with urllib.request.urlopen(req, context=SSL_CTX, timeout=6) as res:
                    finfo = json.loads(res.read().decode('utf-8'))
                    if finfo.get('id') == cached_id and not finfo.get('trashed', False):
                        return cached_id
            except Exception:
                pass
            # If deleted or trashed in Drive, drop from cache
            GDRIVE_CACHE["folders"].pop(cache_key, None)

        try:
            safe_query_name = normalized_name.replace("\\", "\\\\").replace("'", "\\'")
            query = f"name = '{safe_query_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            if parent_id:
                query += f" and '{parent_id}' in parents"
            else:
                query += " and 'root' in parents"

            url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&fields=files(id,name,webViewLink)"
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as res:
                data = json.loads(res.read().decode('utf-8'))
                files = data.get('files', [])
                if files:
                    folder_id = files[0]['id']
                    GDRIVE_CACHE["folders"][cache_key] = folder_id
                    return folder_id

            body = {'name': normalized_name, 'mimeType': 'application/vnd.google-apps.folder'}
            if parent_id:
                body['parents'] = [parent_id]

            req = urllib.request.Request(
                'https://www.googleapis.com/drive/v3/files',
                data=json.dumps(body).encode('utf-8'),
                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as res:
                created = json.loads(res.read().decode('utf-8'))
                folder_id = created['id']
                GDRIVE_CACHE["folders"][cache_key] = folder_id
                return folder_id

        except Exception as e:
            print(f"❌ [Google Drive] Folder error ({normalized_name} under {parent_id}): {e}", flush=True)
            GDRIVE_CACHE["folders"].clear()
            return None

def resolve_gdrive_folder_hierarchy(path_parts, root_name="Skool Downloads", token=None):
    if not token:
        token = get_gdrive_access_token()
    if not token:
        return None

    current_parent = get_or_create_gdrive_folder(clean_folder_name(root_name), None, token)
    if not current_parent:
        print("❌ [Google Drive] Failed to resolve root folder", flush=True)
        return None

    for part in path_parts:
        if part:
            clean_part = clean_folder_name(part)
            next_parent = get_or_create_gdrive_folder(clean_part, current_parent, token)
            if not next_parent:
                print(f"❌ [Google Drive] Failed to resolve subfolder {clean_part}, aborting tree to prevent root spill", flush=True)
                return None
            current_parent = next_parent

    return current_parent

def upload_file_to_gdrive(local_file_path, folder_id, token=None, max_retries=3):
    if not token:
        token = get_gdrive_access_token()
    if not token or not os.path.exists(local_file_path):
        return None
    if not folder_id:
        print("⚠️ [Google Drive] Upload aborted: No target folder specified (preventing root spill)", flush=True)
        return None

    file_name = os.path.basename(local_file_path)
    file_size = os.path.getsize(local_file_path)

    for attempt in range(1, max_retries + 1):
        print(f"☁️ [Google Drive] Uploading {file_name} ({file_size / (1024*1024):.2f} MB) [Intento {attempt}/{max_retries}]...", flush=True)
        try:
            metadata = {'name': file_name, 'parents': [folder_id]}
            init_req = urllib.request.Request(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
                data=json.dumps(metadata).encode('utf-8'),
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Length': str(file_size)
                }
            )

            with urllib.request.urlopen(init_req, context=SSL_CTX, timeout=30) as res:
                upload_url = res.headers.get('Location')

            if not upload_url:
                raise ValueError("No upload URL returned by Google Drive")

            chunk_size = 16 * 1024 * 1024  # 16 MB per chunk
            file_id = None
            with open(local_file_path, 'rb') as f:
                start_byte = 0
                while start_byte < file_size:
                    chunk = f.read(chunk_size)
                    chunk_len = len(chunk)
                    end_byte = start_byte + chunk_len - 1
                    
                    put_req = urllib.request.Request(
                        upload_url,
                        data=chunk,
                        headers={
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': str(chunk_len),
                            'Content-Range': f'bytes {start_byte}-{end_byte}/{file_size}'
                        },
                        method='PUT'
                    )
                    
                    try:
                        with urllib.request.urlopen(put_req, context=SSL_CTX, timeout=300) as res:
                            if res.status in (200, 201):
                                result = json.loads(res.read().decode('utf-8'))
                                file_id = result.get('id')
                                break
                    except urllib.error.HTTPError as he:
                        if he.code == 308:
                            range_hdr = he.headers.get('Range')
                            if range_hdr:
                                m = re.search(r'bytes=0-(\d+)', range_hdr)
                                if m:
                                    start_byte = int(m.group(1)) + 1
                                else:
                                    start_byte += chunk_len
                            else:
                                start_byte += chunk_len
                            pct = (start_byte / file_size) * 100
                            print(f"   ☁️ [Drive Chunk] Uploaded {start_byte/(1024*1024):.1f}/{file_size/(1024*1024):.1f} MB ({pct:.1f}%)...", flush=True)
                            continue
                        else:
                            raise he

            if file_id:
                print(f"✅ [Google Drive] Uploaded successfully: {file_name} (ID: {file_id})", flush=True)
                return file_id

        except Exception as e:
            print(f"⚠️ [Google Drive] Upload attempt {attempt} failed for {file_name}: {e}", flush=True)
            GDRIVE_CACHE["folders"].clear()
            token = get_gdrive_access_token()
            time.sleep(2 * attempt)

    return None

def update_studio_web_course_data(context, file_name, gdrive_id, is_resource=False):
    """Automatically synchronizes newly uploaded Google Drive files into studio-web/data/course-data.js."""
    if not context or not gdrive_id:
        return

    community_name = clean_folder_name(context.get('community') or 'Ultimate Editors 2.0')
    course_name = clean_folder_name(context.get('course') or 'Curso')
    module_name = clean_folder_name(context.get('module') or 'General')
    lesson_title = context.get('lessonTitle') or file_name.replace('.mp4', '')
    resources = context.get('resources') or []
    
    comm_id = re.sub(r'[^a-zA-Z0-9]', '', community_name).lower() or 'community'
    course_id = re.sub(r'[^a-zA-Z0-9]', '-', course_name).lower() or 'course'
    course_id = re.sub(r'-+', '-', course_id).strip('-')

    course_data_file = os.path.join(BASE_DIR, 'studio-web', 'data', 'course-data.js')
    if not os.path.exists(course_data_file):
        return

    try:
        with open(course_data_file, 'r', encoding='utf-8') as f:
            content = f.read()

        start_idx = content.find("window.COMMUNITIES_DATA")
        if start_idx == -1:
            return
        json_start = content.find("[", start_idx)
        if json_start == -1:
            return

        decoder = json.JSONDecoder()
        communities, _ = decoder.raw_decode(content[json_start:])
        
        # 1. Find or create community
        comm = next((c for c in communities if c.get('id') == comm_id or c.get('name') == community_name), None)
        if not comm:
            comm = {
                "id": comm_id,
                "name": community_name,
                "badge": "ACADEMIA & COMUNIDAD",
                "description": f"Cursos y recursos de {community_name}",
                "courses": []
            }
            communities.append(comm)

        # 2. Find or create course
        course = next((c for c in comm['courses'] if c.get('id') == course_id or c.get('courseTitle') == course_name), None)
        if not course:
            course = {
                "id": course_id,
                "community": community_name,
                "courseTitle": course_name,
                "subtitle": f"Formación completa de {course_name}",
                "bannerTag": "1080P FULL HD · EN DRIVE",
                "totalModules": 0,
                "totalLessons": 0,
                "totalResources": 0,
                "modules": []
            }
            comm['courses'].append(course)

        # 3. Find or create module
        mod = next((m for m in course['modules'] if m.get('title') == module_name or m.get('folder') == module_name), None)
        if not mod:
            mod_idx = len(course['modules']) + 1
            mod = {
                "index": mod_idx,
                "folder": module_name,
                "title": module_name,
                "lessons": []
            }
            course['modules'].append(mod)

        # 4. Find or create lesson
        clean_les_title = str(lesson_title).strip()
        les = next((l for l in mod['lessons'] if l.get('title') == clean_les_title or l.get('rawTitle') == clean_les_title), None)
        if not les:
            les_idx = len(mod['lessons']) + 1
            global_idx = sum(len(m.get('lessons', [])) for m in course['modules']) + 1
            les_id = context.get('lessonId') or f"les_{course_id}_{global_idx}"
            les = {
                "id": les_id,
                "slug": les_id[:8],
                "index": les_idx,
                "globalIndex": global_idx,
                "title": clean_les_title,
                "rawTitle": clean_les_title,
                "module": module_name,
                "moduleIndex": mod['index'],
                "gdriveId": gdrive_id,
                "gdriveLink": f"https://drive.google.com/file/d/{gdrive_id}/view?usp=drivesdk",
                "inDrive": True,
                "descriptionHtml": context.get('descriptionHtml') or context.get('description') or "",
                "resources": resources
            }
            mod['lessons'].append(les)
        else:
            les['gdriveId'] = gdrive_id
            les['gdriveLink'] = f"https://drive.google.com/file/d/{gdrive_id}/view?usp=drivesdk"
            les['inDrive'] = True
            if context.get('descriptionHtml') or context.get('description'):
                les['descriptionHtml'] = context.get('descriptionHtml') or context.get('description')
            if resources:
                les['resources'] = resources

        # Update course totals
        course['totalModules'] = len(course['modules'])
        course['totalLessons'] = sum(len(m.get('lessons', [])) for m in course['modules'])
        course['totalResources'] = sum(len(l.get('resources', [])) for m in course['modules'] for l in m.get('lessons', []))

        # Write back to course-data.js
        new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
        with open(course_data_file, 'w', encoding='utf-8') as f:
            f.write(new_content)

        print(f"🎬 [Studio Sync] Automatically updated Cinematic Studio with: {clean_les_title} ({course_name})", flush=True)
        trigger_background_cloud_sync()

    except Exception as e:
        print(f"⚠️ [Studio Sync] Note: {e}", flush=True)

_CLOUD_SYNC_TIMER = None
_CLOUD_SYNC_LOCK = threading.Lock()

def trigger_background_cloud_sync():
    """Debounced asynchronously commit and deploy updated course-data.js to Vercel without blocking downloads."""
    global _CLOUD_SYNC_TIMER
    with _CLOUD_SYNC_LOCK:
        if _CLOUD_SYNC_TIMER and _CLOUD_SYNC_TIMER.is_alive():
            _CLOUD_SYNC_TIMER.cancel()

        def _do_sync():
            try:
                studio_dir = os.path.join(BASE_DIR, 'studio-web')
                env = os.environ.copy()
                env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + env.get("PATH", "")
                
                git_bin = shutil.which("git", path=env["PATH"]) or "/usr/bin/git"
                vercel_bin = shutil.which("vercel", path=env["PATH"]) or "/opt/homebrew/bin/vercel"

                subprocess.run([git_bin, "add", "."], cwd=BASE_DIR, env=env, capture_output=True)
                subprocess.run([git_bin, "commit", "-m", "chore: auto-sync course catalog and notes [skip ci]"], cwd=BASE_DIR, env=env, capture_output=True)
                subprocess.run([git_bin, "push", "origin", "main"], cwd=BASE_DIR, env=env, capture_output=True)
                
                res = subprocess.run([vercel_bin, "--prod", "--yes"], cwd=studio_dir, env=env, capture_output=True, text=True)
                if res.returncode == 0:
                    print("🚀 [Vercel Cloud Sync] Successfully deployed newest course catalog to Vercel production!", flush=True)
                else:
                    print(f"⚠️ [Vercel Cloud Sync] Vercel CLI returned: {res.stderr.strip()}", flush=True)
            except Exception as e:
                print(f"⚠️ [Vercel Cloud Sync] Background deploy error: {e}", flush=True)

        _CLOUD_SYNC_TIMER = threading.Timer(3.0, _do_sync)
        _CLOUD_SYNC_TIMER.daemon = True
        _CLOUD_SYNC_TIMER.start()

def process_gdrive_sync(local_file_path, context, storage_mode, gdrive_root, task_id=None):
    if storage_mode not in ['gdrive', 'both'] or not os.path.exists(local_file_path):
        return None

    if task_id:
        with DOWNLOAD_LOCK:
            if task_id in ACTIVE_DOWNLOADS:
                ACTIVE_DOWNLOADS[task_id]["status"] = "uploading_gdrive"
                ACTIVE_DOWNLOADS[task_id]["percent"] = 85
                ACTIVE_DOWNLOADS[task_id]["message"] = "☁️ Subiendo a Google Drive..."

    try:
        parts = []
        if context:
            if context.get('community'): parts.append(clean_folder_name(context['community']))
            if context.get('course'): parts.append(clean_folder_name(context['course']))
            if context.get('module'): parts.append(clean_folder_name(context['module']))

        folder_id = resolve_gdrive_folder_hierarchy(parts, gdrive_root or 'Skool Downloads')
        if folder_id:
            uploaded_id = upload_file_to_gdrive(local_file_path, folder_id)
            if uploaded_id:
                # Automatically sync to Studio Web database
                fname = os.path.basename(local_file_path)
                update_studio_web_course_data(context, fname, uploaded_id)

                if storage_mode == 'gdrive':
                    try:
                        os.remove(local_file_path)
                        print(f"🗑️ [Local] Removed temporary local file: {local_file_path}", flush=True)
                    except Exception:
                        pass
            return uploaded_id
        else:
            print("⚠️ [Google Drive Sync] Skipped upload because folder structure could not be verified", flush=True)
    except Exception as e:
        print(f"⚠️ [Google Drive Sync] Error: {e}", flush=True)
    return None

# ==========================================
# RESOURCE SCANNER ENGINE
# ==========================================



def create_or_update_gdrive_doc(doc_name, html_content, folder_id, token=None):
    """Create or update a native Google Doc with active clickable links inside target Drive folder."""
    if not token:
        token = get_gdrive_access_token()
    if not token or not folder_id:
        return None

    try:
        safe_doc_name = doc_name.replace("\\", "\\\\").replace("'", "\\'")
        query = f"name = '{safe_doc_name}' and mimeType = 'application/vnd.google-apps.document' and '{folder_id}' in parents and trashed = false"
        url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&fields=files(id,name,webViewLink)"
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
            existing = json.loads(res.read().decode('utf-8')).get('files', [])

        if existing:
            file_id = existing[0]['id']
            # Update existing document content
            req = urllib.request.Request(
                f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media",
                data=html_content.encode('utf-8'),
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'text/html; charset=UTF-8'
                },
                method='PATCH'
            )
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as res:
                print(f"✅ [Google Doc] Updated existing native Google Doc: {doc_name} (ID: {file_id})", flush=True)
                return f"https://docs.google.com/document/d/{file_id}/edit"

        # Create new Google Doc via multipart upload
        boundary = "-------314159265358979323846"
        metadata = {
            "name": doc_name,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [folder_id]
        }
        delimiter = f"\r\n--{boundary}\r\n".encode("utf-8")
        close_delim = f"\r\n--{boundary}--\r\n".encode("utf-8")

        multipart_body = (
            delimiter +
            b"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            json.dumps(metadata).encode("utf-8") +
            delimiter +
            b"Content-Type: text/html; charset=UTF-8\r\n\r\n" +
            html_content.encode("utf-8") +
            close_delim
        )

        req = urllib.request.Request(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            data=multipart_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": f"multipart/related; boundary={boundary}"
            }
        )

        with urllib.request.urlopen(req, context=SSL_CTX, timeout=25) as res:
            created = json.loads(res.read().decode("utf-8"))
            file_id = created.get("id")
            print(f"✅ [Google Doc] Created new native Google Doc: {doc_name} (ID: {file_id})", flush=True)
            return f"https://docs.google.com/document/d/{file_id}/edit"

    except Exception as e:
        print(f"⚠️ [Google Doc] Error creating/updating native Google Doc: {e}", flush=True)
        return None

def scan_all_course_resources(classroom_url, cookie_file=COOKIES_FILE):
    """Scan and aggregate all attached resources, Figma boards, Drive links across entire course with exact module hierarchy."""
    if not os.path.exists(cookie_file):
        return {"success": False, "error": "No cookies available"}

    try:
        jar = http.cookiejar.MozillaCookieJar(cookie_file)
        jar.load()
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=SSL_CTX),
            urllib.request.HTTPCookieProcessor(jar)
        )
        
        req = urllib.request.Request(classroom_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://www.skool.com/"
        })
        with opener.open(req, timeout=15) as res:
            html = res.read().decode("utf-8")

        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if not m:
            return {"success": False, "error": "Could not parse Next.js data"}

        data = json.loads(m.group(1))
        course_obj = data.get("props", {}).get("pageProps", {}).get("course", {})

        # Build clean module & lesson map from course children
        lesson_map = {}
        unique_lessons = []
        seen = set()
        mod_num = 1

        for item in course_obj.get("children", []):
            c_info = item.get("course", {})
            sub_lessons = item.get("children", [])
            if not sub_lessons:
                continue
            m_title = c_info.get("metadata", {}).get("title") or c_info.get("name") or f"Modulo {mod_num}"
            mod_folder = f"{mod_num:02d}_{m_title}".replace("/", "-")
            
            for l_idx, sub in enumerate(sub_lessons, 1):
                s_info = sub.get("course", {})
                s_id = s_info.get("id")
                s_slug = s_info.get("name")
                s_title = s_info.get("metadata", {}).get("title") or s_slug or f"Leccion {l_idx}"
                clean_les_title = f"{l_idx:02d}. {s_title}"
                
                info_dict = {
                    "moduleNum": mod_num,
                    "moduleTitle": mod_folder,
                    "lessonIndex": l_idx,
                    "lessonTitle": clean_les_title,
                    "rawTitle": s_title
                }
                if s_id:
                    lesson_map[s_id] = info_dict
                    if s_id not in seen:
                        seen.add(s_id)
                        unique_lessons.append((s_id, clean_les_title, mod_folder))
                if s_slug:
                    lesson_map[s_slug] = info_dict

            mod_num += 1

        base_clean_url = classroom_url.split('?')[0]
        all_resources = []
        seen_urls = set()

        def scan_lesson(les_info):
            lid, ltitle, mod_folder = les_info
            les_url = f"{base_clean_url}?md={lid}"
            try:
                l_req = urllib.request.Request(les_url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
                with opener.open(l_req, timeout=10) as l_res:
                    l_html = l_res.read().decode("utf-8")
                
                lm = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', l_html)
                if lm:
                    ldata = json.loads(lm.group(1))
                    pageProps = ldata.get("props", {}).get("pageProps", {})
                    
                    real_mod_title = mod_folder
                    real_les_title = ltitle
                    if lid in lesson_map:
                        real_mod_title = lesson_map[lid]["moduleTitle"]
                        real_les_title = lesson_map[lid]["lessonTitle"]

                    desc_str = json.dumps(pageProps)
                    urls = re.findall(r'https?://[^\s"\'<>]+', desc_str)
                    
                    for u in urls:
                        u_clean = u.replace('\\u0026', '&').rstrip('\\')
                        is_res = any(d in u_clean.lower() for d in ['figma.com', 'drive.google.com/file', 'drive.google.com/drive', 'dropbox.com', 'notion.so', 'canva.com', 'github.com']) or any(ext in u_clean.lower() for ext in ['.pdf', '.zip', '.rar', '.prfpset', '.aep', '.cube', '.mp3', '.wav'])
                        if is_res:
                            dedup_key = f"{lid}_{u_clean}"
                            if dedup_key not in seen_urls:
                                seen_urls.add(dedup_key)
                                
                                label = "Recurso"
                                cat_type = "link"
                                color = "#3b82f6"
                                if "figma.com" in u_clean:
                                    label = "Tablero de Figma"
                                    cat_type = "figma"
                                    color = "#a855f7"
                                elif "drive.google.com" in u_clean:
                                    label = "Google Drive (Archivos/Presets)"
                                    cat_type = "gdrive"
                                    color = "#3b82f6"
                                elif "dropbox.com" in u_clean:
                                    label = "Carpeta Dropbox"
                                    cat_type = "dropbox"
                                    color = "#0284c7"
                                elif any(ext in u_clean.lower() for ext in ['.zip', '.rar', '.7z']):
                                    label = "Paquete ZIP"
                                    cat_type = "zip"
                                    color = "#f59e0b"
                                elif ".pdf" in u_clean.lower():
                                    label = "Documento PDF"
                                    cat_type = "pdf"
                                    color = "#ef4444"

                                all_resources.append({
                                    "id": f"res_{lid}_{len(all_resources)}",
                                    "lessonId": lid,
                                    "moduleTitle": real_mod_title,
                                    "lessonTitle": real_les_title,
                                    "name": f"{label} · {real_les_title}",
                                    "url": u_clean,
                                    "category": cat_type,
                                    "categoryLabel": label,
                                    "badgeColor": color
                                })
            except Exception:
                pass

        with ThreadPoolExecutor(max_workers=8) as executor:
            executor.map(scan_lesson, unique_lessons)

        return {
            "success": True,
            "totalResources": len(all_resources),
            "resources": all_resources
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

def generate_aesthetic_resource_guide(target_dir, resources_list, community="Ultimate Editors 2.0", course="Cinematic Short-Film Editing Style", storage_mode='both', gdrive_root='Skool Downloads', context=None):
    """Generate high-end aesthetic HTML, Markdown, and native Google Doc guides with structured module hierarchy."""
    os.makedirs(target_dir, exist_ok=True)
    clean_comm = clean_folder_name(community)
    clean_crs = clean_folder_name(course)
    
    # Group hierarchically by Module -> Lesson
    hierarchy = {}
    for r in resources_list:
        mod = r.get("moduleTitle") or "General"
        les = r.get("lessonTitle") or "General"
        hierarchy.setdefault(mod, {}).setdefault(les, []).append(r)
        
    # 1. Generate Markdown Guide
    md_lines = [
        f"# 📖 Guía de Recursos y Enlaces: {clean_crs}",
        f"**Comunidad**: {clean_comm} | **Total de Recursos**: {len(resources_list)}",
        "",
        "---",
        ""
    ]
    
    for mod_name, lessons_dict in hierarchy.items():
        md_lines.append(f"## 📁 {mod_name}")
        md_lines.append("")
        for les_name, r_list in lessons_dict.items():
            md_lines.append(f"### 🎬 {les_name}")
            md_lines.append("| Tipo | Recurso | Enlace Directo |")
            md_lines.append("| :--- | :--- | :--- |")
            for r in r_list:
                cat = r.get("categoryLabel") or "Enlace"
                name = r.get("name") or "Recurso"
                url = r.get("url") or "#"
                badge = "🎨" if "figma" in cat.lower() else ("☁️" if "drive" in cat.lower() else ("📦" if "zip" in cat.lower() else "🔗"))
                md_lines.append(f"| {badge} **{cat}** | {name} | [👉 Abrir Recurso]({url}) |")
            md_lines.append("")
        
    md_content = "\n".join(md_lines)
    md_path = os.path.join(target_dir, "📖 Recursos_y_Enlaces.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
        
    # 2. Generate Aesthetic HTML Guide (Dark Mode, Responsive, Glassmorphism)
    html_modules = []
    gdoc_modules_html = []

    for mod_name, lessons_dict in hierarchy.items():
        html_lessons = []
        gdoc_lessons = []

        for les_name, r_list in lessons_dict.items():
            links_html = []
            gdoc_links = []

            for r in r_list:
                cat = r.get("categoryLabel") or "Enlace"
                name = r.get("name") or "Recurso"
                url = r.get("url") or "#"
                btn_class = "btn-figma" if "figma" in cat.lower() else ("btn-gdrive" if "drive" in cat.lower() else "btn-general")
                icon = "🎨" if "figma" in cat.lower() else ("☁️" if "drive" in cat.lower() else "🔗")
                
                links_html.append(f"""
                  <div class="link-item">
                    <div class="link-info">
                      <span class="badge {btn_class}">{icon} {cat}</span>
                      <span class="link-title">{name}</span>
                      <span class="link-url">{url[:70]}...</span>
                    </div>
                    <a href="{url}" target="_blank" rel="noopener noreferrer" class="action-btn {btn_class}">
                      Abrir Enlace ↗
                    </a>
                  </div>
                """)

                gdoc_links.append(f"""
                  <p style="margin: 6px 0 12px 0;">
                    {icon} <b>{cat}</b>: <a href="{url}" style="color: #0284c7; text-decoration: underline; font-weight: bold;">{name} (Clic para abrir)</a>
                  </p>
                """)
            
            cards_str = "".join(links_html)
            html_lessons.append(f"""
              <div class="lesson-card">
                <h4 class="lesson-header">🎬 {les_name}</h4>
                <div class="links-list">
                  {cards_str}
                </div>
              </div>
            """)

            gdoc_lessons.append(f"""
              <h3 style="color: #1e293b; margin-top: 14px; margin-bottom: 6px;">🎬 {les_name}</h3>
              {"".join(gdoc_links)}
            """)
        
        all_lessons_str = "\n".join(html_lessons)
        html_modules.append(f"""
          <div class="module-section">
            <h2 class="module-title">📁 {mod_name}</h2>
            {all_lessons_str}
          </div>
        """)

        gdoc_sub_str = "\n".join(gdoc_lessons)
        gdoc_modules_html.append(f"""
          <h2 style="color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 4px; margin-top: 24px;">📁 {mod_name}</h2>
          {gdoc_sub_str}
        """)
        
    all_modules_html = "\n".join(html_modules)
    
    html_content = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recursos: {clean_crs}</title>
  <style>
    :root {{
      --bg: #0b0f19;
      --card-bg: #151d30;
      --border: rgba(255, 255, 255, 0.08);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --figma: #a855f7;
      --gdrive: #38bdf8;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 30px 16px;
    }}
    .container {{ max-width: 880px; margin: 0 auto; }}
    .header-card {{
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 28px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }}
    .community-tag {{
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #60a5fa;
      background: rgba(59, 130, 246, 0.15);
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 8px;
    }}
    h1 {{ font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 6px; }}
    .subtitle {{ color: var(--text-muted); font-size: 13px; }}
    
    .module-section {{
      margin-bottom: 32px;
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 20px;
    }}
    .module-title {{
      font-size: 18px;
      font-weight: 800;
      color: #38bdf8;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(56, 189, 248, 0.2);
    }}
    
    .lesson-card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 14px;
    }}
    .lesson-header {{
      font-size: 15px;
      font-weight: 700;
      color: #cbd5e1;
      margin-bottom: 12px;
    }}
    .links-list {{ display: flex; flex-direction: column; gap: 10px; }}
    .link-item {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 12px 16px;
      transition: all 0.2s ease;
    }}
    .link-item:hover {{
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.12);
    }}
    .link-info {{ display: flex; flex-direction: column; gap: 2px; overflow: hidden; }}
    .link-title {{ font-size: 14px; font-weight: 600; color: #fff; }}
    .link-url {{ font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 480px; }}
    
    .badge {{
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      margin-bottom: 4px;
      width: fit-content;
    }}
    .badge.btn-figma {{ background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }}
    .badge.btn-gdrive {{ background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }}
    .badge.btn-general {{ background: rgba(255, 255, 255, 0.1); color: #cbd5e1; }}
    
    .action-btn {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      transition: all 0.2s ease;
    }}
    .action-btn.btn-figma {{ background: #9333ea; color: #fff; }}
    .action-btn.btn-figma:hover {{ background: #7e22ce; }}
    .action-btn.btn-gdrive {{ background: #0284c7; color: #fff; }}
    .action-btn.btn-gdrive:hover {{ background: #0369a1; }}
    .action-btn.btn-general {{ background: #334155; color: #fff; }}
    .action-btn.btn-general:hover {{ background: #475569; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <span class="community-tag">🏫 {clean_comm}</span>
      <h1>📖 Guía de Recursos y Enlaces del Curso</h1>
      <p class="subtitle">{clean_crs} · {len(resources_list)} enlaces y tableros interactivos</p>
    </div>
    {all_modules_html}
  </div>
</body>
</html>
"""
    html_path = os.path.join(target_dir, "📖 Guia_De_Recursos_y_Enlaces.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
        
    print(f"✅ [Companion Server] Generated aesthetic guides: {md_path} & {html_path}", flush=True)
    
    # 3. Create / Update Native Google Doc in Google Drive
    gdoc_url = None
    if storage_mode in ['gdrive', 'both']:
        parts = []
        if context:
            if context.get('community'): parts.append(clean_folder_name(context['community']))
            if context.get('course'): parts.append(clean_folder_name(context['course']))
        
        folder_id = resolve_gdrive_folder_hierarchy(parts, gdrive_root or 'Skool Downloads')
        if folder_id:
            gdoc_all_modules = "\n".join(gdoc_modules_html)
            gdoc_html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
  <h1 style="color: #0f172a;">📖 Guía de Recursos y Enlaces del Curso</h1>
  <p><b>Comunidad:</b> {clean_comm} | <b>Curso:</b> {clean_crs} | <b>Total Recursos:</b> {len(resources_list)}</p>
  <hr/>
  {gdoc_all_modules}
</body>
</html>"""
            gdoc_url = create_or_update_gdrive_doc("📖 Guia de Recursos y Enlaces (Google Doc)", gdoc_html, folder_id)

    # Sync local files to Google Drive as well
    process_gdrive_sync(md_path, context, storage_mode, gdrive_root)
    process_gdrive_sync(html_path, context, storage_mode, gdrive_root)
    
    return {"md": md_path, "html": html_path, "gdocUrl": gdoc_url}

# ==========================================
# DOWNLOAD WORKERS
# ==========================================

def download_file_worker(task_id, raw_url, filename, folder, storage_mode='local', gdrive_root='Skool Downloads', context=None):
    target_dir = resolve_target_dir(folder)
    clean_fn = clean_file_name(filename)
    target_path = os.path.join(target_dir, clean_fn)

    with DOWNLOAD_LOCK:
        ACTIVE_DOWNLOADS[task_id] = {
            "title": clean_fn,
            "url": raw_url,
            "folder": target_dir,
            "status": "downloading",
            "percent": 15,
            "message": f"📥 Descargando recurso: {clean_fn}",
            "started_at": time.time(),
            "context": context
        }

    print(f"\n📥 [Companion Server] Downloading Resource: {clean_fn}", flush=True)
    print(f"📁 Destination Folder: {target_dir}", flush=True)

    try:
        if 'drive.google.com/drive/folders' in raw_url:
            create_url_shortcut(target_path, raw_url, filename)
            cmd = [
                sys.executable, "-m", "gdown",
                "--folder", raw_url,
                "--remaining-ok",
                "-O", target_dir
            ]
            subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=get_exec_env())
            gid = process_gdrive_sync(target_path, context, storage_mode, gdrive_root, task_id)
            with DOWNLOAD_LOCK:
                if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                COMPLETED_DOWNLOADS[task_id] = {"title": clean_fn, "gdriveId": gid, "type": "resource"}
            return

        elif 'drive.google.com' in raw_url:
            create_url_shortcut(target_path, raw_url, filename)
            cmd = [
                sys.executable, "-m", "gdown",
                raw_url,
                "-O", target_path
            ]
            subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=get_exec_env())
            gid = process_gdrive_sync(target_path, context, storage_mode, gdrive_root, task_id)
            with DOWNLOAD_LOCK:
                if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                COMPLETED_DOWNLOADS[task_id] = {"title": clean_fn, "gdriveId": gid, "type": "resource"}
            return

        elif any(domain in raw_url for domain in ['figma.com', 'canva.com', 'notion.so', 'miro.com']):
            create_url_shortcut(target_path, raw_url, filename)
            gid = process_gdrive_sync(target_path + '.url', context, storage_mode, gdrive_root, task_id)
            with DOWNLOAD_LOCK:
                if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                COMPLETED_DOWNLOADS[task_id] = {"title": clean_fn, "gdriveId": gid, "type": "resource"}
            return

        direct_url = raw_url
        if 'dropbox.com' in direct_url:
            direct_url = direct_url.replace('dl=0', 'dl=1')

        req = urllib.request.Request(
            direct_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                'Referer': 'https://www.skool.com/'
            }
        )

        with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as response, open(target_path, 'wb') as out_file:
            total_size = response.headers.get('content-length')
            total_size = int(total_size) if total_size else None
            downloaded = 0

            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)

                if total_size:
                    pct = min(80, round((downloaded / total_size) * 80))
                    with DOWNLOAD_LOCK:
                        if task_id in ACTIVE_DOWNLOADS:
                            ACTIVE_DOWNLOADS[task_id]["percent"] = pct

        print(f"✅ [Companion Server] Saved resource: {target_path}", flush=True)
        gid = process_gdrive_sync(target_path, context, storage_mode, gdrive_root, task_id)

        if storage_mode == 'gdrive' and not gid:
            print(f"❌ [Companion Server] Resource {clean_fn} failed to upload to Google Drive", flush=True)
            with DOWNLOAD_LOCK:
                if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                FAILED_DOWNLOADS[task_id] = "Error: No se pudo subir el recurso a Google Drive"
        else:
            with DOWNLOAD_LOCK:
                if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                COMPLETED_DOWNLOADS[task_id] = {"title": clean_fn, "gdriveId": gid, "type": "resource", "completedAt": time.time()}

    except Exception as e:
        print(f"❌ [Companion Server] Resource error: {e}", flush=True)
        create_url_shortcut(target_path, raw_url, filename)
        with DOWNLOAD_LOCK:
            if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
            COMPLETED_DOWNLOADS[task_id] = {"title": clean_fn, "gdriveId": None, "type": "resource"}


def execute_ytdlp_download(task_id, url, title, folder, storage_mode='local', gdrive_root='Skool Downloads', context=None):
    target_dir = resolve_target_dir(folder)
    clean_t = clean_file_name(title)
    out_template = os.path.join(target_dir, f"{clean_t}.%(ext)s")

    # 1. If it's a Skool webpage URL, resolve the signed stream using session cookies
    download_url = url
    if "skool.com" in url and "stream.mux.com" not in url and ".m3u8" not in url:
        resolved = resolve_skool_video_stream(url, COOKIES_FILE)
        if resolved:
            download_url = resolved
            print(f"⚡ [Companion Server] Using resolved direct stream: {download_url[:70]}...", flush=True)

    # 2. If it's a Loom URL, sanitize to clean share URL for native yt-dlp extractor
    if "loom.com" in download_url:
        clean_lid = re.search(r'/(?:share|embed)/([a-f0-9]+)', download_url)
        if clean_lid:
            download_url = f"https://www.loom.com/share/{clean_lid.group(1)}"
            print(f"⚡ [Companion Server] Sanitized Loom URL: {download_url}", flush=True)

    cmd = [
        YTDLP_BIN,
        "--no-check-certificate",
        "--no-playlist",
        "--merge-output-format", "mp4",
        "--referer", "https://www.skool.com/",
        "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "--extractor-args", "youtube:player_client=android,web",
        "--concurrent-fragments", "10",
    ]
    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 50:
        cmd.extend(["--cookies", COOKIES_FILE])
    cmd.extend(["-o", out_template, download_url])

    with DOWNLOAD_LOCK:
        ACTIVE_DOWNLOADS[task_id] = {
            "title": clean_t,
            "url": download_url,
            "folder": target_dir,
            "status": "downloading",
            "percent": 10,
            "message": f"🚀 Descargando video: {clean_t}.mp4",
            "started_at": time.time(),
            "context": context
        }

    print(f"\n🚀 [Companion Server] Starting video task {task_id}: {clean_t}", flush=True)
    print(f"🔗 Target Stream: {download_url[:80]}...", flush=True)
    print(f"📁 Destination: {target_dir}", flush=True)

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=get_exec_env()
        )

        for line in process.stdout:
            match = re.search(r'\[download\]\s+([\d\.]+)%', line)
            if match:
                try:
                    pct = float(match.group(1))
                    scaled_pct = min(80, round(pct * 0.8))
                    with DOWNLOAD_LOCK:
                        if task_id in ACTIVE_DOWNLOADS:
                            ACTIVE_DOWNLOADS[task_id]["percent"] = scaled_pct
                except ValueError:
                    pass

        process.wait()

        if process.returncode == 0:
            final_mp4 = os.path.join(target_dir, f"{clean_t}.mp4")
            print(f"✅ [Companion Server] Completed MP4 video: {clean_t}.mp4", flush=True)
            
            gdrive_id = None
            if os.path.exists(final_mp4):
                fsize = round(os.path.getsize(final_mp4) / (1024*1024), 2)
                gdrive_id = process_gdrive_sync(final_mp4, context, storage_mode, gdrive_root, task_id)

            if storage_mode == 'gdrive' and not gdrive_id:
                print(f"❌ [Companion Server] Video {clean_t} failed to upload to Google Drive", flush=True)
                with DOWNLOAD_LOCK:
                    if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                    FAILED_DOWNLOADS[task_id] = "Error: No se pudo subir el archivo a Google Drive"
            else:
                with DOWNLOAD_LOCK:
                    if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                    COMPLETED_DOWNLOADS[task_id] = {
                        "title": clean_t,
                        "gdriveId": gdrive_id,
                        "sizeMB": fsize if os.path.exists(final_mp4) else None,
                        "type": "video",
                        "completedAt": time.time()
                    }
        else:
            print(f"❌ [Companion Server] Video exit code {process.returncode}", flush=True)
            with DOWNLOAD_LOCK:
                if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
                FAILED_DOWNLOADS[task_id] = f"Exit code {process.returncode}"

    except Exception as e:
        print(f"❌ [Companion Server] Video error: {e}", flush=True)
        with DOWNLOAD_LOCK:
            if task_id in ACTIVE_DOWNLOADS: del ACTIVE_DOWNLOADS[task_id]
            FAILED_DOWNLOADS[task_id] = str(e)


# ==========================================
# HTTP REQUEST HANDLER
# ==========================================

class DownloaderHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, *')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

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
                "version": "2.3.3",
                "ytdlp": os.path.exists(YTDLP_BIN),
                "ytdlpPath": YTDLP_BIN,
                "ffmpeg": os.path.exists(FFMPEG_BIN),
                "gdrive": True,
                "gdriveUser": GDRIVE_CACHE["user_email"]
            }).encode('utf-8'))

        elif self.path.startswith('/queue-status'):
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            with DOWNLOAD_LOCK:
                self.wfile.write(json.dumps({
                    "active": ACTIVE_DOWNLOADS,
                    "completed": COMPLETED_DOWNLOADS,
                    "failed": FAILED_DOWNLOADS
                }).encode('utf-8'))

        elif self.path.startswith('/audit-course'):
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            try:
                query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                community = query_params.get('community', [None])[0]
                course = query_params.get('course', [None])[0]
                gdrive_root = query_params.get('gdriveRoot', ['Skool Downloads'])[0]

                token = get_gdrive_access_token()
                parent_folder_ids = set()

                if course:
                    parts = []
                    if community: parts.append(clean_folder_name(community))
                    parts.append(clean_folder_name(course))
                    
                    course_folder_id = resolve_gdrive_folder_hierarchy(parts, gdrive_root, token)
                    if not course_folder_id:
                        self.wfile.write(json.dumps({
                            "success": True,
                            "totalVerified": 0,
                            "files": {}
                        }).encode('utf-8'))
                        return

                    parent_folder_ids.add(course_folder_id)
                    # Find all module subfolders inside course folder
                    sub_q = f"mimeType = 'application/vnd.google-apps.folder' and trashed = false and '{course_folder_id}' in parents"
                    sub_url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(sub_q)}&pageSize=100&fields=files(id,name)"
                    sub_req = urllib.request.Request(sub_url, headers={"Authorization": f"Bearer {token}"})
                    try:
                        with urllib.request.urlopen(sub_req, context=SSL_CTX, timeout=15) as res:
                            sub_folders = json.loads(res.read().decode('utf-8')).get('files', [])
                            for sf in sub_folders:
                                parent_folder_ids.add(sf['id'])
                    except Exception:
                        pass

                files = []
                if parent_folder_ids:
                    # Query only files within these specific folder IDs
                    parent_clauses = " or ".join([f"'{pid}' in parents" for pid in parent_folder_ids])
                    query = f"mimeType = 'video/mp4' and trashed = false and ({parent_clauses})"
                    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&pageSize=200&fields=files(id,name,size,parents,webViewLink)"
                    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                    with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
                        files = json.loads(res.read().decode('utf-8')).get('files', [])
                else:
                    query = "mimeType = 'video/mp4' and trashed = false"
                    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&pageSize=100&fields=files(id,name,size,parents,webViewLink)"
                    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                    with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
                        files = json.loads(res.read().decode('utf-8')).get('files', [])

                verified_map = {f['name'].replace('.mp4', ''): f for f in files}
                self.wfile.write(json.dumps({
                    "success": True,
                    "totalVerified": len(files),
                    "files": verified_map
                }).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

        elif self.path.startswith('/scan-course-resources'):
            query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            classroom_url = query_params.get('url', [None])[0] or "https://www.skool.com/ultimateeditors2/classroom/d0fb6bb7"
            
            result = scan_all_course_resources(classroom_url)
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))

        elif self.path == '/sync-cloud':
            trigger_background_cloud_sync()
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "Cloud sync initiated"}).encode('utf-8'))

        elif self.path == '/studio':
            self.send_response(301)
            self.send_header('Location', '/studio/')
            self.end_headers()

        elif self.path.startswith('/studio/') or self.path.startswith('/css/') or self.path.startswith('/js/') or self.path.startswith('/data/'):
            studio_dir = os.path.join(BASE_DIR, 'studio-web')
            clean_path = self.path.split('?')[0]
            if clean_path.startswith('/studio/'):
                sub_path = clean_path[len('/studio/'):]
            else:
                sub_path = clean_path.lstrip('/')

            if not sub_path or sub_path == '':
                target_file = os.path.join(studio_dir, 'index.html')
            else:
                target_file = os.path.join(studio_dir, sub_path)

            if os.path.exists(target_file) and os.path.isfile(target_file):
                ext = target_file.rsplit('.', 1)[-1].lower()
                mime = 'text/html'
                if ext == 'css': mime = 'text/css'
                elif ext == 'js': mime = 'application/javascript'
                elif ext == 'json': mime = 'application/json'
                elif ext == 'svg': mime = 'image/svg+xml'
                elif ext in ['png', 'jpg', 'jpeg', 'webp']: mime = f'image/{ext}'

                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', f'{mime}; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.end_headers()
                with open(target_file, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
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
                folder = data.get('folder') or 'Documentos/Skool Downloads'
                task_id = data.get('id') or clean_file_name(title)
                storage_mode = data.get('storageMode') or 'both'
                gdrive_root = data.get('gdriveRoot') or 'Skool Downloads'
                cookies = data.get('cookies')
                context = data.get('context')
                
                if cookies:
                    save_cookies(cookies)

                if not url:
                    raise ValueError("No URL provided")

                target_dir = resolve_target_dir(folder)
                clean_t = clean_file_name(title)

                t = threading.Thread(
                    target=execute_ytdlp_download,
                    args=(task_id, url, clean_t, target_dir, storage_mode, gdrive_root, context),
                    daemon=True
                )
                t.start()

                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "message": "Descarga iniciada",
                    "taskId": task_id,
                    "destination": target_dir,
                    "storageMode": storage_mode
                }).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

        elif self.path == '/download-file':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                url = data.get('url')
                filename = data.get('filename') or 'recurso.pdf'
                folder = data.get('folder') or 'Documentos/Skool Downloads'
                task_id = data.get('id') or clean_file_name(filename)
                storage_mode = data.get('storageMode') or 'both'
                gdrive_root = data.get('gdriveRoot') or 'Skool Downloads'
                context = data.get('context')

                if not url:
                    raise ValueError("No URL provided")

                target_dir = resolve_target_dir(folder)

                t = threading.Thread(
                    target=download_file_worker,
                    args=(task_id, url, filename, target_dir, storage_mode, gdrive_root, context),
                    daemon=True
                )
                t.start()

                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "message": "Descarga de recurso iniciada",
                    "taskId": task_id,
                    "destination": target_dir,
                    "storageMode": storage_mode
                }).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

        elif self.path == '/download-batch':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                items = data.get('items', [])
                folder = data.get('folder') or 'Documentos/Skool Downloads'
                storage_mode = data.get('storageMode') or 'both'
                gdrive_root = data.get('gdriveRoot') or 'Skool Downloads'
                cookies = data.get('cookies')

                if cookies:
                    save_cookies(cookies)

                started_count = 0
                for item in items:
                    url = item.get('url')
                    item_type = item.get('type') or 'video'
                    title = item.get('title') or 'Archivo'
                    item_folder = item.get('folder') or folder
                    task_id = item.get('id') or clean_file_name(title)
                    item_ctx = item.get('context')

                    if url:
                        with DOWNLOAD_LOCK:
                            COMPLETED_DOWNLOADS.pop(task_id, None)
                            FAILED_DOWNLOADS.pop(task_id, None)

                        if item_type == 'resource':
                            t = threading.Thread(
                                target=download_file_worker,
                                args=(task_id, url, title, item_folder, storage_mode, gdrive_root, item_ctx),
                                daemon=True
                            )
                        else:
                            t = threading.Thread(
                                target=execute_ytdlp_download,
                                args=(task_id, url, title, item_folder, storage_mode, gdrive_root, item_ctx),
                                daemon=True
                            )
                        
                        t.start()
                        started_count += 1
                        time.sleep(0.5)

                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "startedCount": started_count,
                    "message": f"Iniciadas {started_count} descargas en segundo plano",
                    "storageMode": storage_mode
                }).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
        elif self.path == '/generate-resource-guide':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                resources = data.get('resources', [])
                folder = data.get('folder') or 'Documentos/Skool_Downloads'
                community = data.get('community') or 'Comunidad'
                course = data.get('course') or 'Curso'
                storage_mode = data.get('storageMode') or 'both'
                gdrive_root = data.get('gdriveRoot') or 'Skool Downloads'
                context = data.get('context')

                target_dir = resolve_target_dir(folder)
                result = generate_aesthetic_resource_guide(
                    target_dir, resources, community, course, storage_mode, gdrive_root, context
                )

                self.send_response(200)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "files": result}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    server = HTTPServer(('127.0.0.1', PORT), DownloaderHandler)
    print(f"⚡ [Skool Downloader Bridge] Server v2.3.3 running on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...", flush=True)
        server.server_close()

if __name__ == '__main__':
    run_server()
