import io
import unittest
from unittest import mock

from scripts import server as server_module


class _FakeDriveResponse:
    def __init__(self):
        self.headers = {
            'Content-Type': 'application/octet-stream',
            'Content-Length': '4',
            'Content-Range': 'bytes 0-3/100',
            'Accept-Ranges': 'bytes',
        }
        self._chunks = iter((b'test', b''))

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self, _size):
        return next(self._chunks)


class DriveVideoProxyTests(unittest.TestCase):
    def _request(self, origin, range_header=None):
        handler = server_module.DownloaderHandler.__new__(server_module.DownloaderHandler)
        handler.path = '/drive-video?id=valid_file_id_12345'
        handler.headers = {'Origin': origin}
        if range_header:
            handler.headers['Range'] = range_header
        handler.wfile = io.BytesIO()
        result = {'status': None, 'headers': {}}
        handler.send_response = lambda status_code: result.update(status=status_code)
        handler.send_header = lambda name, value: result['headers'].__setitem__(name, value)
        handler.end_headers = lambda: None

        handler._proxy_drive_video()
        return result['status'], result['headers'], handler.wfile.getvalue()

    def test_streams_private_video_with_range_and_vercel_cors(self):
        observed = {}

        def fake_urlopen(request, **_kwargs):
            observed['authorization'] = request.get_header('Authorization')
            observed['range'] = request.get_header('Range')
            return _FakeDriveResponse()

        with mock.patch.object(server_module, 'get_gdrive_access_token', return_value='private-token'), \
             mock.patch.object(server_module.urllib.request, 'urlopen', side_effect=fake_urlopen):
            status, headers, body = self._request(
                'https://cinematic-lms-studio.vercel.app', 'bytes=0-3'
            )

        self.assertEqual(206, status)
        self.assertEqual(b'test', body)
        self.assertEqual('video/mp4', headers.get('Content-Type'))
        self.assertEqual('bytes 0-3/100', headers.get('Content-Range'))
        self.assertEqual('https://cinematic-lms-studio.vercel.app', headers.get('Access-Control-Allow-Origin'))
        self.assertEqual('Bearer private-token', observed.get('authorization'))
        self.assertEqual('bytes=0-3', observed.get('range'))

    def test_rejects_untrusted_web_origin_before_contacting_drive(self):
        with mock.patch.object(server_module, 'get_gdrive_access_token') as token_mock:
            status, _, _ = self._request('https://example.invalid')

        self.assertEqual(403, status)
        token_mock.assert_not_called()


if __name__ == '__main__':
    unittest.main()
