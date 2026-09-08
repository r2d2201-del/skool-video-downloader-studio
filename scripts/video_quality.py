"""Shared yt-dlp quality selection and verification helpers.

Signed media URLs are accepted only as in-memory arguments. They are never
included in returned reports, log messages, or exceptions.
"""

import json
import subprocess


VIDEO_QUALITY_FORMATS = {
    'best': 'bestvideo+bestaudio/best',
    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
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
    for item in payload.get('formats') or []:
        if not isinstance(item, dict) or item.get('vcodec') == 'none':
            continue
        try:
            height = int(item.get('height') or 0)
        except (TypeError, ValueError):
            height = 0
        if height > 0:
            heights.add(height)

    try:
        root_height = int(payload.get('height') or 0)
    except (TypeError, ValueError):
        root_height = 0
    if root_height > 0:
        heights.add(root_height)

    ordered = sorted(heights)
    return {
        'availableHeights': ordered,
        'maxHeight': ordered[-1] if ordered else None,
    }


def expected_video_height(format_report, requested_quality):
    heights = [int(value) for value in (format_report or {}).get('availableHeights', []) if int(value) > 0]
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
