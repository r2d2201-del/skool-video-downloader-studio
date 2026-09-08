# 🎬 Skool Video Downloader (Chrome Extension v2.8.1)

Extensión de Google Chrome (Manifest V3) de alto rendimiento para detectar y descargar videos y recursos adjuntos en toda la plataforma **Skool.com** (lecciones de aulas / classrooms, publicaciones de la comunidad y páginas sobre/about).

Soporta múltiples reproductores y CDN de streaming: **Loom, Wistia, Vimeo, YouTube, y transmisiones directas HLS de Fastly / Cloudflare (`.m3u8` con tokens firmados)**.

---

## ✨ Características Principales (v2.8.1)

- **Cola persistente fuera del popup**: Puedes cerrar la ventana de la extensión mientras el motor nativo procesa un curso largo. Los streams firmados se resuelven justo antes de cada descarga.
- **Detección y Descarga de Recursos Adjuntos**: Extrae PDFs, ZIPs, hojas de cálculo, documentos y enlaces (Google Drive, Notion, Figma) asociados por ID a su lección original.
- **Botón "📦 Descargar Pack Completo"**: Descarga el video y todos los archivos adjuntos de la lección de una sola vez.
- **Organización en Carpetas Personalizadas**:
  - Elige o crea en vivo una carpeta base de Google Drive; se guarda su ID estable y se comprueba antes de usarla.
  - La estructura recomendada es `Skool Downloads / Comunidad / Curso` para todas las comunidades actuales y futuras.
  - Organiza automáticamente por: `{Comunidad}/{Curso}/{01_TituloLeccion}/` o por tipo `{Curso}/Videos` y `{Curso}/Recursos`.
- **Orden determinista**: Módulos y lecciones conservan el orden original aunque las subidas a Drive terminen en otro orden.
- **Catálogo inteligente**: La extensión reconoce las clases que ya están catalogadas y las omite por defecto para evitar descargas duplicadas.
- **Calidad seleccionable**: Permite descargar en calidad máxima o limitar a 1080p, 720p o 480p.
- **Reemplazo sin enlaces rotos**: Al elegir “Reemplazar en Drive”, actualiza el contenido del mismo archivo y conserva su ID y enlace web.
- **Sincronización Vercel manual y agrupada**: Las descargas actualizan el catálogo local, pero ningún lote despliega automáticamente. Usa **Sincronizar web** una sola vez cuando hayas terminado.
- **Reproducción privada estable**: La web intenta reproducir los videos privados de Drive mediante el servidor local autenticado (`127.0.0.1:4545`), sin depender de cookies de terceros ni hacer públicos los archivos. Si el servidor no está activo, muestra un enlace seguro para abrirlos en Drive.
- **Interfaz Moderna y Oscura**: Popup accesible con pestañas dedicadas (Lección, Recursos, Aula Completa y Destino).

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
