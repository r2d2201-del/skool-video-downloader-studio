#!/usr/bin/env python3
"""Preview or safely consolidate a nested Skool Downloads folder.

Preview is the default. Apply mode only runs when every same-name file can be
proven identical by checksum and size. Deletions are recoverable Drive trash
operations; this script never permanently deletes content.
"""

from __future__ import annotations

import argparse
import json
import os
import sys


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from drive_library import (  # noqa: E402
    FOLDER_MIME,
    get_item,
    list_children,
    move_item,
    trash_item,
    verify_folder,
)
from server import get_gdrive_access_token  # noqa: E402


def normalized_name(value):
    return " ".join(str(value or "").casefold().split())


def same_file(left, right):
    left_md5 = left.get("md5Checksum")
    right_md5 = right.get("md5Checksum")
    left_size = left.get("size")
    right_size = right.get("size")
    return bool(left_md5 and right_md5 and left_md5 == right_md5 and left_size == right_size)


def compact_item(item):
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "type": "folder" if item.get("mimeType") == FOLDER_MIME else "file",
        "size": item.get("size"),
    }


def build_merge_plan(token, source_id, destination_id, plan, path):
    source_children = list_children(token, source_id)
    destination_children = list_children(token, destination_id)
    by_key = {}
    for item in destination_children:
        key = (normalized_name(item.get("name")), item.get("mimeType"))
        by_key.setdefault(key, []).append(item)

    for source in source_children:
        key = (normalized_name(source.get("name")), source.get("mimeType"))
        matches = by_key.get(key, [])
        item_path = path + [source.get("name") or "Sin nombre"]
        if len(matches) > 1:
            plan["conflicts"].append({
                "reason": "multiple_destination_matches",
                "path": " / ".join(item_path),
                "source": compact_item(source),
                "destinations": [compact_item(item) for item in matches],
            })
            continue
        if not matches:
            plan["moves"].append({
                "itemId": source["id"],
                "destinationId": destination_id,
                "path": " / ".join(item_path),
                "type": "folder" if source.get("mimeType") == FOLDER_MIME else "file",
            })
            continue

        destination = matches[0]
        if source.get("mimeType") == FOLDER_MIME:
            build_merge_plan(token, source["id"], destination["id"], plan, item_path)
            plan["trashFolders"].append({
                "itemId": source["id"],
                "path": " / ".join(item_path),
            })
        elif same_file(source, destination):
            plan["trashDuplicates"].append({
                "itemId": source["id"],
                "path": " / ".join(item_path),
                "keptId": destination["id"],
            })
        else:
            plan["conflicts"].append({
                "reason": "same_name_different_or_unverifiable_file",
                "path": " / ".join(item_path),
                "source": compact_item(source),
                "destination": compact_item(destination),
            })


def create_plan(token, outer_id, nested_id):
    outer = verify_folder(token, outer_id)
    nested = verify_folder(token, nested_id)
    if outer.get("name") != "Skool Downloads" or nested.get("name") != "Skool Downloads":
        raise RuntimeError("Ambas carpetas deben llamarse exactamente Skool Downloads.")
    if outer["id"] == nested["id"] or outer["id"] not in (nested.get("parents") or []):
        raise RuntimeError("La carpeta indicada no es una copia anidada directa de la raíz elegida.")

    plan = {
        "mode": "preview",
        "outer": compact_item(outer),
        "nested": compact_item(nested),
        "moves": [],
        "trashDuplicates": [],
        "trashFolders": [],
        "conflicts": [],
    }
    build_merge_plan(token, nested_id, outer_id, plan, ["Skool Downloads (anidada)"])
    plan["trashFolders"].append({"itemId": nested_id, "path": "Skool Downloads (anidada)"})
    plan["safeToApply"] = not plan["conflicts"]
    return plan


def apply_plan(token, plan):
    if plan.get("conflicts"):
        raise RuntimeError("La migración tiene conflictos; no se modificó Google Drive.")
    for operation in plan["moves"]:
        move_item(token, operation["itemId"], operation["destinationId"])
    for operation in plan["trashDuplicates"]:
        trash_item(token, operation["itemId"])
    for operation in plan["trashFolders"]:
        trash_item(token, operation["itemId"])
    plan["mode"] = "applied"
    plan["recoverable"] = True
    return plan


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--outer-id", required=True)
    parser.add_argument("--nested-id", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    token = get_gdrive_access_token()
    if not token:
        raise SystemExit("Google Drive no está conectado.")
    plan = create_plan(token, args.outer_id, args.nested_id)
    if args.apply:
        plan = apply_plan(token, plan)
    print(json.dumps(plan, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
