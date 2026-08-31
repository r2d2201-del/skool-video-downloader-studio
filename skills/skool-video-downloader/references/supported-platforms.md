# Plataformas de Video Soportadas en Skool.com

Los creadores de cursos en Skool incrustan contenido mediante diversas plataformas y reproductores. La extensión y la skill detectan y descargan todas ellas:

---

## 1. Loom (loom.com)
- **Patrones de URL**:
  - `https://www.loom.com/share/{video_id}`
  - `https://www.loom.com/embed/{video_id}`
- **Descarga directa con yt-dlp**:
  ```bash
  yt-dlp "https://www.loom.com/share/b19b38d0ce2b44f5a049b871d9a38925" -o "%(title)s.%(ext)s"
  ```

---

## 2. Wistia (wistia.com / wistia.net)
- **Patrones de URL**:
  - `https://fast.wistia.net/embed/iframe/{media_hashed_id}`
  - `https://{account}.wistia.com/medias/{media_hashed_id}`
- **Descarga directa con yt-dlp**:
  ```bash
  yt-dlp "https://fast.wistia.net/embed/iframe/abcdef1234" -o "%(title)s.%(ext)s"
  ```

---

## 3. Vimeo (vimeo.com)
- **Patrones de URL**:
  - `https://player.vimeo.com/video/{vimeo_id}`
  - `https://vimeo.com/{vimeo_id}`
- **Descarga directa con yt-dlp**:
  ```bash
  yt-dlp --referer "https://www.skool.com" "https://player.vimeo.com/video/123456789" -o "%(title)s.%(ext)s"
  ```

---

## 4. YouTube (youtube.com / youtu.be)
- **Patrones de URL**:
  - `https://www.youtube.com/watch?v={id}`
  - `https://youtu.be/{id}`
  - `https://www.youtube.com/embed/{id}`
- **Descarga directa con yt-dlp**:
  ```bash
  yt-dlp "https://www.youtube.com/watch?v=VIDEO_ID" -o "%(title)s.%(ext)s"
  ```

---

## 5. Skool Native HLS (Fastly / Cloudflare)
- **Patrones de URL**:
  - `https://manifest-gcp-*.fastly.video.skool.com/.../rendition.m3u8?signature=...`
  - `https://stream.video.skool.com/...m3u8?token=...`
- **Descarga directa con yt-dlp**:
  ```bash
  yt-dlp --referer "https://www.skool.com" --concurrent-fragments 10 "URL_DEL_STREAM" -o "%(title)s.%(ext)s"
  ```
