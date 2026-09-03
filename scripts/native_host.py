#!/usr/bin/env python3
"""
Chrome Native Messaging Host for Skool Video Downloader & Cinematic LMS Studio.
Communicates with Google Chrome via standard I/O using length-prefixed JSON.
Runs on-demand when a download is requested and terminates automatically when done.
"""

import sys
import os
import struct
import json
import re
import ssl
import time
import shutil
import threading
import subprocess
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COOKIES_FILE = os.path.join(BASE_DIR, "skool_session_cookies.txt")

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

def find_binary(name):
    candidates = [
        f"/opt/homebrew/bin/{name}",
        f"/usr/local/bin/{name}",
        f"/usr/bin/{name}",
        f"{os.path.expanduser('~')}/homebrew/bin/{name}",
        f"{os.path.expanduser('~')}/.local/bin/{name}"
    ]
    for c in candidates:
        if os.path.exists(c) and os.access(c, os.X_OK):
            return c
    return name

YTDLP_BIN = find_binary("yt-dlp")
FFMPEG_BIN = find_binary("ffmpeg")

def get_exec_env():
    env = os.environ.copy()
    env["PATH"] = f"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{env.get('PATH', '')}"
    return env

STDOUT_LOCK = threading.Lock()

def send_native_message(msg):
    """Send a length-prefixed JSON message back to Chrome over stdout."""
    try:
        raw = json.dumps(msg, ensure_ascii=False).encode('utf-8')
        length = len(raw)
        with STDOUT_LOCK:
            sys.stdout.buffer.write(struct.pack('@I', length))
            sys.stdout.buffer.write(raw)
            sys.stdout.buffer.flush()
    except Exception:
        pass

def read_native_message():
    """Read a length-prefixed JSON message from Chrome over stdin."""
    try:
        raw_length = sys.stdin.buffer.read(4)
        if len(raw_length) < 4:
            return None
        length = struct.unpack('@I', raw_length)[0]
        if length == 0:
            return None
        raw_data = sys.stdin.buffer.read(length)
        if len(raw_data) < length:
            return None
        return json.loads(raw_data.decode('utf-8'))
    except Exception:
        return None

def clean_file_name(name):
    if not name:
        return "Video"
    name = re.sub(r'[\/\\:\*\?"<>\|]', '_', str(name))
    name = re.sub(r'\s+', '_', name)
    return name.strip('._')

def clean_folder_name(name):
    if not name:
        return "General"
    name_str = str(name).strip()
    if 'ultimate' in name_str.lower() and 'editor' in name_str.lower():
        return "Ultimate Editors"
    name_str = re.sub(r'[\/\\:\*\?"<>\|]', '_', name_str)
    name_str = re.sub(r'[\s_]+', ' ', name_str).strip()
    return name_str

def resolve_target_dir(folder_path):
    folder_path = folder_path.strip().rstrip('/')
    if folder_path.startswith('/'):
        target = folder_path
    elif folder_path.startswith('~'):
        target = os.path.expanduser(folder_path)
    elif folder_path.startswith('Documentos/') or folder_path.startswith('Documents/'):
        sub = folder_path.split('/', 1)[1] if '/' in folder_path else ''
        target = os.path.join(os.path.expanduser('~/Documents'), sub)
    else:
        target = os.path.join(os.path.expanduser('~/Documents'), folder_path)
    os.makedirs(target, exist_ok=True)
    return target

def save_cookies(cookie_content):
    if not cookie_content:
        return
    try:
        with open(COOKIES_FILE, "w", encoding="utf-8") as f:
            f.write(cookie_content)
    except Exception:
        pass

def get_gdrive_access_token():
    try:
        token_paths = [
            os.path.expanduser("~/.gemini/gdrive_token.json"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "token.json"),
            os.path.join(os.path.expanduser("~"), ".skool_downloader_gdrive_token.json")
        ]
        token_file = next((p for p in token_paths if os.path.exists(p)), None)
        if not token_file:
            return None, None

        with open(token_file, 'r', encoding='utf-8') as f:
            tdata = json.load(f)

        access_token = tdata.get('token') or tdata.get('access_token')
        refresh_token = tdata.get('refresh_token')
        client_id = tdata.get('client_id')
        client_secret = tdata.get('client_secret')

        if refresh_token and client_id and client_secret:
            req_data = urllib.parse.urlencode({
                'grant_type': 'refresh_token',
                'client_id': client_id,
                'client_secret': client_secret,
                'refresh_token': refresh_token
            }).encode('utf-8')
            req = urllib.request.Request('https://oauth2.googleapis.com/token', data=req_data)
            try:
                with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
                    new_token_data = json.loads(res.read().decode('utf-8'))
                    access_token = new_token_data.get('access_token', access_token)
            except Exception:
                pass

        user = tdata.get('account') or tdata.get('user') or "r2d2201@gmail.com"
        return access_token, user
    except Exception:
        return None, None

