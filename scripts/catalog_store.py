"""Shared, deterministic course-catalog helpers.

The downloader receives files in completion order, while Skool exposes the canonical
module/lesson order in the classroom tree.  This module reconciles that full tree
without losing existing Google Drive IDs or downloaded-resource metadata.
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import threading
from contextlib import contextmanager
from html.parser import HTMLParser


_THREAD_LOCK = threading.Lock()


class _AnchorLabelParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current_href = None
        self.current_text = []
        self.labels = {}

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            self.current_href = dict(attrs).get("href")
            self.current_text = []

    def handle_data(self, data):
        if self.current_href:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self.current_href:
            label = _display_name("".join(self.current_text), "")
            if label:
                self.labels[self.current_href] = label
            self.current_href = None
            self.current_text = []


def _slug(value: str, fallback: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9]+", "-", str(value or "").lower()).strip("-")
    return clean or fallback


def _display_name(value: str, fallback: str) -> str:
    clean = re.sub(r"\s+", " ", str(value or "")).strip()
    return clean or fallback


def _entity_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def _positive_int(value, fallback: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else fallback
    except (TypeError, ValueError):
        return fallback


def _module_title(value: str, position: int) -> str:
    raw = _display_name(value, f"Módulo {position}")
    raw = re.sub(r"^\s*\d+\s*[._-]?\s*", "", raw).strip() or f"Módulo {position}"
    return f"{position:02d} {raw}"


def _resource_key(resource: dict) -> tuple[str, str]:
    if resource.get("url"):
        return ("url", str(resource["url"]).strip())
    if resource.get("id"):
        return ("id", str(resource["id"]))
    return ("name", str(resource.get("name") or "").casefold())


def merge_resources(existing_resources, incoming_resources):
    """Merge source links while retaining the Drive copy metadata."""
    existing = [dict(item) for item in (existing_resources or []) if isinstance(item, dict)]
    existing_by_key = {_resource_key(item): item for item in existing}
    merged = []
    seen = set()

    for incoming in (incoming_resources or []):
        if not isinstance(incoming, dict):
            continue
        item = dict(incoming)
        previous = existing_by_key.get(_resource_key(item))
        if previous:
            for key in ("gdriveId", "gdriveLink", "inDrive"):
                if previous.get(key) not in (None, ""):
                    item[key] = previous[key]
        key = _resource_key(item)
        if key not in seen:
            seen.add(key)
            merged.append(item)

    # Preserve a downloaded resource that the current Skool snapshot did not expose.
    for previous in existing:
        key = _resource_key(previous)
        if key not in seen and previous.get("gdriveId"):
            seen.add(key)
            merged.append(previous)

    return merged


def _restore_resource_labels(lesson):
    description = lesson.get("descriptionHtml") or ""
    if not description or not lesson.get("resources"):
        return
    parser = _AnchorLabelParser()
    try:
        parser.feed(description)
    except Exception:
        return
    for resource in lesson.get("resources") or []:
        label = parser.labels.get(str(resource.get("url") or ""))
        if label and not re.match(r"^https?://", label, re.I):
            resource["name"] = label
        elif re.match(r"^https?://", str(resource.get("name") or ""), re.I):
            category = str(resource.get("category") or "")
            prefix = "Carpeta Google Drive" if category.startswith("gdrive") else "Recurso"
            resource["name"] = f"{prefix} · {lesson.get('title') or 'Lección'}"


@contextmanager
def catalog_lock(base_dir: str):
    lock_path = os.path.join(base_dir, ".course_catalog.lock")
    with _THREAD_LOCK:
        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def _catalog_paths(base_dir: str):
    return (
        os.path.join(base_dir, "studio-web", "data", "course-data.js"),
        os.path.join(base_dir, "data", "course-data.js"),
    )


def _load_communities(base_dir: str):
    studio_path, root_path = _catalog_paths(base_dir)
    source_path = studio_path if os.path.exists(studio_path) else root_path
    if not os.path.exists(source_path):
        return []
    with open(source_path, "r", encoding="utf-8") as handle:
        content = handle.read()
    marker = content.find("window.COMMUNITIES_DATA")
    json_start = content.find("[", marker)
    if marker == -1 or json_start == -1:
        raise ValueError("No se encontró window.COMMUNITIES_DATA en el catálogo")
    communities, _ = json.JSONDecoder().raw_decode(content[json_start:])
    return communities


def _write_communities(base_dir: str, communities):
    payload = (
        f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\n"
        "window.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
    )
    for path in _catalog_paths(base_dir):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        temp_path = f"{path}.tmp.{os.getpid()}.{threading.get_ident()}"
        with open(temp_path, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)


def _find_course(communities, community_name: str, course_name: str):
    community_key = _entity_key(community_name)
    course_key = _entity_key(course_name)
    for community in communities:
        if _entity_key(community.get("name")) != community_key:
            continue
        for course in community.get("courses", []):
            if _entity_key(course.get("courseTitle")) == course_key:
                return community, course
        return community, None
    return None, None


def _course_lessons(course):
    return [lesson for module in (course.get("modules") or []) for lesson in (module.get("lessons") or [])]


def _recount_course(course):
    global_index = 0
    for module_position, module in enumerate(course.get("modules") or [], 1):
        module["index"] = _positive_int(module.get("index"), module_position)
        for lesson in module.get("lessons") or []:
            global_index += 1
            lesson["globalIndex"] = global_index
            lesson["moduleIndex"] = module["index"]
            lesson["resources"] = merge_resources(lesson.get("resources"), lesson.get("resources"))
            _restore_resource_labels(lesson)
    course["totalModules"] = len(course.get("modules") or [])
    course["totalLessons"] = global_index
    course["totalResources"] = sum(
        len(lesson.get("resources") or []) for lesson in _course_lessons(course)
    )


def _merge_overlapping_course(target, incoming):
    """Merge a mislabeled snapshot into the course identified by stable lesson IDs."""
    target_by_id = {str(item.get("id")): item for item in _course_lessons(target) if item.get("id")}
    source_counter = 0
    for incoming_module in incoming.get("modules") or []:
        for incoming_lesson in incoming_module.get("lessons") or []:
            lesson_id = str(incoming_lesson.get("id") or "")
            if lesson_id not in target_by_id:
                continue
            source_counter += 1
            target_lesson = target_by_id[lesson_id]
            source_order = _positive_int(
                incoming_lesson.get("sourceOrder") or incoming_lesson.get("index"),
                source_counter,
            )
            target_lesson["sourceOrder"] = source_order
            target_lesson["index"] = source_order
            if incoming_lesson.get("sourceUrl"):
                target_lesson["sourceUrl"] = incoming_lesson["sourceUrl"]
            if incoming_lesson.get("descriptionHtml"):
                target_lesson["descriptionHtml"] = incoming_lesson["descriptionHtml"]
            target_lesson["resources"] = merge_resources(
                target_lesson.get("resources"), incoming_lesson.get("resources")
            )

    for module in target.get("modules") or []:
        original_positions = {
            str(lesson.get("id")): position for position, lesson in enumerate(module.get("lessons") or [])
        }
        module["lessons"] = sorted(
            module.get("lessons") or [],
            key=lambda lesson: (
                _positive_int(lesson.get("sourceOrder") or lesson.get("index"), 10 ** 9),
                original_positions.get(str(lesson.get("id")), 10 ** 9),
            ),
        )
    _recount_course(target)


def _replace_course_structure(target, incoming):
    """Adopt a complete route snapshot while preserving downloaded metadata."""
    old_lessons = _course_lessons(target)
    old_by_id = {str(item.get("id")): item for item in old_lessons if item.get("id")}
    old_by_title = {
        _entity_key(item.get("title") or item.get("rawTitle")): item
        for item in old_lessons
        if item.get("title") or item.get("rawTitle")
    }
    modules = []
    for module_position, incoming_module in enumerate(incoming.get("modules") or [], 1):
        if not isinstance(incoming_module, dict):
            continue
        module = dict(incoming_module)
        lessons = []
        for lesson_position, incoming_lesson in enumerate(incoming_module.get("lessons") or [], 1):
            if not isinstance(incoming_lesson, dict):
                continue
            lesson_id = str(incoming_lesson.get("id") or "")
            title_key = _entity_key(incoming_lesson.get("title") or incoming_lesson.get("rawTitle"))
            previous = old_by_id.get(lesson_id) or old_by_title.get(title_key) or {}
            lesson = dict(previous)
            lesson.update(incoming_lesson)
            lesson["resources"] = merge_resources(
                previous.get("resources"), incoming_lesson.get("resources")
            )
            lesson["inDrive"] = bool(lesson.get("gdriveId") or lesson.get("inDrive"))
            lesson["index"] = _positive_int(
                incoming_lesson.get("sourceOrder") or incoming_lesson.get("index"), lesson_position
            )
            lessons.append(lesson)
        if not lessons:
            continue
        module["index"] = _positive_int(
            incoming_module.get("sourceIndex") or incoming_module.get("index"), module_position
        )
        module["lessons"] = lessons
        modules.append(module)
    target["modules"] = modules
    _recount_course(target)


def _merge_route_id_courses(community):
    """Fold an opaque classroom-route snapshot into its already named course."""
    courses = [course for course in (community.get("courses") or []) if isinstance(course, dict)]
    route_courses = [
        course for course in courses
        if re.fullmatch(r"[a-f0-9]{8,}", str(course.get("courseTitle") or ""), re.I)
    ]
    removed = set()
    changed = False
    for route_course in route_courses:
        route_ids = {
            str(lesson.get("id")) for lesson in _course_lessons(route_course) if lesson.get("id")
        }
        if len(route_ids) < 2:
            continue
        target = None
        overlap_size = 0
        for candidate in courses:
            if candidate is route_course or candidate in route_courses:
                continue
            candidate_ids = {
                str(lesson.get("id")) for lesson in _course_lessons(candidate) if lesson.get("id")
            }
            overlap = len(route_ids & candidate_ids)
            if candidate_ids.issubset(route_ids) and overlap > overlap_size:
                target, overlap_size = candidate, overlap
        if target is None or overlap_size < 2:
            continue
        _replace_course_structure(target, route_course)
        removed.add(id(route_course))
        changed = True

    if removed:
        community["courses"] = [course for course in courses if id(course) not in removed]
    return changed


def _consolidate_duplicate_communities(communities):
    """Collapse duplicate community records and route course snapshots by lesson-ID overlap."""
    canonical_by_name = {}
    consolidated = []
    changed = False
    for community in communities:
        key = _entity_key(community.get("name"))
        canonical = canonical_by_name.get(key)
        if canonical is None:
            canonical_by_name[key] = community
            consolidated.append(community)
            continue

        changed = True
        canonical_courses = canonical.setdefault("courses", [])
        for incoming_course in community.get("courses") or []:
            exact = next((course for course in canonical_courses if
                _entity_key(course.get("courseTitle")) ==
                _entity_key(incoming_course.get("courseTitle"))), None)
            incoming_ids = {str(item.get("id")) for item in _course_lessons(incoming_course) if item.get("id")}
            overlap_target = None
            overlap_size = 0
            for candidate in canonical_courses:
                candidate_ids = {str(item.get("id")) for item in _course_lessons(candidate) if item.get("id")}
                size = len(incoming_ids & candidate_ids)
                if size > overlap_size:
                    overlap_target, overlap_size = candidate, size
            target = exact or (overlap_target if overlap_size >= 2 else None)
            if target:
                _merge_overlapping_course(target, incoming_course)
            else:
                canonical_courses.append(incoming_course)
    return consolidated, changed


def _remove_contained_course_duplicates(community):
    """Remove a whole course accidentally copied inside a different course.

    Skool lesson IDs are stable and course-specific. If every lesson ID from one
    course also appears inside a larger, differently named course, the larger
    record contains a stale merged snapshot. Keep the complete standalone course
    and remove only that exact duplicated ID set from the larger record.
    """
    courses = [course for course in (community.get("courses") or []) if isinstance(course, dict)]
    id_sets = {
        id(course): {str(lesson.get("id")) for lesson in _course_lessons(course) if lesson.get("id")}
        for course in courses
    }
    removals = {id(course): set() for course in courses}

    for larger in courses:
        larger_ids = id_sets[id(larger)]
        for standalone in courses:
            if standalone is larger:
                continue
            standalone_ids = id_sets[id(standalone)]
            if len(standalone_ids) >= 2 and standalone_ids < larger_ids:
                removals[id(larger)].update(standalone_ids)

    changed = False
    for course in courses:
        duplicate_ids = removals[id(course)]
        if not duplicate_ids:
            continue
        for module in course.get("modules") or []:
            lessons = module.get("lessons") or []
            filtered = [lesson for lesson in lessons if str(lesson.get("id") or "") not in duplicate_ids]
            if len(filtered) != len(lessons):
                changed = True
                module["lessons"] = filtered
        course["modules"] = [module for module in (course.get("modules") or []) if module.get("lessons")]
        _recount_course(course)

    return changed


def repair_catalog(base_dir: str):
    """Apply deterministic catalog cleanup without contacting Drive or Vercel."""
    with catalog_lock(base_dir):
        communities = _load_communities(base_dir)
        before = json.dumps(communities, ensure_ascii=False, sort_keys=True)
        communities, changed = _consolidate_duplicate_communities(communities)
        for community in communities:
            changed = _merge_route_id_courses(community) or changed
            changed = _remove_contained_course_duplicates(community) or changed
            for course in community.get("courses") or []:
                _recount_course(course)
        changed = changed or before != json.dumps(communities, ensure_ascii=False, sort_keys=True)
        if changed:
            _write_communities(base_dir, communities)
    return {"success": True, "changed": changed}


def course_status(base_dir: str, community_name: str, course_name: str):
    with catalog_lock(base_dir):
        communities = _load_communities(base_dir)
    _, course = _find_course(communities, community_name, course_name)
    if not course:
        return {"success": True, "courseExists": False, "lessons": [], "totalLessons": 0}

    lessons = []
    for module in course.get("modules", []):
        for lesson in module.get("lessons", []):
            lessons.append({
                "id": lesson.get("id"),
                "title": lesson.get("title"),
                "inDrive": bool(lesson.get("gdriveId") or lesson.get("inDrive")),
                "gdriveId": lesson.get("gdriveId"),
                "gdriveLink": lesson.get("gdriveLink"),
                "requestedQuality": lesson.get("requestedQuality") or lesson.get("videoQuality"),
                "actualHeight": lesson.get("actualHeight"),
                "fileSizeBytes": lesson.get("fileSizeBytes"),
                "resourceCount": len(lesson.get("resources") or []),
            })
    return {
        "success": True,
        "courseExists": True,
        "courseId": course.get("id"),
        "totalLessons": len(lessons),
        "totalResources": sum(item["resourceCount"] for item in lessons),
        "lessons": lessons,
    }


def reconcile_course(base_dir: str, community_name: str, course_name: str, tree: dict):
    """Apply the complete Skool tree order and return the resulting library status."""
    community_name = _display_name(community_name, "Comunidad Skool")
    course_name = _display_name(course_name, "Curso")
    incoming_modules = [item for item in (tree or {}).get("modules", []) if isinstance(item, dict)]
    if not incoming_modules:
        return {"success": False, "error": "El temario recibido no contiene módulos."}

    with catalog_lock(base_dir):
        communities = _load_communities(base_dir)
        communities, _ = _consolidate_duplicate_communities(communities)
        for catalog_community in communities:
            _merge_route_id_courses(catalog_community)
            _remove_contained_course_duplicates(catalog_community)
        community, course = _find_course(communities, community_name, course_name)
        if not community:
            community = {
                "id": _slug(community_name, "community").replace("-", ""),
                "name": community_name,
                "badge": "ACADEMIA & COMUNIDAD",
                "description": f"Cursos y recursos de {community_name}",
                "courses": [],
            }
            communities.append(community)
        if not course:
            course = {
                "id": _slug(course_name, "course"),
                "community": community_name,
                "courseTitle": course_name,
                "subtitle": f"Formación completa de {course_name}",
                "bannerTag": "EN GOOGLE DRIVE",
                "modules": [],
            }
            community.setdefault("courses", []).append(course)

        old_modules = course.get("modules") or []
        old_lessons = [lesson for module in old_modules for lesson in (module.get("lessons") or [])]
        old_by_id = {str(item.get("id")): item for item in old_lessons if item.get("id")}
        old_by_title = {}
        for item in old_lessons:
            old_by_title.setdefault(str(item.get("title") or item.get("rawTitle") or "").casefold(), item)

        reconciled_modules = []
        seen_lesson_ids = set()
        global_index = 0
        for module_position, incoming_module in enumerate(incoming_modules, 1):
            incoming_lessons = [item for item in (incoming_module.get("lessons") or []) if isinstance(item, dict)]
            if not incoming_lessons:
                continue
            title = _module_title(incoming_module.get("title"), module_position)
            module = {
                "id": incoming_module.get("moduleId") or incoming_module.get("id"),
                "index": module_position,
                "sourceIndex": incoming_module.get("moduleIndex") or module_position,
                "folder": title,
                "title": title,
                "lessons": [],
            }
            for lesson_position, incoming in enumerate(incoming_lessons, 1):
                lesson_id = str(incoming.get("id") or "").strip()
                lesson_title = _display_name(incoming.get("title"), f"Lección {lesson_position}")
                previous = old_by_id.get(lesson_id) or old_by_title.get(lesson_title.casefold()) or {}
                source_order = _positive_int(
                    incoming.get("sourceOrder") or incoming.get("sourceIndex"),
                    lesson_position,
                )
                lesson = dict(previous)
                global_index += 1
                lesson.update({
                    "id": lesson_id or previous.get("id") or _slug(f"{course_name}-{global_index}", "lesson"),
                    "slug": (lesson_id or str(previous.get("id") or "lesson"))[:8],
                    "index": source_order,
                    "globalIndex": global_index,
                    "sourceOrder": source_order,
                    "title": lesson_title,
                    "rawTitle": lesson_title,
                    "module": title,
                    "moduleIndex": module_position,
                    "sourceUrl": incoming.get("url") or previous.get("sourceUrl"),
                })
                if incoming.get("descriptionHtml"):
                    lesson["descriptionHtml"] = incoming["descriptionHtml"]
                else:
                    lesson.setdefault("descriptionHtml", "")
                lesson["resources"] = merge_resources(previous.get("resources"), incoming.get("attachments"))
                lesson["inDrive"] = bool(lesson.get("gdriveId") or lesson.get("inDrive"))
                module["lessons"].append(lesson)
                seen_lesson_ids.add(str(lesson["id"]))
            reconciled_modules.append(module)

        snapshot_total = sum(len(module["lessons"]) for module in reconciled_modules)
        old_ids = {str(item.get("id")) for item in old_lessons if item.get("id")}
        complete_snapshot = not old_lessons or (
            snapshot_total >= len(old_lessons) and old_ids.issubset(seen_lesson_ids)
        )

        course["community"] = community_name
        course["courseTitle"] = course_name
        if complete_snapshot:
            course["modules"] = reconciled_modules
            _recount_course(course)
        else:
            # A virtualized/lazy Skool sidebar may expose only the visible lessons.
            # Enrich and reorder those matches in place without moving every other
            # catalogued lesson into an artificial recovery module.
            _merge_overlapping_course(course, {"modules": reconciled_modules})
        _write_communities(base_dir, communities)

    status = course_status(base_dir, community_name, course_name)
    status.update({"reconciled": True, "completeSnapshot": complete_snapshot})
    return status
