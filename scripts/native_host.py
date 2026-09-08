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
import mimetypes
import fcntl
import urllib.request
import urllib.parse
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
from catalog_store import course_status, reconcile_course
from drive_library import resolve_path as resolve_drive_path
from video_quality import (
    VIDEO_QUALITY_FORMATS,
    expected_video_height,
    inspect_available_formats,
    normalize_video_quality,
    verify_downloaded_quality,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG_LOCK_FILE = os.path.join(BASE_DIR, ".course_catalog.lock")

SSL_CTX = ssl.create_default_context()

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
FFPROBE_BIN = find_binary("ffprobe")

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
    low = name_str.lower()
    if any(k in low for k in ['ultimateeditors2', 'ultimate_editors_2', 'ultimate-editors-2', 'ultimate editors 2']):
        return 'Ultimate Editors 2.0'
    if any(k in low for k in ['ultimate-editors-5412', 'ultimate_editors_5412', 'ultimateeditors', 'ultimate editors']):
        return 'Ultimate editors'

    name_str = re.sub(r'[\/\\:\*\?"<>\|]', '_', name_str)
    name_str = re.sub(r'[\s_]+', ' ', name_str).strip()
    return name_str or "General"

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

CATALOG_THREAD_LOCK = threading.Lock()

@contextmanager
def catalog_write_lock():
    """Serialize catalog writes across native-host and companion-server processes."""
    with CATALOG_THREAD_LOCK:
        with open(CATALOG_LOCK_FILE, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

def atomic_write_text(path, content):
    temp_path = f"{path}.tmp.{os.getpid()}.{threading.get_ident()}"
    with open(temp_path, "w", encoding="utf-8") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, path)

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

def resolve_gdrive_folder_hierarchy(path_parts, root_name="Skool Downloads", token=None, root_id=None, create=True):
    if not token:
        return None

    with GDRIVE_FOLDER_LOCK:
        normalized_parts = [clean_folder_name(part) for part in path_parts if part]
        if root_id:
            return resolve_drive_path(token, normalized_parts, root_id=root_id, create=create)
        return resolve_drive_path(
            token,
            [clean_folder_name(root_name)] + normalized_parts,
            root_id='root',
            create=create,
        )

def list_gdrive_descendant_folders(root_folder_id, token, max_depth=4):
    folder_ids = {root_folder_id}
    frontier = {root_folder_id}
    for _ in range(max_depth):
        if not frontier:
            break
        next_frontier = set()
        parent_ids = list(frontier)
        for start in range(0, len(parent_ids), 25):
            chunk = parent_ids[start:start + 25]
            parent_query = " or ".join(f"'{folder_id}' in parents" for folder_id in chunk)
            query = f"mimeType = 'application/vnd.google-apps.folder' and trashed = false and ({parent_query})"
            url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&pageSize=1000&fields=files(id)"
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as response:
                for folder in json.loads(response.read().decode('utf-8')).get('files', []):
                    folder_id = folder.get('id')
                    if folder_id and folder_id not in folder_ids:
                        folder_ids.add(folder_id)
                        next_frontier.add(folder_id)
        frontier = next_frontier
    return folder_ids

def upload_file_to_gdrive(local_file_path, parent_folder_id, token, task_id=None, replace_file_id=None):
    """Chunked Resumable Upload (16MB fragments) handling files of any size (>2GB)."""
    if not os.path.exists(local_file_path) or not token:
        return None

    file_size = os.path.getsize(local_file_path)
    file_name = os.path.basename(local_file_path)

    mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    if file_name.lower().endswith('.url'):
        mime_type = 'text/plain'

    # 1. Initiate Resumable Upload Session
    if replace_file_id:
        init_url = f"https://www.googleapis.com/upload/drive/v3/files/{replace_file_id}?uploadType=resumable"
        metadata = {"name": file_name}
        init_method = "PATCH"
    else:
        init_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"
        metadata = {
            "name": file_name,
            "parents": [parent_folder_id] if parent_folder_id else []
        }
        init_method = "POST"
    init_req = urllib.request.Request(
        init_url,
        data=json.dumps(metadata).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime_type,
            "X-Upload-Content-Length": str(file_size)
        },
        method=init_method
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

    return file_id or replace_file_id

def _positive_int(value, fallback):
    try:
        parsed = int(value)
        return parsed if parsed > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def probe_video_metadata(path, requested_quality='best'):
    metadata = {
        'requestedQuality': normalize_video_quality(requested_quality),
        'fileSizeBytes': os.path.getsize(path) if os.path.exists(path) else None,
    }
    if not os.path.exists(path):
        return metadata
    try:
        result = subprocess.run(
            [
                FFPROBE_BIN, '-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height:format=duration',
                '-of', 'json', path
            ],
            capture_output=True,
            text=True,
            timeout=30,
            env=get_exec_env(),
            check=True,
        )
        payload = json.loads(result.stdout or '{}')
        stream = (payload.get('streams') or [{}])[0]
        metadata['actualWidth'] = stream.get('width')
        metadata['actualHeight'] = stream.get('height')
        duration = (payload.get('format') or {}).get('duration')
        metadata['durationSeconds'] = round(float(duration), 3) if duration else None
    except Exception:
        pass
    return metadata

def _catalog_sort_key(item):
    return (_positive_int(item.get('index'), 10 ** 9), str(item.get('title') or item.get('rawTitle') or ''))

def _merge_resource_metadata(existing_resources, incoming_resources):
    merged = [dict(resource) for resource in (existing_resources or []) if isinstance(resource, dict)]
    for incoming in incoming_resources:
        match = next((resource for resource in merged if
            (incoming.get('id') and resource.get('id') == incoming.get('id')) or
            (incoming.get('url') and resource.get('url') == incoming.get('url'))), None)
        if match:
            drive_metadata = {key: match.get(key) for key in ('gdriveId', 'gdriveLink', 'inDrive') if key in match}
            match.update(incoming)
            match.update(drive_metadata)
        else:
            merged.append(dict(incoming))
    return merged

def update_course_catalog(context, file_name, gdrive_id, item_type='video', source_url=None, resource_id=None, video_metadata=None):
    """Atomically upsert one downloaded item without allowing completion order to reorder the course."""
    if not context or not gdrive_id:
        return

    community_name = clean_folder_name(context.get('community') or 'Comunidad Skool')
    course_name = clean_folder_name(context.get('course') or 'Curso')
    module_name = clean_folder_name(context.get('module') or 'General')
    lesson_title = str(context.get('lessonTitle') or file_name.rsplit('.', 1)[0]).strip()
    module_index = _positive_int(context.get('moduleIndex'), 10 ** 6)
    lesson_index = _positive_int(context.get('lessonIndexInModule') or context.get('lessonIndex'), 10 ** 6)
    lesson_id = context.get('lessonId') or f"les_{re.sub(r'[^a-zA-Z0-9]', '-', lesson_title).lower()}"
    context_resources = [dict(resource) for resource in (context.get('resources') or []) if isinstance(resource, dict)]

    comm_id = re.sub(r'[^a-zA-Z0-9]', '', community_name).lower() or 'community'
    course_id = re.sub(r'[^a-zA-Z0-9]', '-', course_name).lower()
    course_id = re.sub(r'-+', '-', course_id).strip('-') or 'course'
    course_data_file = os.path.join(BASE_DIR, 'studio-web', 'data', 'course-data.js')
    root_data_file = os.path.join(BASE_DIR, 'data', 'course-data.js')

    try:
        with catalog_write_lock():
            target_file = course_data_file if os.path.exists(course_data_file) else root_data_file
            if not os.path.exists(target_file):
                return

            with open(target_file, 'r', encoding='utf-8') as handle:
                content = handle.read()
            start_idx = content.find("window.COMMUNITIES_DATA")
            json_start = content.find("[", start_idx)
            if start_idx == -1 or json_start == -1:
                raise ValueError('No se encontró window.COMMUNITIES_DATA en el catálogo')
            communities, _ = json.JSONDecoder().raw_decode(content[json_start:])

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

            course = next((c for c in comm.get('courses', []) if c.get('id') == course_id or c.get('courseTitle') == course_name), None)
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
                comm.setdefault('courses', []).append(course)

            modules = course.setdefault('modules', [])
            mod = next((m for m in modules if m.get('title') == module_name or m.get('folder') == module_name), None)
            if not mod:
                mod = {"index": module_index, "folder": module_name, "title": module_name, "lessons": []}
                modules.append(mod)
            elif context.get('moduleIndex'):
                mod['index'] = module_index

            lessons = mod.setdefault('lessons', [])
            les = next((lesson for lesson in lessons if lesson.get('id') == lesson_id), None)
            if not les:
                les = next((lesson for lesson in lessons if lesson.get('title') == lesson_title or lesson.get('rawTitle') == lesson_title), None)
            if not les:
                les = {
                    "id": lesson_id,
                    "slug": str(lesson_id)[:8],
                    "index": lesson_index,
                    "globalIndex": _positive_int(context.get('globalLessonIndex') or context.get('lessonIndex'), lesson_index),
                    "title": lesson_title,
                    "rawTitle": lesson_title,
                    "module": module_name,
                    "moduleIndex": module_index,
                    "inDrive": False,
                    "descriptionHtml": context.get('descriptionHtml') or "",
                    "resources": context_resources
                }
                lessons.append(les)
            else:
                if context.get('lessonIndexInModule') or context.get('lessonIndex'):
                    les['index'] = lesson_index
                les['moduleIndex'] = module_index
                if context.get('descriptionHtml'):
                    les['descriptionHtml'] = context['descriptionHtml']

            if item_type == 'resource':
                resources = les.setdefault('resources', [])
                source_resource = next((resource for resource in context_resources if
                    (resource_id and resource.get('id') == resource_id) or
                    (source_url and resource.get('url') == source_url) or
                    resource.get('name') == file_name), None)
                if source_resource is None:
                    source_resource = {"id": resource_id, "name": file_name, "url": source_url}
                match = next((resource for resource in resources if
                    (resource_id and resource.get('id') == resource_id) or
                    (source_url and resource.get('url') == source_url)), None)
                if not match:
                    match = dict(source_resource)
                    resources.append(match)
                match.update({
                    "gdriveId": gdrive_id,
                    "gdriveLink": f"https://drive.google.com/file/d/{gdrive_id}/view?usp=drivesdk",
                    "inDrive": True
                })
            else:
                les.update({
                    "gdriveId": gdrive_id,
                    "gdriveLink": f"https://drive.google.com/file/d/{gdrive_id}/view?usp=drivesdk",
                    "inDrive": True
                })
                if video_metadata:
                    les.update({key: value for key, value in video_metadata.items() if value is not None})
                if context_resources:
                    les['resources'] = _merge_resource_metadata(les.get('resources'), context_resources)

            modules.sort(key=_catalog_sort_key)
            global_index = 1
            for module_position, module in enumerate(modules, 1):
                module['index'] = _positive_int(module.get('index'), module_position)
                module_lessons = module.setdefault('lessons', [])
                module_lessons.sort(key=_catalog_sort_key)
                for lesson_position, lesson in enumerate(module_lessons, 1):
                    lesson['index'] = _positive_int(lesson.get('index'), lesson_position)
                    lesson['moduleIndex'] = module['index']
                    lesson['globalIndex'] = global_index
                    global_index += 1

            course['totalModules'] = len(modules)
            course['totalLessons'] = sum(len(module.get('lessons', [])) for module in modules)
            course['totalResources'] = sum(len(lesson.get('resources', [])) for module in modules for lesson in module.get('lessons', []))

            new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
            atomic_write_text(course_data_file, new_content)
            atomic_write_text(root_data_file, new_content)
    except Exception as exc:
        send_native_message({"type": "CATALOG_WARNING", "error": str(exc)})

RESOURCE_LINK_HOSTS = {
    'drive.google.com', 'docs.google.com', 'figma.com', 'www.figma.com',
    'canva.com', 'www.canva.com', 'notion.so', 'www.notion.so',
    'github.com', 'dropbox.com', 'www.dropbox.com'
}

def download_resource_to_disk(url, clean_title, target_dir):
    """Stream a file resource, or preserve web resources as clickable .url shortcuts."""
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc.lower().split(':')[0]
    if host in RESOURCE_LINK_HOSTS or any(host.endswith(f'.{domain}') for domain in RESOURCE_LINK_HOSTS):
        shortcut_name = clean_title if clean_title.lower().endswith('.url') else f"{clean_title}.url"
        shortcut_path = os.path.join(target_dir, shortcut_name)
        with open(shortcut_path, 'w', encoding='utf-8') as handle:
            handle.write(f"[InternetShortcut]\nURL={url}\n")
        return shortcut_path

    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://www.skool.com/"
    })
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as response:
        content_type = (response.headers.get_content_type() or '').lower()
        if content_type == 'text/html':
            shortcut_name = clean_title if clean_title.lower().endswith('.url') else f"{clean_title}.url"
            shortcut_path = os.path.join(target_dir, shortcut_name)
            with open(shortcut_path, 'w', encoding='utf-8') as handle:
                handle.write(f"[InternetShortcut]\nURL={url}\n")
            return shortcut_path

        title_root, title_ext = os.path.splitext(clean_title)
        path_ext = os.path.splitext(parsed.path)[1]
        guessed_ext = mimetypes.guess_extension(content_type) if content_type else None
        extension = title_ext or path_ext or guessed_ext or '.bin'
        output_name = clean_title if title_ext else f"{clean_title}{extension}"
        output_path = os.path.join(target_dir, output_name)
        with open(output_path, 'wb') as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
        return output_path