GDRIVE_FOLDER_LOCK = threading.Lock()

def resolve_gdrive_folder_hierarchy(path_parts, root_name="Skool Downloads", token=None):
    if not token:
        return None

    with GDRIVE_FOLDER_LOCK:
        current_parent = 'root'
        all_parts = [root_name] + [p for p in path_parts if p]

        for part in all_parts:
            safe_name = part.replace("'", "\\'")
            query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe_name}' and trashed = false and '{current_parent}' in parents"
            url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&fields=files(id,name)&spaces=drive"
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

            found_id = None
            try:
                with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
                    files = json.loads(res.read().decode('utf-8')).get('files', [])
                    if files:
                        found_id = files[0]['id']
            except Exception:
                pass

            if not found_id:
                meta = {
                    'name': part,
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [current_parent]
                }
                c_req = urllib.request.Request(
                    'https://www.googleapis.com/drive/v3/files',
                    data=json.dumps(meta).encode('utf-8'),
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                )
                try:
                    with urllib.request.urlopen(c_req, context=SSL_CTX, timeout=15) as res:
                        found_id = json.loads(res.read().decode('utf-8'))['id']
                except Exception:
                    return None

            current_parent = found_id

        return current_parent

def upload_file_to_gdrive(local_file_path, parent_folder_id, token, task_id=None):
    """Chunked Resumable Upload (16MB fragments) handling files of any size (>2GB)."""
    if not os.path.exists(local_file_path) or not token:
        return None

    file_size = os.path.getsize(local_file_path)
    file_name = os.path.basename(local_file_path)

    mime_type = "video/mp4"
    if file_name.endswith(".pdf"): mime_type = "application/pdf"
    elif file_name.endswith(".zip"): mime_type = "application/zip"
    elif file_name.endswith(".png"): mime_type = "image/png"
    elif file_name.endswith(".jpg"): mime_type = "image/jpeg"

    # 1. Initiate Resumable Upload Session
    init_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"
    metadata = {
        "name": file_name,
        "parents": [parent_folder_id] if parent_folder_id else []
    }
    init_req = urllib.request.Request(
        init_url,
        data=json.dumps(metadata).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime_type,
            "X-Upload-Content-Length": str(file_size)
        }
    )

    with urllib.request.urlopen(init_req, context=SSL_CTX, timeout=30) as init_res:
        upload_url = init_res.headers.get("Location")

    if not upload_url:
        raise ValueError("Google Drive failed to return resumable upload session URL")

    # 2. Upload in 16 MB chunks
    chunk_size = 16 * 1024 * 1024
    file_id = None

    with open(local_file_path, "rb") as f:
        bytes_sent = 0
        while bytes_sent < file_size:
            chunk = f.read(chunk_size)
            if not chunk:
                break

            chunk_len = len(chunk)
            start_byte = bytes_sent
            end_byte = start_byte + chunk_len - 1

            headers = {
                "Content-Length": str(chunk_len),
                "Content-Range": f"bytes {start_byte}-{end_byte}/{file_size}"
            }

            req = urllib.request.Request(upload_url, data=chunk, headers=headers, method='PUT')
            try:
                with urllib.request.urlopen(req, context=SSL_CTX, timeout=120) as res:
                    if res.status in (200, 201):
                        resp_data = json.loads(res.read().decode('utf-8'))
                        file_id = resp_data.get('id')
            except urllib.error.HTTPError as e:
                if e.code == 308:
                    pass
                else:
                    raise e

            bytes_sent += chunk_len
            pct = min(99, int((bytes_sent / file_size) * 100))
            if task_id:
                send_native_message({
                    "type": "UPLOAD_PROGRESS",
                    "taskId": task_id,
                    "progress": pct,
                    "bytesSent": bytes_sent,
                    "totalBytes": file_size
                })

    return file_id

