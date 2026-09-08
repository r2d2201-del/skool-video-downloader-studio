"""Shared yt-dlp quality selection and verification helpers.

Signed media URLs are accepted only as in-memory arguments. They are never
included in returned reports, log messages, or exceptions.
"""

import json
import subprocess


def _browser_mp4_format(height_filter=''):
    """Prefer streams that every target browser can decode inside MP4."""
    return '/'.join([
        f'bestvideo[vcodec^=avc1]{height_filter}+bestaudio[acodec^=mp4a]',
        f'bestvideo[vcodec^=h264]{height_filter}+bestaudio[acodec^=aac]',
        f'best[vcodec^=avc1][acodec^=mp4a]{height_filter}',
        f'best[vcodec^=h264][acodec^=aac]{height_filter}',
    ])


VIDEO_QUALITY_FORMATS = {
    'best': _browser_mp4_format(),
    '1080': _browser_mp4_format('[height<=1080]'),
    '720': _browser_mp4_format('[height<=720]'),
    '480': _browser_mp4_format('[height<=480]'),
}

QUALITY_CAPS = {'1080': 1080, '720': 720, '480': 480}


def normalize_video_quality(value):
    quality = str(value or 'best').lower().replace('p', '')
    return quality if quality in VIDEO_QUALITY_FORMATS else 'best'


def inspect_available_formats(ytdlp_bin, url, env, timeout=90):
    """Return only sanitized resolution metadata for a playable source."""
    result = subprocess.run(
        [
            ytdlp_bin,
            '--no-playlist',
            '--skip-download',
            '--dump-single-json',
            '--no-warnings',
            '--referer', 'https://www.skool.com/',
            '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            url,
        ],
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError('No se pudieron verificar las resoluciones disponibles de la fuente.')

    try:
        payload = json.loads(result.stdout or '{}')
    except json.JSONDecodeError as error:
        raise RuntimeError('La fuente no devolvió información de calidad válida.') from error

    heights = set()
    compatible_heights = set()
    has_aac_audio = False
    for item in payload.get('formats') or []:
        if not isinstance(item, dict):
            continue
        vcodec = str(item.get('vcodec') or '').lower()
        acodec = str(item.get('acodec') or '').lower()
        if acodec.startswith(('mp4a', 'aac')):
            has_aac_audio = True
        if vcodec == 'none':
            continue
        try:
            height = int(item.get('height') or 0)
        except (TypeError, ValueError):
            height = 0
        if height > 0:
            heights.add(height)
            if vcodec.startswith(('avc1', 'h264')) and (
                acodec in ('', 'none') or acodec.startswith(('mp4a', 'aac'))
            ):
                compatible_heights.add(height)

    try:
        root_height = int(payload.get('height') or 0)
    except (TypeError, ValueError):
        root_height = 0
    if root_height > 0:
        heights.add(root_height)

    ordered = sorted(heights)
    compatible = sorted(compatible_heights) if has_aac_audio else []
    return {
        'availableHeights': ordered,
        'maxHeight': ordered[-1] if ordered else None,
        'compatibleHeights': compatible,
        'maxCompatibleHeight': compatible[-1] if compatible else None,
    }


def expected_video_height(format_report, requested_quality):
    report = format_report or {}
    source_heights = report.get('compatibleHeights')
    if source_heights is None:
        # Backwards compatibility for old reports and unit-level callers.
        source_heights = report.get('availableHeights', [])
    heights = [int(value) for value in source_heights if int(value) > 0]
    if not heights:
        return None
    quality = normalize_video_quality(requested_quality)
    cap = QUALITY_CAPS.get(quality)
    eligible = [height for height in heights if cap is None or height <= cap]
    return max(eligible) if eligible else None


def verify_downloaded_quality(metadata, format_report, requested_quality):
    """Fail before upload/replacement when yt-dlp selected a lower rendition."""
    enriched = dict(metadata or {})
    expected = expected_video_height(format_report, requested_quality)
    actual = int(enriched.get('actualHeight') or 0)
    enriched['availableHeights'] = list((format_report or {}).get('availableHeights') or [])
    enriched['sourceMaxHeight'] = (format_report or {}).get('maxHeight')
    enriched['expectedHeight'] = expected
    if expected and (not actual or actual < expected):
        raise RuntimeError(
            f'Control de calidad fallido: la fuente ofrece {expected}p, pero el archivo descargado es '
            f'{actual or "desconocido"}p. No se reemplazó el video de Drive.'
        )
    return enriched


def verify_browser_compatible(metadata):
    """Reject codecs that commonly fail in an HTML5 MP4 player before upload."""
    enriched = dict(metadata or {})
    video_codec = str(enriched.get('videoCodec') or '').lower()
    audio_codec = str(enriched.get('audioCodec') or '').lower()
    video_ok = video_codec in ('h264', 'avc1') or video_codec.startswith(('h264', 'avc1'))
    audio_ok = not audio_codec or audio_codec == 'aac' or audio_codec.startswith(('aac', 'mp4a'))
    enriched['browserCompatible'] = bool(video_ok and audio_ok)
    if not enriched['browserCompatible']:
        codecs = ' + '.join(value for value in (video_codec, audio_codec) if value) or 'desconocidos'
        raise RuntimeError(
            f'Compatibilidad web fallida: el archivo usa {codecs}; se requiere H.264 + AAC. '
            'No se reemplazó el video de Drive.'
        )
    return enriched