def _sync_cloud_catalog_locked():
    """Publish one catalog update through Git integration, without a second Vercel CLI deployment."""
    env = get_exec_env()
    git_bin = shutil.which('git', path=env['PATH']) or '/usr/bin/git'
    catalog_paths = ['data/course-data.js', 'studio-web/data/course-data.js']
    subprocess.run([git_bin, 'add', '--', *catalog_paths], cwd=BASE_DIR, env=env, check=True, capture_output=True, text=True)
    diff_result = subprocess.run([git_bin, 'diff', '--cached', '--quiet', '--', *catalog_paths], cwd=BASE_DIR, env=env)
    if diff_result.returncode == 0:
        return {"success": True, "noChanges": True}
    if diff_result.returncode != 1:
        raise RuntimeError('No se pudo comprobar el estado del catálogo antes de sincronizar.')

    subprocess.run(
        [git_bin, 'commit', '-m', 'chore: sync course catalog', '--', *catalog_paths],
        cwd=BASE_DIR, env=env, check=True, capture_output=True, text=True
    )
    branch = subprocess.run(
        [git_bin, 'rev-parse', '--abbrev-ref', 'HEAD'],
        cwd=BASE_DIR, env=env, check=True, capture_output=True, text=True
    ).stdout.strip()
    subprocess.run([git_bin, 'push', 'origin', branch], cwd=BASE_DIR, env=env, check=True, capture_output=True, text=True)
    return {"success": True, "noChanges": False, "branch": branch}