def update_course_catalog(context, file_name, gdrive_id):
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
    root_data_file = os.path.join(BASE_DIR, 'data', 'course-data.js')

    try:
        target_file = course_data_file if os.path.exists(course_data_file) else root_data_file
        if not os.path.exists(target_file):
            return

        with open(target_file, 'r', encoding='utf-8') as f:
            content = f.read()

        start_idx = content.find("window.COMMUNITIES_DATA")
        if start_idx == -1: return
        json_start = content.find("[", start_idx)
        if json_start == -1: return

        decoder = json.JSONDecoder()
        communities, _ = decoder.raw_decode(content[json_start:])

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
                "descriptionHtml": context.get('descriptionHtml') or "",
                "resources": resources
            }
            mod['lessons'].append(les)
        else:
            les['gdriveId'] = gdrive_id
            les['gdriveLink'] = f"https://drive.google.com/file/d/{gdrive_id}/view?usp=drivesdk"
            les['inDrive'] = True

        course['totalModules'] = len(course['modules'])
        course['totalLessons'] = sum(len(m.get('lessons', [])) for m in course['modules'])
        course['totalResources'] = sum(len(l.get('resources', [])) for m in course['modules'] for l in m.get('lessons', []))

        new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
        with open(course_data_file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        with open(root_data_file, 'w', encoding='utf-8') as f:
            f.write(new_content)

    except Exception:
        pass

def download_and_upload_task(task_id, item_type, url, title, item_folder, storage_mode, gdrive_root, context):
    try:
        target_dir = resolve_target_dir(item_folder)
        clean_t = clean_file_name(title)
        
        send_native_message({
            "type": "TASK_START",
            "taskId": task_id,
            "title": clean_t,
            "folder": target_dir
        })

        out_file = None

        if item_type == 'resource':
            parsed = urllib.parse.urlparse(url)
            ext = os.path.splitext(parsed.path)[1] or '.pdf'
            filename = f"{clean_t}{ext}"
            out_file = os.path.join(target_dir, filename)

            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": "https://www.skool.com/"
            })
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=30) as res, open(out_file, 'wb') as f:
                f.write(res.read())

            send_native_message({
                "type": "DOWNLOAD_PROGRESS",
                "taskId": task_id,
                "progress": 100
            })

        else:
            out_template = os.path.join(target_dir, f"{clean_t}.%(ext)s")
            download_url = url

            # Loom URL clean
            if "loom.com" in download_url:
                clean_lid = re.search(r'/(?:share|embed)/([a-f0-9]+)', download_url)
                if clean_lid:
                    download_url = f"https://www.loom.com/share/{clean_lid.group(1)}"

            cmd = [
                YTDLP_BIN,
                "--no-check-certificate",
                "--no-playlist",
                "--merge-output-format", "mp4",
                "--referer", "https://www.skool.com/",
                "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "--extractor-args", "youtube:player_client=android,web",
                "--concurrent-fragments", "10",
                "--newline"
            ]
            if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 50:
                cmd.extend(["--cookies", COOKIES_FILE])
            cmd.extend(["-o", out_template, download_url])

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                env=get_exec_env()
            )

            progress_pattern = re.compile(r'\[download\]\s+(\d+\.?\d*)%')
            for line in proc.stdout:
                m = progress_pattern.search(line)
                if m:
                    pct = float(m.group(1))
                    send_native_message({
                        "type": "DOWNLOAD_PROGRESS",
                        "taskId": task_id,
                        "progress": pct
                    })

            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f"yt-dlp exited with code {proc.returncode}")

            # Locate downloaded output file
            for ext in ['mp4', 'mkv', 'webm', 'mov']:
                cand = os.path.join(target_dir, f"{clean_t}.{ext}")
                if os.path.exists(cand):
                    out_file = cand
                    break

        if not out_file or not os.path.exists(out_file):
            raise FileNotFoundError(f"Output file not found for task {task_id}")

        gdrive_id = None
        if storage_mode in ('gdrive', 'both'):
            token, _ = get_gdrive_access_token()
            if token:
                parts = []
                if context and isinstance(context, dict):
                    if context.get('community'): parts.append(clean_folder_name(context['community']))
                    if context.get('course'): parts.append(clean_folder_name(context['course']))
                    if context.get('module'): parts.append(clean_folder_name(context['module']))

                parent_id = resolve_gdrive_folder_hierarchy(parts, gdrive_root, token)
                gdrive_id = upload_file_to_gdrive(out_file, parent_id, token, task_id)
                if gdrive_id:
                    update_course_catalog(context, os.path.basename(out_file), gdrive_id)

                if storage_mode == 'gdrive' and os.path.exists(out_file):
                    try:
                        os.remove(out_file)
                        curr_dir = target_dir
                        for _ in range(4):
                            if os.path.exists(curr_dir) and not os.listdir(curr_dir):
                                os.rmdir(curr_dir)
                                curr_dir = os.path.dirname(curr_dir)
                            else:
                                break
                    except Exception:
                        pass

        send_native_message({
            "type": "TASK_COMPLETED",
            "taskId": task_id,
            "title": clean_t,
            "gdriveId": gdrive_id,
            "localFile": out_file if storage_mode in ('local', 'both') else None
        })

    except Exception as e:
        send_native_message({
            "type": "TASK_ERROR",
            "taskId": task_id,
            "error": str(e)
        })

