# Guía Técnica: Transmisiones HLS con Tokens Firmados en Skool

## 1. Arquitectura de Streaming de Skool.com

Skool utiliza principalmente dos proveedores de Content Delivery Network (CDN) para entregar video bajo demanda (VOD) protegido mediante HTTP Live Streaming (HLS):

1. **Fastly Video CDN**:
   - Host típico: `manifest-gcp-*.fastly.video.skool.com`
   - Manifest: `rendition.m3u8`
   - Query Parameters: `?cdn=...&signature=...&expires=...`
2. **Cloudflare Stream CDN**:
   - Host típico: `stream.video.skool.com`
   - Manifest: `{video_uid}.m3u8`
   - Query Parameters: `?token=eyJhbGciOiJSUzI1NiIs...` (JWT firmado)

---

## 2. Requisitos de Autenticación y Cabeceras

Los servidores de CDN de Skool validan estrictamente las cabeceras HTTP antes de entregar los segmentos `.ts`:

- **Referer Obligatorio**:
  ```http
  Referer: https://www.skool.com/
  ```
- **User-Agent de Navegador**:
  ```http
  User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36
  ```

Sin estas cabeceras, la petición devolverá inmediatamente un error **`HTTP 403 Forbidden`**.

---

## 3. Descarga con yt-dlp

El comando óptimo para descargar transmisiones firmadas con `yt-dlp` es:

```bash
yt-dlp \
  --add-header "Referer: https://www.skool.com/" \
  --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" \
  --concurrent-fragments 10 \
  --output "~/Downloads/Skool/%(title)s.%(ext)s" \
  "https://manifest-gcp-us-east1-vop1.fastly.video.skool.com/.../rendition.m3u8?signature=..."
```

### Parámetros Clave:
- `--concurrent-fragments 10`: Descarga 10 fragmentos de video `.ts` en paralelo simultáneamente. Esto multiplica la velocidad de descarga entre 5x y 10x frente a la descarga secuencial estándar.
- `--output`: Define la plantilla de salida asegurando que el merge automático a `.mp4` se realice sin pérdidas.

---

## 4. Solución de Problemas (Troubleshooting)

| Error | Causa Probable | Solución |
|---|---|---|
| `403 Forbidden` | Token de firma expirado | Recargar la lección en Skool en el navegador y copiar la nueva URL con token vigente generada por la extensión. |
| `403 Forbidden` | Cabecera `Referer` ausente | Asegurar `--referer "https://www.skool.com"` en el comando. |
| `Unable to extract video` | Enlace sin parámetros de firma | Asegurarse de copiar la URL completa de la red (incluyendo `?signature=` o `?token=`). |