def sync_cloud_catalog():
    with catalog_write_lock():
        return _sync_cloud_catalog_locked()

def download_and_upload_task(task_id, item_type, url, title, item_folder, storage_mode, gdrive_root, gdrive_root_id, context, quality='best', duplicate_policy='skip', existing_gdrive_id=None):
    try:
        target_dir = resolve_target_dir(item_folder)
        clean_t = clean_file_name(title)
        
        out_file = None
        format_report = None

        if item_type == 'resource':
            send_native_message({
                "type": "TASK_START",
                "taskId": task_id,
                "title": clean_t,
                "folder": target_dir
            })
            out_file = download_resource_to_disk(url, clean_t, target_dir)

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

            selected_quality = normalize_video_quality(quality or (context or {}).get('videoQuality'))
            format_report = inspect_available_formats(YTDLP_BIN, download_url, get_exec_env())
            expected_height = expected_video_height(format_report, selected_quality)
            send_native_message({
                "type": "QUALITY_CHECK",
                "taskId": task_id,
                "requestedQuality": selected_quality,
                "availableHeights": format_report.get('availableHeights') or [],
                "sourceMaxHeight": format_report.get('maxHeight'),
                "expectedHeight": expected_height,
            })
            send_native_message({
                "type": "TASK_START",
                "taskId": task_id,
                "title": clean_t,
                "folder": target_dir
            })
            cmd = [
                YTDLP_BIN,
                "--no-playlist",
                "--format", VIDEO_QUALITY_FORMATS[selected_quality],
                "--merge-output-format", "mp4",
                "--referer", "https://www.skool.com/",
                "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "--concurrent-fragments", "3",
                "--newline"
            ]
            if duplicate_policy == 'replace':
                cmd.append('--force-overwrites')
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

        video_metadata = probe_video_metadata(out_file, quality) if item_type != 'resource' else None
        if item_type != 'resource':
            video_metadata = verify_downloaded_quality(video_metadata, format_report, quality)
        gdrive_id = None
        if storage_mode in ('gdrive', 'both'):
            token, _ = get_gdrive_access_token()
            if not token:
                raise RuntimeError('Google Drive no está conectado o el token expiró.')
            replacement_id = existing_gdrive_id if item_type != 'resource' and duplicate_policy == 'replace' else None
            parent_id = 'existing-file-parent' if replacement_id else None
            if not replacement_id:
                parts = []
                if context and isinstance(context, dict):
                    if context.get('community'): parts.append(clean_folder_name(context['community']))
                    if context.get('course'): parts.append(clean_folder_name(context['course']))
                    if context.get('module'): parts.append(clean_folder_name(context['module']))
                    if context.get('groupLessonPack', True) and context.get('lessonTitle'):
                        lesson_number = _positive_int(context.get('lessonIndexInModule') or context.get('lessonIndex'), 1)
                        parts.append(clean_folder_name(f"{lesson_number:02d}_{context['lessonTitle']}"))
                parent_id = resolve_gdrive_folder_hierarchy(parts, gdrive_root, token, gdrive_root_id)
            if not parent_id:
                raise RuntimeError('No se pudo crear o localizar la carpeta de Google Drive.')
            gdrive_id = upload_file_to_gdrive(out_file, parent_id, token, task_id, replacement_id)
            if not gdrive_id:
                raise RuntimeError('Google Drive no confirmó la subida del archivo.')
            update_course_catalog(
                context,
                os.path.basename(out_file),
                gdrive_id,
                item_type=item_type,
                source_url=url,
                resource_id=task_id if item_type == 'resource' else None,
                video_metadata=video_metadata
            )

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
            "localFile": out_file if storage_mode in ('local', 'both') else None,
            "itemType": item_type,
            "requestedQuality": (video_metadata or {}).get('requestedQuality'),
            "actualHeight": (video_metadata or {}).get('actualHeight'),
            "sourceMaxHeight": (video_metadata or {}).get('sourceMaxHeight'),
            "expectedHeight": (video_metadata or {}).get('expectedHeight'),
            "replaced": bool(existing_gdrive_id and duplicate_policy == 'replace')
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
                msg.get("gdriveRootId"),
                msg.get("context"),
                msg.get("quality", "best"),
                msg.get("duplicatePolicy", "skip"),
                msg.get("existingGdriveId")
            ),
            daemon=False
        ).start()

    elif action == "DOWNLOAD_BATCH":
        items = msg.get("items", [])
        folder = msg.get("folder", "Documentos/Skool Downloads")
        storage_mode = msg.get("storageMode", "both")
        gdrive_root = msg.get("gdriveRoot", "Skool Downloads")
        gdrive_root_id = msg.get("gdriveRootId")

        send_native_message({
            "type": "BATCH_STARTED",
            "totalItems": len(items)
        })

        def run_batch():
            with ThreadPoolExecutor(max_workers=2) as executor:
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
                        gdrive_root_id,
                        item.get("context"),
                        item.get("quality", "best"),
                        item.get("duplicatePolicy", "skip"),
                        item.get("existingGdriveId")
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

        threading.Thread(target=run_batch, daemon=False).start()

    elif action == "SYNC_CLOUD":
        def run_cloud_sync():
            try:
                result = sync_cloud_catalog()
                send_native_message({
                    "type": "CLOUD_SYNC_COMPLETED",
                    "noChanges": result.get("noChanges", False),
                    "branch": result.get("branch")
                })
            except Exception as exc:
                send_native_message({"type": "CLOUD_SYNC_ERROR", "error": str(exc)})

        threading.Thread(target=run_cloud_sync, daemon=False).start()

    elif action == "GET_COURSE_STATUS":
        try:
            send_native_message(course_status(
                BASE_DIR,
                clean_folder_name(msg.get('community') or 'Comunidad Skool'),
                clean_folder_name(msg.get('course') or 'Curso'),
            ))
        except Exception as exc:
            send_native_message({"success": False, "error": str(exc)})

    elif action == "RECONCILE_COURSE":
        try:
            send_native_message(reconcile_course(
                BASE_DIR,
                clean_folder_name(msg.get('community') or 'Comunidad Skool'),
                clean_folder_name(msg.get('course') or 'Curso'),
                msg.get('tree') or {},
            ))
        except Exception as exc:
            send_native_message({"success": False, "error": str(exc)})

    elif action == "AUDIT_COURSE":
        token, _ = get_gdrive_access_token()
        if not token:
            send_native_message({"success": False, "error": "No Google Drive token"})
            return

        community = msg.get("community")
        course = msg.get("course")
        gdrive_root = msg.get("gdriveRoot", "Skool Downloads")
        gdrive_root_id = msg.get("gdriveRootId")

        parts = []
        if community: parts.append(clean_folder_name(community))
        if course: parts.append(clean_folder_name(course))

        course_folder_id = resolve_gdrive_folder_hierarchy(parts, gdrive_root, token, gdrive_root_id, create=False)
        if not course_folder_id:
            send_native_message({"success": True, "totalVerified": 0, "files": {}})
            return

        parent_folder_ids = list(list_gdrive_descendant_folders(course_folder_id, token))
        files = []
        for start in range(0, len(parent_folder_ids), 25):
            chunk = parent_folder_ids[start:start + 25]
            parent_clauses = " or ".join([f"'{pid}' in parents" for pid in chunk])
            query = f"mimeType = 'video/mp4' and trashed = false and ({parent_clauses})"
            url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(query)}&pageSize=1000&fields=files(id,name,size,parents,webViewLink)"
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=20) as res:
                files.extend(json.loads(res.read().decode('utf-8')).get('files', []))

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
