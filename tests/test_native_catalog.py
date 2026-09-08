import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

from scripts.catalog_store import repair_catalog


PROJECT_ROOT = Path(__file__).resolve().parents[1]
NATIVE_HOST_PATH = PROJECT_ROOT / "scripts" / "native_host.py"


def load_native_host():
    spec = importlib.util.spec_from_file_location("skool_native_host_test", NATIVE_HOST_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_catalog(path):
    content = path.read_text(encoding="utf-8")
    start = content.index("[", content.index("window.COMMUNITIES_DATA"))
    return json.JSONDecoder().raw_decode(content[start:])[0]


class NativeCatalogTests(unittest.TestCase):
    def setUp(self):
        self.native = load_native_host()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base = Path(self.temp_dir.name)
        (self.base / "data").mkdir(parents=True)
        (self.base / "studio-web" / "data").mkdir(parents=True)
        initial = "window.COMMUNITIES_DATA = [];\n\nwindow.COURSE_DATA = null;\n"
        (self.base / "data" / "course-data.js").write_text(initial, encoding="utf-8")
        (self.base / "studio-web" / "data" / "course-data.js").write_text(initial, encoding="utf-8")
        self.native.BASE_DIR = str(self.base)
        self.native.CATALOG_LOCK_FILE = str(self.base / ".course_catalog.lock")

    def tearDown(self):
        self.temp_dir.cleanup()

    def context(self, module_index, lesson_index, lesson_id, title, resources=None):
        return {
            "community": "Comunidad",
            "course": "Curso",
            "module": f"{module_index:02d}_Módulo {module_index}",
            "moduleIndex": module_index,
            "lessonTitle": title,
            "lessonIndex": (module_index - 1) * 10 + lesson_index,
            "lessonIndexInModule": lesson_index,
            "globalLessonIndex": (module_index - 1) * 10 + lesson_index,
            "lessonId": lesson_id,
            "resources": resources or [],
        }

    def test_completion_order_does_not_change_course_order_or_video_id(self):
        resource = {"id": "resource-1", "name": "Plantilla", "url": "https://www.figma.com/file/example"}

        self.native.update_course_catalog(self.context(2, 2, "lesson-22", "Lección 2"), "video.mp4", "video-22")
        self.native.update_course_catalog(self.context(1, 2, "lesson-12", "Lección 2"), "video.mp4", "video-12")
        self.native.update_course_catalog(self.context(1, 1, "lesson-11", "Lección 1", [resource]), "video.mp4", "video-11")
        self.native.update_course_catalog(
            self.context(1, 1, "lesson-11", "Lección 1", [resource]),
            "Plantilla.url",
            "resource-drive-id",
            item_type="resource",
            source_url=resource["url"],
            resource_id=resource["id"],
        )
        self.native.update_course_catalog(
            self.context(1, 1, "lesson-11", "Lección 1", [resource]),
            "video.mp4",
            "video-11",
        )

        studio_path = self.base / "studio-web" / "data" / "course-data.js"
        root_path = self.base / "data" / "course-data.js"
        self.assertEqual(studio_path.read_text(encoding="utf-8"), root_path.read_text(encoding="utf-8"))

        course = read_catalog(studio_path)[0]["courses"][0]
        self.assertEqual([module["index"] for module in course["modules"]], [1, 2])
        self.assertEqual([lesson["id"] for lesson in course["modules"][0]["lessons"]], ["lesson-11", "lesson-12"])

        first_lesson = course["modules"][0]["lessons"][0]
        self.assertEqual(first_lesson["gdriveId"], "video-11")
        self.assertEqual(first_lesson["resources"][0]["gdriveId"], "resource-drive-id")
        self.assertEqual(course["totalLessons"], 3)
        self.assertEqual(course["totalResources"], 1)

    def test_external_resource_is_saved_as_clickable_shortcut(self):
        output = self.native.download_resource_to_disk(
            "https://drive.google.com/drive/folders/example",
            "Material de clase",
            str(self.base),
        )
        self.assertTrue(output.endswith(".url"))
        self.assertIn("https://drive.google.com/drive/folders/example", Path(output).read_text(encoding="utf-8"))

    def test_full_tree_reconciles_source_order_and_preserves_drive_metadata(self):
        self.native.update_course_catalog(self.context(1, 5, "lesson-5", "Steve Jobs"), "video.mp4", "drive-5")
        self.native.update_course_catalog(self.context(1, 4, "lesson-4", "Poster Style"), "video.mp4", "drive-4")
        self.native.update_course_catalog(self.context(1, 1, "lesson-1", "White Folder"), "video.mp4", "drive-1")

        tree = {
            "modules": [{
                "moduleId": "general",
                "moduleIndex": 1,
                "title": "01 General",
                "lessons": [
                    {"id": "lesson-1", "title": "White Folder", "sourceOrder": 1, "url": "https://skool.example/?md=lesson-1", "attachments": []},
                    {"id": "lesson-4", "title": "Poster Style", "sourceOrder": 4, "url": "https://skool.example/?md=lesson-4", "attachments": []},
                    {
                        "id": "lesson-5",
                        "title": "Steve Jobs",
                        "sourceOrder": 5,
                        "url": "https://skool.example/?md=lesson-5",
                        "attachments": [{
                            "id": "assets",
                            "name": "Download the assets",
                            "url": "https://drive.google.com/drive/folders/assets",
                            "category": "gdrive_folder",
                            "categoryLabel": "DRIVE 📁",
                        }],
                    },
                ],
            }],
        }

        result = self.native.reconcile_course(str(self.base), "Comunidad", "Curso", tree)
        self.assertTrue(result["success"])
        course = read_catalog(self.base / "data" / "course-data.js")[0]["courses"][0]
        lessons = course["modules"][0]["lessons"]
        self.assertEqual([item["id"] for item in lessons], ["lesson-1", "lesson-4", "lesson-5"])
        self.assertEqual([item["index"] for item in lessons], [1, 4, 5])
        self.assertEqual([item["gdriveId"] for item in lessons], ["drive-1", "drive-4", "drive-5"])
        self.assertEqual(lessons[2]["resources"][0]["name"], "Download the assets")
        self.assertEqual(course["totalResources"], 1)

    def test_quality_preferences_are_normalized(self):
        self.assertEqual(self.native.normalize_video_quality("1080p"), "1080")
        self.assertEqual(self.native.normalize_video_quality("720"), "720")
        self.assertEqual(self.native.normalize_video_quality("unexpected"), "best")

    def test_partial_virtualized_tree_never_discards_existing_modules(self):
        self.native.update_course_catalog(self.context(1, 1, "lesson-1", "Primera"), "one.mp4", "drive-1")
        self.native.update_course_catalog(self.context(2, 1, "lesson-2", "Segunda"), "two.mp4", "drive-2")
        partial_tree = {
            "modules": [{
                "moduleId": "visible",
                "title": "01 Módulo 1",
                "lessons": [{
                    "id": "lesson-1",
                    "title": "Primera",
                    "sourceOrder": 1,
                    "attachments": [{"id": "guide", "name": "Guía", "url": "https://example.com/guide.pdf"}],
                }],
            }],
        }

        result = self.native.reconcile_course(str(self.base), "Comunidad", "Curso", partial_tree)
        self.assertFalse(result["completeSnapshot"])
        course = read_catalog(self.base / "data" / "course-data.js")[0]["courses"][0]
        self.assertEqual(len(course["modules"]), 2)
        self.assertEqual({item["id"] for module in course["modules"] for item in module["lessons"]}, {"lesson-1", "lesson-2"})
        self.assertEqual(course["modules"][0]["lessons"][0]["resources"][0]["name"], "Guía")

    def test_course_lookup_tolerates_spacing_and_punctuation_variants(self):
        ctx = self.context(1, 1, "lesson-1", "Primera")
        ctx["course"] = "The $2,000mo Editor Blueprint"
        self.native.update_course_catalog(ctx, "one.mp4", "drive-1")
        status = self.native.course_status(str(self.base), "Comunidad", "The $2,000 mo Editor Blueprint")
        self.assertTrue(status["courseExists"])

    def test_repair_removes_a_complete_course_copied_inside_another(self):
        shared_lessons = [
            {"id": "devin-1", "title": "Devin 1", "resources": [], "gdriveId": "drive-d1"},
            {"id": "devin-2", "title": "Devin 2", "resources": [], "gdriveId": "drive-d2"},
        ]
        catalog = [{
            "id": "community",
            "name": "Comunidad",
            "courses": [
                {
                    "id": "viral",
                    "courseTitle": "Viral",
                    "modules": [{"index": 1, "title": "General", "lessons": [
                        {"id": "viral-1", "title": "Viral 1", "resources": [], "gdriveId": "drive-v1"},
                        *[dict(item) for item in shared_lessons],
                    ]}],
                },
                {
                    "id": "devin",
                    "courseTitle": "Devin",
                    "modules": [{"index": 1, "title": "General", "lessons": [dict(item) for item in shared_lessons]}],
                },
            ],
        }]
        payload = f"window.COMMUNITIES_DATA = {json.dumps(catalog)};\n"
        (self.base / "data" / "course-data.js").write_text(payload, encoding="utf-8")
        (self.base / "studio-web" / "data" / "course-data.js").write_text(payload, encoding="utf-8")

        result = repair_catalog(str(self.base))
        courses = read_catalog(self.base / "data" / "course-data.js")[0]["courses"]
        viral_ids = [lesson["id"] for module in courses[0]["modules"] for lesson in module["lessons"]]
        devin_ids = [lesson["id"] for module in courses[1]["modules"] for lesson in module["lessons"]]

        self.assertTrue(result["changed"])
        self.assertEqual(["viral-1"], viral_ids)
        self.assertEqual(["devin-1", "devin-2"], devin_ids)


if __name__ == "__main__":
    unittest.main()
