import os
import sys
import unittest
from unittest.mock import patch


SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scripts")
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import drive_library


class DriveLibraryTests(unittest.TestCase):
    def test_selected_root_id_is_used_without_recreating_root_name(self):
        root_id = "rootFolderId12345"
        course_id = "communityId12345"
        with patch.object(drive_library, "verify_folder", return_value={"id": root_id}), patch.object(
            drive_library,
            "find_named_folder",
            return_value={"id": course_id, "name": "Nueva comunidad"},
        ) as finder, patch.object(drive_library, "create_folder") as creator:
            result = drive_library.resolve_path("token", ["Nueva comunidad"], root_id=root_id)

        self.assertEqual(result, course_id)
        finder.assert_called_once_with("token", root_id, "Nueva comunidad")
        creator.assert_not_called()

    def test_breadcrumb_collapses_drive_root_alias(self):
        selected_id = "selectedFolder12345"
        drive_root_id = "driveRootAlias1234"
        items = {
            selected_id: {"id": selected_id, "name": "Skool Downloads", "parents": [drive_root_id]},
            drive_root_id: {"id": drive_root_id, "name": "Mi unidad", "parents": []},
        }
        with patch.object(drive_library, "verify_folder", side_effect=lambda token, item_id: items[item_id]):
            result = drive_library.breadcrumb("token", selected_id)

        self.assertEqual(result, [
            {"id": "root", "name": "Mi unidad"},
            {"id": selected_id, "name": "Skool Downloads"},
        ])

    def test_move_preserves_item_id_and_replaces_parent(self):
        item_id = "videoFileId12345"
        old_parent = "oldParentId12345"
        new_parent = "newParentId12345"
        with patch.object(
            drive_library,
            "get_item",
            return_value={"id": item_id, "name": "lesson.mp4", "parents": [old_parent]},
        ), patch.object(
            drive_library,
            "verify_folder",
            return_value={"id": new_parent},
        ), patch.object(drive_library, "_request_json", return_value={"id": item_id}) as request:
            result = drive_library.move_item("token", item_id, new_parent)

        self.assertEqual(result["id"], item_id)
        args, kwargs = request.call_args
        self.assertEqual(kwargs["method"], "PATCH")
        self.assertEqual(args[2]["addParents"], new_parent)
        self.assertEqual(args[2]["removeParents"], old_parent)


if __name__ == "__main__":
    unittest.main()
