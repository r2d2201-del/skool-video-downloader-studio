---
name: skool-video-downloader
description: >
  Descargar, extraer, analizar y automatizar la obtención de videos y recursos de cursos, lecciones de aulas (classrooms),
  publicaciones de comunidad y páginas de Skool.com. Soporta videos alojados en Loom, Wistia, Vimeo, YouTube,
  transmisiones HLS nativas de Skool (.m3u8 firmados por Fastly y Cloudflare), y descarga organizada de recursos/adjuntos
  (PDFs, ZIPs, plantillas, enlaces). Usar cuando el usuario pida descargar videos de Skool, extraer un curso completo,
  descargar streams con token .m3u8, automatizar descargas con yt-dlp, extraer recursos anexos o guardar en carpetas organizadas.
---

# Skool Video Downloader Skill (v2.1.0)

Esta habilidad proporciona flujos de trabajo, utilidades y scripts para extraer y descargar videos individuales, recursos anexos y cursos completos desde [Skool.com](https://www.skool.com) organizados en carpetas estructuradas.

## 📌 Capacidades y Plataformas Soportadas

1. **Streams Nativos HLS de Skool (Fastly / Cloudflare)**:
   - Manifests `.m3u8` firmados con parámetros `signature=...`, `token=...`, `expires=...`.
   - Requieren cabeceras específicas (`Referer: https://www.skool.com` y User-Agent de navegador).
   - Aceleración mediante descarga concurrente de fragmentos (`--concurrent-fragments 10`).

2. **Videos Embebidos Multi-Plataforma**:
   - **Loom**: `https://www.loom.com/share/{id}` o `https://www.loom.com/embed/{id}`.
   - **Wistia**: `https://fast.wistia.net/embed/iframe/{id}` (resolución automática a MP4 1080p/720p).
   - **Vimeo**: `https://player.vimeo.com/video/{id}`.
   - **YouTube**: `https://www.youtube.com/watch?v={id}` o `https://youtu.be/{id}`.

3. **Descarga de Recursos y Archivos Anexos**:
   - Detección de archivos PDF, ZIP, documentos, plantillas y enlaces externos adjuntos a cada lección.
   - Agrupación automática del video y sus recursos en una misma carpeta organizada por curso y lección.

4. **Extracción Masiva de Aulas (Classrooms)**:
   - Extracción de identificadores de lección `md={id}` mediante `__NEXT_DATA__` y enlaces del DOM.
   - Generación de listas de URLs, tablas CSV y scripts batch (`.sh` / `.bat`) con rutas de carpetas estructuradas.

---

## 🛠️ Herramientas y Scripts Incluidos

- **`scripts/download_skool_video.py`**: Descarga de videos y recursos con `yt-dlp` inyectando cabeceras requeridas, concurrencia, y rutas de subcarpeta estructuradas (`{Comunidad}/{Curso}/{Numero}_{Leccion}/`).
- **`scripts/extract_skool_course.py`**: Analiza HTML de páginas de Skool o JSON de `__NEXT_DATA__` para extraer todas las lecciones, enlaces de video y archivos adjuntos.
- **`scripts/generate_batch_script.py`**: Genera scripts de terminal listos para ejecutar descargas por lotes organizadas en carpetas.
- **`references/hls-signed-tokens.md`**: Guía técnica detallada sobre la estructura de tokens Fastly y Cloudflare en Skool.
- **`references/supported-platforms.md`**: Detalles de extracción para cada reproductor.
- **`references/bulk-classroom-scraping.md`**: Procedimientos para scraping de temarios y adjuntos.

---

## 📋 Flujo de Trabajo para Descargar Videos y Recursos

### Caso 1: Descargar un video y sus recursos a una carpeta organizada
```bash
python3 ~/.gemini/config/skills/skool-video-downloader/scripts/download_skool_video.py \
  --url "URL_DEL_STREAM_O_LECCION" \
  --output-dir "~/Downloads/Skool_Cursos/MiComunidad/MiCurso/01_Introduccion" \
  --title "01_Introduccion" \
  --concurrent-fragments 10
```

---

### Caso 2: Extraer aula completa con recursos
1. **Extraer la lista de lecciones y recursos**:
   ```bash
   python3 ~/.gemini/config/skills/skool-video-downloader/scripts/extract_skool_course.py \
     --input-html "classroom_page.html" \
     --output "course_manifest.json"
   ```

2. **Generar script batch de descarga organizada**:
   ```bash
   python3 ~/.gemini/config/skills/skool-video-downloader/scripts/generate_batch_script.py \
     --urls-file "urls.txt" \
     --format bash \
     --output-dir "./Skool_Cursos/NombreDelCurso" \
     --output-script "download_course.sh"
   ```

3. **Ejecutar la descarga masiva**:
   ```bash
   chmod +x download_course.sh
   ./download_course.sh
   ```

---

## ⚠️ Reglas Críticas
- **Siempre incluir Referer**: Skool y Fastly bloquean peticiones sin `Referer: https://www.skool.com`.
- **Preservar firma completa**: Nunca truncar los parámetros `?signature=`, `?token=`, `?cdn=`.
- **Fragmentos concurrentes**: Usar `--concurrent-fragments 10` para acelerar streams HLS.
- **Organización por carpetas**: Mantener la convención `{Numero_Leccion}_{Titulo_Leccion}` para preservar el orden secuencial del curso.