def handle_message(msg):
    action = msg.get("action")

    if action == "PING" or action == "STATUS":
        token, user = get_gdrive_access_token()
        send_native_message({
            "success": True,
            "status": "online",
            "mode": "native_messaging",
            "ytdlp": bool(YTDLP_BIN and os.path.exists(YTDLP_BIN)),
            "ytdlpPath": YTDLP_BIN,
            "ffmpeg": bool(FFMPEG_BIN and os.path.exists(FFMPEG_BIN)),
            "gdrive": bool(token),
            "gdriveUser": user or "Google Drive Conectado"
        })

    elif action == "DOWNLOAD":
        cookies = msg.get("cookies")
        if cookies: save_cookies(cookies)

        task_id = msg.get("id") or clean_file_name(msg.get("title"))
        threading.Thread(
            target=download_and_upload_task,
            args=(
                task_id,
                msg.get("type", "video"),
                msg.get("url"),
                msg.get("title", "Video"),
                msg.get("folder", "Documentos/Skool Downloads"),
                msg.get("storageMode", "both"),
                msg.get("gdriveRoot", "Skool Downloads"),
                msg.get("context")
            ),
            daemon=True
        ).start()

    elif action == "DOWNLOAD_BATCH":
        cookies = msg.get("cookies")
        if cookies: save_cookies(cookies)

        items = msg.get("items", [])
        folder = msg.get("folder", "Documentos/Skool Downloads")
        storage_mode = msg.get("storageMode", "both")
        gdrive_root = msg.get("gdriveRoot", "Skool Downloads")

        send_native_message({
            "type": "BATCH_STARTED",
            "totalItems": len(items)
        })

        def run_batch():
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = []
                for item in items:
                    t_id = item.get("id") or clean_file_name(item.get("title"))
                    futures.append(executor.submit(
                        download_and_upload_task,
                        t_id,
                        item.get("type", "video"),
                        item.get("url"),
                        item.get("title", "Archivo"),
                        item.get("folder") or folder,
                        storage_mode,
                        gdrive_root,
                        item.get("context")
                    ))
                for f in futures:
                    try:
                        f.result()
                    except Exception:
                        pass

            send_native_message({
                "type": "BATCH_COMPLETED",
                "totalItems": len(items)
            })

        threading.Thread(target=run_batch, daemon=True).start()

    elif action == "AUDIT_COURSE":
        token, _ = get_gdrive_access_token()
        if not token:
            send_native_message({"success": False, "error": "No Google Drive token"})
            return

        community = msg.get("community")
        course = msg.get("course")
        gdrive_root = msg.get("gdriveRoot", "Skool Downloads")

        parts = []
        if community: parts.append(clean_folder_name(community))
        if course: parts.append(clean_folder_name(course))

        course_folder_id = resolve_gdrive_folder_hierarchy(parts, gdrive_root, token)
        if not course_folder_id:
            send_native_message({"success": True, "totalVerified": 0, "files": {}})
            return

        parent_folder_ids = {course_folder_id}
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

        parent_clauses = " or ".join([f"'{pid}' in parents" for pid in parent_folder_ids])
        query = f"mimeType = 'video/mp4' and trashed = false and ({parent_clauses})"
        url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&pageSize=200&fields=files(id,name,size,parents,webViewLink)"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
            files = json.loads(res.read().decode('utf-8')).get('files', [])

        verified_map = {f['name'].replace('.mp4', ''): f for f in files}
        send_native_message({
            "success": True,
            "totalVerified": len(files),
            "files": verified_map
        })

def main():
    while True:
        msg = read_native_message()
        if msg is None:
            break
        handle_message(msg)

if __name__ == "__main__":
    main()
