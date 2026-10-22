# Progreso de Cinematic LMS Studio

Estado del 12 de octubre de 2026: código configurado y verificado contra Supabase real.
Proyecto dedicado Cinematic LMS Studio (clxkhnokfgebiqhybctg), región US East,
plan Free, organización Arturo Laaz Apss (tgfudllwiaysijadzwsr). Arturo creó el
proyecto desde el panel. La migración lesson_progress_accounts está aplicada y
el asesor de seguridad no encontró observaciones.

Destino de publicación: https://cinematic-lms-studio.vercel.app/.
Vercel: prj_VScRzHFR9Wm5Xq2ALcl7BEMF1Gp6, equipo team_HbXqTufo0URnulzEIpAOwWFN.
Repositorio r2d2201-del/skool-video-downloader-studio, rama main, raíz del proyecto,
salida estática dist/.

## Archivos y funcionamiento

- `js/progress-store.js`: copia local por cuenta, curso y lección; cambios pendientes
  en claves independientes para que las pestañas no sobrescriban toda la lista.
- `js/cloud-progress.js`: registro, acceso y recuperación con Supabase Auth;
  sincronización al entrar, volver a la pestaña, reconectar y cada minuto visible.
- `docs/progress-schema.sql`: tabla con RLS por propietario y RPC con revisiones,
  idempotencia y protección frente a cambios antiguos. Se conserva `completed=false`.
- `js/cloud-config.js`: solo URL y clave **publishable**. Ninguna contraseña,
  `service_role`, clave secreta o token administrativo debe entrar en estos archivos.
- `src/supabase-client.js`: cliente oficial y sanitización de HTML. Versiones exactas
  en `package.json` y `package-lock.json`; bundle local para funcionamiento offline.
- `scripts/build_web.js`: genera el bundle y `dist/` con una lista explícita de
  archivos web. Actualiza también el espejo `studio-web/` utilizado por el servidor
  local. No copia logs, cookies, secretos, tests ni scripts de descarga a `dist/`.

Los datos antiguos de `cinematic_lms_completed_lessons` permanecen intactos como
respaldo. Se trasladan a registros por curso y se importan en la primera cuenta que
inicia sesión en ese navegador. La importación solo añade lecciones ausentes; no
sobrescribe una lección desmarcada en la nube. Repetir el inicio de sesión en cada
navegador/origen anterior permite recoger las marcas que aún conserve cada uno.

Si dos dispositivos editan la misma lección sobre revisiones distintas, gana la
revisión del servidor. La interfaz avisa del conflicto y permite marcar de nuevo.
La cola solo elimina operaciones confirmadas, y cada petición fija la sesión
original para impedir mezclas durante un cambio de cuenta.

## Acceso y mantenimiento

1. En la plataforma, pulsar **GUARDAR MI PROGRESO** y crear una cuenta con el
   correo que pertenece al proyecto Supabase. Confirmar el enlace recibido.
   Usar siempre esa misma cuenta en cada navegador o dispositivo.
2. Se mantiene la confirmación de correo. El correo predeterminado de Supabase
   solo envía a miembros del proyecto y tiene un límite de 2 correos/hora. Para
   incorporar otras personas, configurar SMTP propio; no desactivar verificaciones.
3. Site URL y las tres redirecciones exactas ya configuradas:
   - https://cinematic-lms-studio.vercel.app/
   - https://cinematic-lms-studio-artur-saas.vercel.app/
   - https://cinematic-lms-studio-git-main-artur-saas.vercel.app/
4. El plan Free puede pausarse tras una semana sin actividad; reactivarlo desde
   Supabase si ocurre. La pausa no equivale al borrado del progreso. No se contrató
   ningún plan de pago. Revisar con Arturo antes de contratar servicio continuo.
5. Vercel usa npm run build -- --require-cloud, que comprueba la configuración
   pública. No aplicar otra vez el SQL inicial sobre la misma tabla; futuros
   cambios requieren una migración nueva.
6. Publicar solo cambios de esta funcionalidad. El catálogo y el descargador
   tenían modificaciones locales previas, que se conservan fuera de este cambio.

## Verificación local

```sh
npm ci --ignore-scripts
npm run build
npm test
```

18 pruebas pasan: persistencia, dos pestañas/dispositivos, reintentos, desconexión,
conflictos, migración, cambio de cuenta, almacenamiento bloqueado, interfaz de
acceso y HTML. Las pruebas SQL usan PostgreSQL en memoria (PGlite) con dos usuarios,
roles y RLS reales. Las pruebas de interfaz de la suite usan Auth/HTTP simulados. Además se ejecutaron
7 comprobaciones contra el proyecto Supabase real con dos cuentas sintéticas:
acceso e importación, segundo origen, desmarcado, cola sin conexión tras reabrir,
aislamiento entre cuentas, denegación anónima y RPC con conflictos/reintentos.
Los clientes de la prueba real ejecutan el controlador de la aplicación y el SDK
oficial en JSDOM, con peticiones HTTP reales. Las sesiones de prueba se cerraron.
Se comprobó además en el navegador local que una clase marcada continúa completada
tras recargar. No se envió correo de prueba; el usuario completará el registro y
confirmación con su propio correo.

La licencia pendiente de Xcode bloquea `/usr/bin/git`. Para las operaciones Git
funciona `/Library/Developer/CommandLineTools/usr/bin/git`, sin aceptar licencias
ni cambiar configuraciones del equipo.

## Incidencia de acceso: 22 de octubre de 2026

El proyecto estaba INACTIVE y su endpoint de Auth no resolvía por DNS. Se reactivó
con restore_project y volvió a ACTIVE_HEALTHY. Se comprobó mediante una consulta
administrativa que la cuenta consultada por su titular existe y está confirmada;
no se consultó ni modificó su contraseña. La pausa del plan gratuito puede volver
a ocurrir con poca actividad: https://supabase.com/docs/guides/platform/free-project-pausing.

La versión 3.0.1 incorpora «Comprobar servicio» en el formulario. Consulta únicamente
GET /auth/v1/settings, sin enviar correo ni contraseña, sin caché y con límite de
8 segundos. Verifica que la respuesta corresponda al servicio de acceso por correo.
Se consulta al abrir el formulario y bajo petición, sin tareas periódicas nuevas.
Los mensajes distinguen credenciales incorrectas, correo sin confirmar, restricción
de correo, límite de intentos, fallo del servidor y errores de conexión de Safari
(«Load failed»). Un fallo de red no prueba que las credenciales sean incorrectas.
La interfaz pública no incorpora una consulta de existencia de correos.

Validación: 22 pruebas locales pasan, incluida recuperación del indicador de servicio,
HTTP 401/429/503, respuesta inesperada y timeout. Comprobación real en el navegador:
«Servicio de acceso disponible» después de la reactivación. No se enviaron correos
ni se crearon cuentas de prueba para este arreglo.
