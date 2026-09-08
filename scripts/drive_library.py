"""Small Google Drive folder API used by the local companion and native host.

All operations receive an OAuth token in memory. Tokens are never logged or
written by this module. Folder destinations are represented by stable IDs,
instead of paths assembled from display names.
"""

from __future__ import annotations

import json
import re
import ssl
import urllib.parse
import urllib.request


API_BASE = "https://www.googleapis.com/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"
SSL_CONTEXT = ssl.create_default_context()


class DriveFolderError(RuntimeError):
    pass


def _folder_id(value, allow_root=True):
    candidate = str(value or "").strip()
    if allow_root and candidate == "root":
        return candidate
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,200}", candidate):
        raise DriveFolderError("ID de carpeta de Google Drive inválido.")
    return candidate


def _request_json(token, path, query=None, method="GET", payload=None, timeout=25):
    if not token:
        raise DriveFolderError("Google Drive no está conectado.")
    url = f"{API_BASE}{path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if payload is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, context=SSL_CONTEXT, timeout=timeout) as response:
        raw = response.read()
    return json.loads(raw.decode("utf-8")) if raw else {}


def get_item(token, item_id):
    item_id = _folder_id(item_id)
    return _request_json(token, f"/files/{urllib.parse.quote(item_id)}", {
        "fields": "id,name,mimeType,parents,trashed,webViewLink,size,md5Checksum,capabilities(canAddChildren,canMoveChildrenWithinDrive,canMoveItemWithinDrive)",
    })


def verify_folder(token, folder_id):
    if folder_id == "root":
        return {
            "id": "root",
            "name": "Mi unidad",
            "mimeType": FOLDER_MIME,
            "parents": [],
            "trashed": False,
            "capabilities": {"canAddChildren": True},
        }
    item = get_item(token, folder_id)
    if item.get("trashed") or item.get("mimeType") != FOLDER_MIME:
        raise DriveFolderError("La carpeta elegida no existe o está en la papelera.")
    return item


def list_children(token, parent_id, folders_only=False):
    parent_id = _folder_id(parent_id)
    clauses = [f"'{parent_id}' in parents", "trashed = false"]
    if folders_only:
        clauses.append(f"mimeType = '{FOLDER_MIME}'")
    query_text = " and ".join(clauses)
    page_token = None
    results = []
    while True:
        query = {
            "q": query_text,
            "spaces": "drive",
            "pageSize": 1000,
            "orderBy": "folder,name_natural",
            "fields": "nextPageToken,files(id,name,mimeType,parents,trashed,webViewLink,size,md5Checksum)",
        }
        if page_token:
            query["pageToken"] = page_token
        response = _request_json(token, "/files", query)
        results.extend(response.get("files") or [])
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return results


def list_folders(token, parent_id):
    return list_children(token, parent_id, folders_only=True)


def create_folder(token, parent_id, name):
    parent = verify_folder(token, parent_id)
    if parent.get("capabilities", {}).get("canAddChildren") is False:
        raise DriveFolderError("No tienes permiso para crear carpetas en este destino.")
    clean_name = re.sub(r"[\\/:*?\"<>|]", " ", str(name or ""))
    clean_name = re.sub(r"\s+", " ", clean_name).strip()
    if not clean_name:
        raise DriveFolderError("Escribe un nombre para la carpeta.")
    return _request_json(token, "/files", {
        "fields": "id,name,mimeType,parents,trashed,webViewLink",
    }, method="POST", payload={
        "name": clean_name,
        "mimeType": FOLDER_MIME,
        "parents": [_folder_id(parent_id)],
    })


def breadcrumb(token, folder_id):
    folder_id = _folder_id(folder_id)
    if folder_id == "root":
        return [{"id": "root", "name": "Mi unidad"}]
    chain = []
    seen = set()
    current_id = folder_id
    while current_id and current_id != "root" and current_id not in seen and len(chain) < 30:
        seen.add(current_id)
        current = verify_folder(token, current_id)
        chain.append({"id": current["id"], "name": current.get("name") or "Carpeta"})
        parents = current.get("parents") or []
        if not parents:
            chain[-1] = {"id": "root", "name": "Mi unidad"}
            current_id = "root"
        else:
            current_id = parents[0]
    if not chain or chain[-1].get("id") != "root":
        chain.append({"id": "root", "name": "Mi unidad"})
    chain.reverse()
    return chain


def find_named_folder(token, parent_id, name):
    matches = [folder for folder in list_folders(token, parent_id) if folder.get("name") == name]
    if len(matches) > 1:
        raise DriveFolderError(f'Hay varias carpetas llamadas "{name}" en el mismo destino.')
    return matches[0] if matches else None


def resolve_path(token, path_parts, root_id="root", create=True):
    current_id = verify_folder(token, root_id)["id"]
    for raw_name in path_parts:
        name = re.sub(r"\s+", " ", str(raw_name or "")).strip()
        if not name:
            continue
        found = find_named_folder(token, current_id, name)
        if not found:
            if not create:
                return None
            found = create_folder(token, current_id, name)
        current_id = found["id"]
    return current_id


def move_item(token, item_id, destination_folder_id):
    item = get_item(token, item_id)
    destination = verify_folder(token, destination_folder_id)
    parents = item.get("parents") or []
    query = {
        "addParents": destination["id"],
        "fields": "id,name,mimeType,parents,trashed,webViewLink",
    }
    if parents:
        query["removeParents"] = ",".join(parents)
    return _request_json(
        token,
        f"/files/{urllib.parse.quote(_folder_id(item_id))}",
        query,
        method="PATCH",
        payload={},
    )


def trash_item(token, item_id):
    return _request_json(
        token,
        f"/files/{urllib.parse.quote(_folder_id(item_id))}",
        {"fields": "id,name,parents,trashed"},
        method="PATCH",
        payload={"trashed": True},
    )
