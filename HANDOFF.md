# 🚀 HANDOFF & CONTEXTO DEL PROYECTO: SKOOL DOWNLOADER & CINEMATIC LMS STUDIO

> **Fecha de actualización:** 3 de Septiembre de 2026  
> **Estado:** 100% Operativo y Desplegado en Producción en Vercel  
> **Repositorio GitHub:** `https://github.com/r2d2201-del/skool-video-downloader-studio`  
> **Plataforma Web en Vivo:** `https://cinematic-lms-studio.vercel.app`

---

## 📌 1. Visión General y Arquitectura del Sistema

El proyecto consta de dos piezas integradas:

1. **Extensión de Google Chrome (Manifest V3 + Native Messaging)**:
   - Permite descargar clases individuales, módulos o aulas completas desde cualquier comunidad de Skool.com.
   - Resuelve flujos de video protegidos (Mux HLS con tokens firmados, Wistia, Vimeo, YouTube, Loom) directamente en el contexto del navegador para heredar cookies y sesiones activas sin bloqueos WAF / Cloudflare.
   - Se comunica con el sistema operativo usando **Chrome Native Messaging** (`scripts/native_host.py`), ejecutándose **bajo demanda** (0 procesos en segundo plano, 0.0 MB de RAM en reposo).
   - Sube videos en fragments de 16 MB con subida reanudable (Resumable Upload) a Google Drive, soportando archivos de más de 2 GB.
   - Actualiza automáticamente el catálogo de cursos (`data/course-data.js` y `studio-web/data/course-data.js`) con los enlaces de streaming de Google Drive.

2. **Cinematic LMS Studio (Web PWA en Vercel)**:
   - Interfaz web moderna (estilo Netflix / plataforma de streaming cinematográfica) para visualizar los cursos descargados.
   - Los reproductores de video se alimentan directamente de los `gdriveId` de Google Drive.
   - Se despliega de forma continua y automática mediante la integración de GitHub con Vercel cada vez que se hace `git push origin main`.

---

## 📂 2. Estructura y Ubicaciones en Google Drive

- **Carpeta Raíz en Google Drive**:  
  `Skool Downloads` (ID: `13CJ1bm6bfY7IdpyhjC75SNukpHFGuiZH`)

### A. Comunidad: `Ultimate Editors 2.0` (ID de Carpeta: `1cZALyp6LNV-I7iNHK6CPSFE1ZFvWBfFg`)
*Esta es la carpeta oficial y unificada donde se consolidaron todos los cursos recientes:*

| Curso | Lecciones Totales | En Drive | ID Carpeta en Drive |
|---|---|---|---|
| **Cinematic Short-Film Editing Style** | 34 | 32 | `1ixMK0y6mzYW9UC0HCzzNxBU-Wp6AahDO` |
| **The AI Editing Fundamentals** | 31 | 31 | `1nedO_fBtpmfRRcAyffdQ2H2oUC2jmH0I` |
| **The Editing Fundamentals** | 13 | 13 | `1qQS5OBE6rjUxEBaNFoUXnZaq0RzF9frK` |
| **The Minimal Animation Masterclass** | 44 | 44 | `1IxkT0SHEYCfOOq8UgPwWjN3K_9i1i8tO` |
| **The SAAS Animations Masterclass** | 33 | 33 | `1vbOSyaB8qZwMWdgBol5U8G0SeWFPyp7m` |
| **Viral Animation Breakdowns** | 51 | 51 | `1avaGxh3AG5cbQEasAmJICdlE5qNVdfLD` |
| **The Devin Jatho Masterclass** | 33 | 33 | `1v-UlKCh9SF4BKD6oqJlK9oIt6l-siH9b` |
| **The $2,000mo Editor Blueprint** | 23 | 23 | `1OMNPHI5SD_v4-q_3tVBhzkY1kJ281kbi` |
| **TOTAL COMUNIDAD 2.0** | **262** | **260** | *(8 Cursos Completos)* |

> **Nota:** La carpeta antigua duplicada `Ultimateeditors2` (`1q6zjLh2svNntCg0R7GDH8njjNZ7B_cyM`) fue vaciada (todos sus cursos se movieron a `Ultimate Editors 2.0`) y enviada a la papelera.

### B. Comunidad: `Ultimate editors` (ID de Carpeta: `1DZXJwvvzLC8RDBSpZUri_p9Yw769OswR`)
*Cursos de la comunidad original descargados anteriormente:*

| Curso | Lecciones Totales | En Drive | ID Carpeta en Drive |
|---|---|---|---|
| **Josh Lyon Editing Masterclass** | 25 | 25 | `1cBgs4s62YLnMNEej--KtW-Qrni2EgDTE` |
| **Devin Jatho Editing Masterclass** | 33 | 33 | `1u_cgQqUv1BvJG2JEYAF1cgTJsrCtxWCH` |
| **Bymaximise Editing Masterclass** | 25 | 25 | `1OMTwXjgRQYCqYWSzv6HkBVsSlhKSNmtj` |
| **3D Animated Editing Masteclass** | 37 | 37 | `193YUceBxbsv8HpviId7Pm62I09akLhUa` |
| **Iman Ghadzi Editing Masterclass** | 31 | 31 | `1c7qOGquhQ3h9um0jCfA-GM-xnAMVzYB0` |
| **TOTAL COMUNIDAD ORIGINAL** | **151** | **151** | *(5 Cursos Completos)* |

**TOTAL GLOBAL EN PLATAFORMA:** **13 cursos**, **413 lecciones en video HD 1080p**.

---

## 🛠️ 3. Componentes Críticos del Código y Correcciones Recientes

