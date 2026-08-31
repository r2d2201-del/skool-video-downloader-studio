# Extracción Masiva de Lecciones y Cursos en Skool

## Estructura del DOM y Datos de Next.js en Skool Classroom

Skool está construido sobre la arquitectura de **Next.js**. Cada página contiene un bloque JSON serializado con los datos completos del estado de la aplicación dentro del tag `<script id="__NEXT_DATA__">`.

---

## 1. Detección desde `__NEXT_DATA__`

En una página de aula de Skool, `__NEXT_DATA__` contiene el árbol del curso con sus módulos y lecciones:

```javascript
// Estructura simplificada dentro de __NEXT_DATA__
{
  "props": {
    "pageProps": {
      "course": {
        "id": "67977c4d...",
        "metadata": {
          "title": "Nombre del Curso"
        },
        "modules": [
          {
            "id": "module_id_1",
            "title": "Módulo 1",
            "lessons": [
              {
                "id": "0430f1b55fa146099a333506c6adb7ac",
                "metadata": {
                  "title": "Lección 1: Introducción",
                  "videoLink": "https://www.loom.com/share/...",
                  "videoLenMs": 125000
                }
              }
            ]
          }
        ]
      }
    }
  }
}
```

Cada lección tiene su propio identificador hexadecimal `md` (ej. `?md=0430f1b55fa146099a333506c6adb7ac`).

---

## 2. Scraping en Consola de Navegador

Para extraer todas las lecciones de un aula abierta en el navegador:

```javascript
function extractAllLessonUrls() {
  const urls = new Set();
  const currentUrl = new URL(window.location.href);
  const baseUrl = `${currentUrl.protocol}//${currentUrl.host}${currentUrl.pathname}`;
  
  // Buscar en todos los enlaces y atributos con md=
  document.querySelectorAll('a[href*="classroom"], a[href*="md="]').forEach(el => {
    if (el.href && el.href.includes('md=')) {
      urls.add(el.href);
    }
  });

  const urlArray = Array.from(urls).sort();
  console.log(`✅ Se encontraron ${urlArray.length} lecciones.`);
  
  // Descargar archivo urls.txt
  const blob = new Blob([urlArray.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'urls.txt';
  a.click();
}
```

---

## 3. Automatización con Scripts de Lote

Una vez obtenido el archivo `urls.txt`:

```bash
python3 ~/.gemini/config/skills/skool-video-downloader/scripts/generate_batch_script.py \
  --urls-file urls.txt \
  --format bash \
  --output-script download_course.sh

chmod +x download_course.sh
./download_course.sh
```
