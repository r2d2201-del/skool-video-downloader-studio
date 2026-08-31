# 🎬 Skool Video Downloader (Chrome Extension v2.1.0)

Extensión de Google Chrome (Manifest V3) de alto rendimiento para detectar y descargar videos y recursos adjuntos en toda la plataforma **Skool.com** (lecciones de aulas / classrooms, publicaciones de la comunidad y páginas sobre/about).

Soporta múltiples reproductores y CDN de streaming: **Loom, Wistia, Vimeo, YouTube, y transmisiones directas HLS de Fastly / Cloudflare (`.m3u8` con tokens firmados)**.

---

## ✨ Características Principales (v2.1.0)

- **Descarga Directa en el Navegador**: Descarga videos con 1 clic directamente desde la extensión, sin necesidad de usar terminal. Incluye un motor de descarga concurrente para streams HLS con barra de progreso en vivo.
- **Detección y Descarga de Recursos Adjuntos**: Extrae todos los archivos PDF, ZIP, hojas de cálculo, documentos y enlaces (Google Drive, Notion, Figma) adjuntos a cada lección.
- **Botón "📦 Descargar Pack Completo"**: Descarga el video y todos los archivos adjuntos de la lección de una sola vez.
- **Organización en Carpetas Personalizadas**:
  - Elige tu carpeta base (ej. `Skool_Downloads` o `Mis_Cursos`).
  - Organiza automáticamente por: `{Comunidad}/{Curso}/{01_TituloLeccion}/` o por tipo `{Curso}/Videos` y `{Curso}/Recursos`.
- **Extractor Masivo de Aulas (Classroom Bulk Extractor)**: Extrae todas las lecciones del curso (`md=...`) y genera listas `.txt`, tablas `.csv`, o scripts ejecutables `.sh` / `.bat`.
- **Generador de Comandos yt-dlp**: Para usuarios avanzados, copia con 1 clic comandos optimizados con cabeceras requeridas (`--referer "https://www.skool.com"`, `--concurrent-fragments 10` y user-agent anti-403).
- **Interfaz Moderna y Oscura**: Popup responsive con pestañas dedicadas (Lección, Recursos, Aula, Carpetas, Comandos).

---

## 🚀 Instalación en Google Chrome (Modo Desarrollador)

1. Abre Google Chrome y escribe en la barra de direcciones:
   ```text
   chrome://extensions/
   ```
2. Activa el interruptor **"Modo de desarrollador"** (Developer mode) en la esquina superior derecha.
3. Haz clic en el botón **"Cargar descomprimida"** (Load unpacked).
4. Selecciona la carpeta de este proyecto:
   ```text
   /Users/arturolaaz/Desarollo software/Skool_downloader
   ```
5. Si ya la tenías instalada, simplemente pulsa el botón **Recargar 🔄** en la tarjeta de la extensión.

---

## 📖 Modo de Uso

### 1. Descargar Video Directamente:
1. Abre cualquier lección en **Skool.com** y dale a **Play** al video si no aparece de inmediato.
2. Abre la extensión y pulsa **📥 Descargar**.
3. Verás la barra de progreso en tiempo real y el archivo se guardará en la carpeta configurada.

### 2. Descargar Recursos y Adjuntos:
1. Ve a la pestaña **📎 Recursos**.
2. Verás todos los archivos adjuntos (PDFs, ZIPs, enlaces).
3. Haz clic en **📥 Bajar** en el archivo que quieras o **📥 Descargar Todos los Recursos**.

### 3. Descargar Pack Completo (Video + Recursos):
1. En la pestaña **📺 Lección**, haz clic en el botón grande: **"📥 Descargar Todo (Video + Recursos)"**.
2. La extensión descargará el video y todos los adjuntos en su carpeta correspondiente.

### 4. Configurar Carpetas:
1. Ve a la pestaña **⚙️ Carpetas**.
2. Elige tu nombre de carpeta y la estructura jerárquica preferida.
3. Haz clic en **💾 Guardar Preferencias**.
