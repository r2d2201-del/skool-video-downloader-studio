import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class ExtensionSafetyTests(unittest.TestCase):
    def test_manifest_uses_scoped_permissions(self):
        manifest = json.loads((PROJECT_ROOT / "manifest.json").read_text(encoding="utf-8"))
        self.assertNotIn("cookies", manifest["permissions"])
        self.assertNotIn("clipboardRead", manifest["permissions"])
        self.assertNotIn("<all_urls>", manifest["host_permissions"])

    def test_downloaders_verify_tls_and_do_not_export_browser_cookies(self):
        popup = (PROJECT_ROOT / "popup" / "popup.js").read_text(encoding="utf-8")
        native = (PROJECT_ROOT / "scripts" / "native_host.py").read_text(encoding="utf-8")
        self.assertNotIn("chrome.cookies", popup)
        self.assertNotIn("--no-check-certificate", native)
        self.assertNotIn('msg.get("cookies")', native)

    def test_cloud_sync_does_not_double_deploy_or_stage_the_repository(self):
        native = (PROJECT_ROOT / "scripts" / "native_host.py").read_text(encoding="utf-8")
        server = (PROJECT_ROOT / "scripts" / "server.py").read_text(encoding="utf-8")
        self.assertNotIn("vercel_bin", native)
        self.assertNotIn("vercel_bin", server)
        self.assertNotIn('[git_bin, "add", "."]', server)

    def test_web_player_does_not_depend_on_drive_preview_cookies(self):
        app = (PROJECT_ROOT / "js" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("/preview", app)
        self.assertIn("http://127.0.0.1:4545/drive-video", app)
        self.assertIn("drive.usercontent.google.com/download", app)
        self.assertIn("res.gdriveLink || res.url", app)

    def test_private_drive_proxy_is_scoped_and_supports_video_ranges(self):
        server = (PROJECT_ROOT / "scripts" / "server.py").read_text(encoding="utf-8")
        self.assertIn("re.fullmatch(r'[A-Za-z0-9_-]{10,200}'", server)
        self.assertIn("request_headers['Range'] = range_header", server)
        self.assertIn("https://cinematic-lms-studio.vercel.app", server)
        self.assertIn("ThreadingHTTPServer", server)

    def test_web_cache_is_bumped_for_new_player(self):
        worker = (PROJECT_ROOT / "sw.js").read_text(encoding="utf-8")
        studio_worker = (PROJECT_ROOT / "studio-web" / "sw.js").read_text(encoding="utf-8")
        self.assertIn("cinematic-studio-v2.7.0", worker)
        self.assertEqual(worker, studio_worker)

    def test_cloud_catalog_sync_is_manual_after_download_batches(self):
        worker = (PROJECT_ROOT / "service-worker.js").read_text(encoding="utf-8")
        finish_start = worker.index("async function finishNativeDownloadJob")
        finish_end = worker.index("async function forceNativeCloudSync", finish_start)
        self.assertNotIn("SYNC_CLOUD", worker[finish_start:finish_end])
        self.assertIn("cloudSync =", worker[finish_start:finish_end])

    def test_course_identity_uses_page_title_and_scopes_manual_overrides(self):
        detector = (PROJECT_ROOT / "content_scripts" / "skool-detector.js").read_text(encoding="utf-8")
        popup = (PROJECT_ROOT / "popup" / "popup.js").read_text(encoding="utf-8")
        self.assertIn("contextFromDocumentTitle", detector)
        self.assertIn("isUsableCourseName(context.course", detector)
        self.assertIn("customCourseRouteId", popup)
        self.assertIn("isUsableDetectedCourseName", popup)
        self.assertIn("canonicalCommunityName", popup)

    def test_drive_destination_uses_verified_folder_ids(self):
        popup = (PROJECT_ROOT / "popup" / "popup.js").read_text(encoding="utf-8")
        worker = (PROJECT_ROOT / "service-worker.js").read_text(encoding="utf-8")
        native = (PROJECT_ROOT / "scripts" / "native_host.py").read_text(encoding="utf-8")
        self.assertIn("/drive/folder/verify", popup)
        self.assertIn("gdriveRootId", popup)
        self.assertIn("gdriveRootId", worker)
        self.assertIn('msg.get("gdriveRootId")', native)


if __name__ == "__main__":
    unittest.main()