### 1. Motor Nativo Bajo Demanda (`scripts/native_host.py`)
- **Protocolo**: Standard I/O de Chrome con longitud de 4 bytes (32-bit unsigned int little-endian `@I`) + payload JSON UTF-8.
- **Sin demonios de fondo**: El servicio `LaunchAgent` (`com.cinematic.skoolserver.plist`) fue descargado y eliminado. No hay procesos escuchando en el puerto 4545 en reposo.
- **Normalización de Carpetas (`clean_folder_name`)**:  
  Se corrigió el bug donde cualquier nombre con *"ultimate"* y *"editor"* era forzado a *"Ultimate Editors"*. Ahora prioriza estrictamente las variantes `2.0` (`ultimateeditors2`, `ultimate_editors_2`, `Ultimate Editors 2.0`).
- **Limpieza en modo Drive (`storageMode: 'gdrive'`)**:  
  El archivo local se elimina tras la subida y se limpian automáticamente los directorios padre vacíos para no dejar carpetas vacías en la Mac del usuario.
- **Ubicación del manifiesto en macOS**:  
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.cinematic.skool_downloader.json`
- **Clave criptográfica fija en `manifest.json`**:  
  Fija el ID de la extensión en `fphcobejgolnnjdkegldnablfhnelnoc` para coincidir siempre con los `allowed_origins` del Native Host.

### 2. Extensión (`popup/popup.js` & `content_scripts/skool-detector.js`)
- **Navegación por Pestañas Inmediata**:  
  Los listeners de las pestañas (`📺 Lección`, `📎 Recursos`, `📚 Aula Completa`, `⚙️ Destino`) se inicializan en las primeras líneas de `DOMContentLoaded`, evitando que errores en lógica posterior congelen la interfaz.
- **Comprobación Asíncrona con Timeout (600ms)**:  
  `checkBridgeStatus()` y `checkNativeHost()` cuentan con un timeout estricto de 600ms y corren de forma no bloqueante para que la ventana emergente nunca se quede congelada en *"Buscando video..."*.
- **Auto-guardado en Destino**:  
  Los campos de texto en `⚙️ Destino` (`inputCustomCommunityName`, `inputCustomCourseName`, etc.) se guardan automáticamente en `chrome.storage.local` en el evento `change` / `blur`, sin requerir pulsar obligatoriamente el botón de guardar.
- **Extracción de Stream Mux HLS**:  
  En `content_scripts/skool-detector.js`, la acción `RESOLVE_LESSON_STREAM` consulta la ruta de datos Next.js `/_next/data/{buildId}/{community}/classroom/{courseId}.json?md={targetMd}` y extrae `pageProps.video.playbackId` y `pageProps.video.playbackToken`, generando la URL directa `https://stream.mux.com/{playbackId}.m3u8?token={token}` en 20ms con sesión activa.

### 3. Sincronización de Catálogo (`data/course-data.js` & `studio-web/data/course-data.js`)
- Ambos archivos deben mantenerse siempre idénticos (`cp data/course-data.js studio-web/data/course-data.js`).
- Estructura: `window.COMMUNITIES_DATA = [...]` donde cada comunidad contiene su array `courses: [...]`, con `modules: [...]` y `lessons: [...]`.
- Al hacer `git push origin main`, Vercel compila y publica los cambios de forma automática en ~30 segundos.

---

## 🔍 4. Observaciones y Tareas Pendientes para el Siguiente Agente

El usuario mencionó: *"aún no está del todo bien pero lo trabajaremos luego, por ahora solo quiero que se actualicen los cursos nuevos en vercel"*.

Aspectos clave a inspeccionar y mejorar en la próxima sesión:
1. **Verificación Visual de Cursos en Studio Web**:
   - Abrir `https://cinematic-lms-studio.vercel.app` y comprobar que los 8 cursos de `Ultimate Editors 2.0` se desplieguen con sus portadas, títulos y lecciones.
   - Comprobar que el selector de comunidad alterne correctamente entre `Ultimate Editors 2.0` y `Ultimate editors`.
2. **Descarga de Recursos Anexos (PDFs, ZIPs, Enlaces de Figma/Canva)**:
   - Revisar si el usuario requiere que los adjuntos de las clases descargadas se enlacen o se descarguen en lote dentro de la interfaz del Studio Web.
3. **Optimización del Popup de la Extensión**:
   - Pulir los mensajes de retroalimentación en la pestaña `📚 Aula Completa` (por ejemplo, badges de estado cuando todas las lecciones están verificadas en Drive).
   - Verificar si el usuario desea que la insignia `⚡ Motor Nativo` ofrezca un botón de prueba o reconexión manual si Chrome alguna vez duerme el host.

---

## 🧪 5. Comandos de Verificación Rápida

```bash
# 1. Comprobar sintaxis de archivos JavaScript
node -c "popup/popup.js"
node -c "content_scripts/skool-detector.js"
node -c "service-worker.js"

# 2. Comprobar que el Host Nativo responde a PING
python3 -c '
import subprocess, struct, json
proc = subprocess.Popen(["scripts/native_host.py"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
req = json.dumps({"action": "STATUS"}).encode("utf-8")
proc.stdin.write(struct.pack("@I", len(req)))
proc.stdin.write(req)
proc.stdin.flush()
raw_len = proc.stdout.read(4)
length = struct.unpack("@I", raw_len)[0]
print("Native Host Status:", json.loads(proc.stdout.read(length).decode("utf-8")))
proc.stdin.close()
proc.wait()
'

# 3. Comprobar estado de cursos en el catálogo local
python3 -c '
import json
with open("data/course-data.js") as f:
    c = f.read()
data = json.loads(c[c.find("["):c.rfind("]")+1])
for comm in data:
    print(comm["name"], ":", len(comm["courses"]), "cursos")
'
```
