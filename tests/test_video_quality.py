import json
import unittest
from unittest import mock

from scripts.video_quality import (
    VIDEO_QUALITY_FORMATS,
    expected_video_height,
    inspect_available_formats,
    verify_downloaded_quality,
)


class VideoQualityTests(unittest.TestCase):
    def test_best_selects_highest_available_rendition(self):
        report = {'availableHeights': [360, 720, 1080], 'maxHeight': 1080}
        self.assertEqual(expected_video_height(report, 'best'), 1080)
        self.assertIn('bestvideo', VIDEO_QUALITY_FORMATS['best'])

    def test_capped_quality_selects_highest_rendition_under_cap(self):
        report = {'availableHeights': [360, 720, 1080], 'maxHeight': 1080}
        self.assertEqual(expected_video_height(report, '720'), 720)
        self.assertEqual(expected_video_height(report, '1080p'), 1080)

    @mock.patch('scripts.video_quality.subprocess.run')
    def test_format_probe_returns_only_sanitized_resolution_metadata(self, run):
        run.return_value = mock.Mock(
            returncode=0,
            stdout=json.dumps({
                'url': 'https://signed.example/master.m3u8?token=secret',
                'formats': [
                    {'height': 360, 'vcodec': 'avc1'},
                    {'height': 1080, 'vcodec': 'avc1'},
                    {'height': None, 'vcodec': 'none'},
                ],
            }),
        )
        report = inspect_available_formats('yt-dlp', 'https://signed.example/master.m3u8?token=secret', {})
        self.assertEqual(report, {'availableHeights': [360, 1080], 'maxHeight': 1080})
        self.assertNotIn('url', report)
        self.assertNotIn('token', str(report))

    def test_low_resolution_download_is_rejected_before_replacement(self):
        with self.assertRaisesRegex(RuntimeError, 'No se reemplazó'):
            verify_downloaded_quality(
                {'actualHeight': 360, 'requestedQuality': 'best'},
                {'availableHeights': [360, 720, 1080], 'maxHeight': 1080},
                'best',
            )

    def test_matching_high_resolution_download_is_accepted(self):
        metadata = verify_downloaded_quality(
            {'actualHeight': 1080, 'requestedQuality': 'best'},
            {'availableHeights': [360, 720, 1080], 'maxHeight': 1080},
            'best',
        )
        self.assertEqual(metadata['expectedHeight'], 1080)
        self.assertEqual(metadata['sourceMaxHeight'], 1080)


if __name__ == '__main__':
    unittest.main()
