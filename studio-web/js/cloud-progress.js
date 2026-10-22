(function () {
  'use strict';
  const config = window.CINEMATIC_CLOUD_CONFIG || {};
  const byId = id => document.getElementById(id);
  const dialog = byId('account-dialog');
  const listeners = new Set();
  let session = null, client = null, running = false, rerun = false, generation = 0;
  let state = 'local', message = '', storageError = null, mode = 'signin', recovering = false, authBusy = false;
  let store;
  let completedKeys = new Set();
  let checkingService = false;
  function emit() {
    try { if (store) completedKeys = store.completedKeys(); render(); } catch (error) { storageError = error; renderError(); }
    for (const listener of listeners) listener();
  }
  function renderError() {
    byId('progress-sync-status').textContent = 'No se pudo guardar';
    byId('progress-sync-status').dataset.state = 'error';
    byId('progress-sync-status').title = 'El navegador no permite guardar el progreso. Exporta una copia antes de cerrar.';
    byId('account-feedback').textContent = storageError?.message || 'No se pudo acceder al almacenamiento local.';
  }
  try {
    const storage = window.localStorage;
    store = new window.CinematicProgress.ProgressStore({ storage, uuid: () => crypto.randomUUID(), onChange: emit });
  } catch (error) { storageError = error; }
  function render() {
    if (storageError) { renderError(); return; }
    const pending = store.pending().length;
    const status = byId('progress-sync-status');
    let label = 'Solo en este navegador';
    if (state === 'syncing') label = 'Sincronizando…';
    else if (session && pending) label = `Pendiente de sincronizar (${pending})`;
    else if (state === 'error') label = 'Sincronización pendiente';
    else if (state === 'saved') label = 'Guardado en la nube';
    else if (session) label = 'Conectando…';
    status.textContent = label;
    status.dataset.state = state;
    status.title = message || (session ? 'El progreso se guarda en tu cuenta.' : 'Inicia sesión para conservar tu progreso en todos tus dispositivos.');
    byId('btn-account').textContent = session ? 'MI CUENTA' : 'GUARDAR MI PROGRESO';
    byId('account-signed-in').hidden = !session || recovering;
    byId('account-auth-form').hidden = !!session && !recovering;
    byId('account-email-value').textContent = session?.user?.email || '';
    byId('account-sync-detail').textContent = message || label;
    byId('account-title').textContent = recovering ? 'Elige tu nueva contraseña' : session ? 'Tu progreso, contigo' : 'Guarda tu progreso';
    byId('account-submit').disabled = !client || !!storageError || authBusy;
    byId('account-local-note').hidden = !!session;
    byId('account-cloud-unavailable').hidden = !!client;
  }
  function feedback(text, isError = false) {
    byId('account-feedback').textContent = text;
    byId('account-feedback').dataset.error = String(isError);
  }
  function readableError(error) {
    const code = error?.code || '', detail = error?.message || '';
    if (!navigator.onLine) return 'Este dispositivo está sin conexión. Tu progreso local se conserva; vuelve a intentar cuando tengas internet.';
    if (error?.status === 429 || /rate_limit/.test(code) || /rate.limit|too many/i.test(detail)) return 'Demasiados intentos o correos solicitados. Espera unos minutos antes de volver a intentar.';
    if (code === 'invalid_credentials' || /invalid login/i.test(detail)) return 'El correo o la contraseña no coinciden. Si nunca te registraste aquí, elige «Crear una cuenta». Si ya tienes cuenta, usa «Olvidé mi contraseña».';
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(detail)) return 'Tu cuenta necesita confirmar el correo. Abre el enlace de confirmación que recibiste y después vuelve a entrar.';
    if (code === 'email_address_not_authorized' || /email address.*not authorized/i.test(detail)) return 'No se puede enviar correo a esta dirección con la configuración actual. Usa el correo de tu organización Supabase o solicita habilitar el envío de correos.';
    if (code === 'weak_password') return 'Elige una contraseña más segura, de al menos 8 caracteres.';
    if (['email_exists', 'user_already_exists'].includes(code)) return 'Ya hay una cuenta con este correo. Entra o usa «Olvidé mi contraseña».';
    if (code === 'otp_expired') return 'El enlace ha caducado o ya se usó. Solicita uno nuevo desde «Olvidé mi contraseña».';
    if (code === 'signup_disabled' || code === 'email_provider_disabled') return 'El registro por correo no está disponible en este momento. Contacta con el administrador.';
    if (error?.status >= 500) return 'El servicio de acceso está fallando temporalmente. Este error no permite saber si tu contraseña es correcta. Tu progreso local se conserva; vuelve a intentarlo más tarde.';
    if (code === 'request_timeout' || ['AbortError', 'TimeoutError'].includes(error?.name)) return 'El servicio tardó demasiado en responder. No se pudo comprobar tu acceso; vuelve a intentarlo.';
    if (['AuthRetryableFetchError', 'TypeError'].includes(error?.name) || /fetch|network|load failed|failed to load/i.test(detail)) return 'No se pudo contactar con el servicio de acceso. Puede estar pausado, no disponible o bloqueado por la conexión. No se pudo comprobar tu correo ni tu contraseña. Tu progreso local se conserva.';
    return 'No se pudo comprobar tu acceso. Pulsa «Comprobar servicio» y vuelve a intentar. Tu progreso local se conserva.';
  }
  async function checkService() {
    const status = byId('account-service-status'), button = byId('account-check-service');
    if (!status || checkingService) return;
    function show(text, state) { status.textContent = text; status.dataset.state = state; }
    if (!client) { show('Servicio sin configurar.', 'error'); return; }
    if (!navigator.onLine) { show('Dispositivo sin conexión a internet.', 'error'); return; }
    checkingService = true;
    if (button) button.disabled = true;
    show('Comprobando servicio de acceso…', 'checking');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      // Public settings only: this check never submits an email or password.
      const response = await fetch(`${config.url}/auth/v1/settings`, {
        headers: { apikey: config.publishableKey }, cache: 'no-store', signal: controller.signal
      });
      if (response.status === 429) show('Servicio con demasiadas solicitudes. Espera unos minutos.', 'error');
      else if ([401, 403].includes(response.status)) show('La configuración del servicio necesita revisión.', 'error');
      else if (!response.ok) show('Servicio de acceso no disponible. Inténtalo más tarde.', 'error');
      else {
        const settings = await response.json();
        if (typeof settings?.external?.email !== 'boolean') throw new Error('Unexpected service response');
        show(settings.external.email ? 'Servicio de acceso disponible.' : 'El acceso por correo está deshabilitado.', settings.external.email ? 'available' : 'error');
      }
    } catch (_) {
      show(navigator.onLine ? 'No se pudo contactar con el servicio. Puede estar pausado o haber un problema de conexión.' : 'Dispositivo sin conexión a internet.', 'error');
    } finally {
      clearTimeout(timer); checkingService = false;
      if (button) button.disabled = false;
    }
  }
  function remoteFor(activeSession) {
    // Freeze this token for the whole pass. Switching accounts during a request
    // must not send user A's pending changes with user B's credentials.
    const headers = { apikey: config.publishableKey, Authorization: `Bearer ${activeSession.access_token}`, 'Content-Type': 'application/json' };
    async function request(path, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${config.url}/rest/v1/${path}`, { ...options, headers, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          const error = new Error('Cloud request failed');
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } finally { clearTimeout(timer); }
    }
    return {
      async list(userId) {
        if (activeSession.user.id !== userId) throw new Error('Account changed');
        const rows = [];
        for (let offset = 0; ; offset += 500) {
          const params = new URLSearchParams({ select: 'course_id,lesson_id,completed,version,mutation_id,updated_at', user_id: `eq.${userId}`, order: 'course_id.asc,lesson_id.asc', offset: String(offset), limit: '500' });
          const page = await request(`lesson_progress?${params}`);
          rows.push(...page);
          if (page.length < 500) return rows;
        }
      },
      async write(userId, op) {
        if (activeSession.user.id !== userId) throw new Error('Account changed');
        return request('rpc/set_lesson_progress', { method: 'POST', body: JSON.stringify({ p_course: op.course, p_lesson: op.lesson, p_completed: op.completed, p_version: op.baseVersion, p_mutation: op.id, p_import: op.kind === 'import' }) });
      }
    };
  }
  async function sync() {
    if (!client || !session || !store || storageError) return;
    if (running) { rerun = true; return; }
    if (!navigator.onLine) { state = 'error'; message = 'Sin conexión. Tus cambios quedan guardados aquí y se enviarán al reconectar.'; emit(); return; }
    running = true;
    const activeGeneration = generation;
    try {
      state = 'syncing'; message = ''; emit();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (activeGeneration !== generation) return;
      const activeSession = data.session;
      if (!activeSession || activeSession.user.id !== store.userId) throw new Error('Session expired');
      const work = () => store.sync(remoteFor(activeSession), () => generation === activeGeneration);
      const result = navigator.locks ? await navigator.locks.request(`cinematic-sync-${activeSession.user.id}`, work) : await work();
      if (activeGeneration !== generation) return;
      state = 'saved';
      message = result.conflicts ? 'Otra sesión había actualizado una de estas clases. Se conservó ese cambio; puedes volver a marcarla si quieres cambiarlo.' : '';
      if (result.conflicts) feedback(message);
      rerun = rerun || store.pending().length > 0;
    } catch (error) {
      if (activeGeneration === generation) {
        state = 'error';
        message = error.status === 401 ? 'Vuelve a iniciar sesión para enviar tus cambios pendientes.' : readableError(error);
      }
    } finally {
      running = false; emit();
      if (rerun) { rerun = false; if (state !== 'error') setTimeout(sync, 0); }
    }
  }
  function setMode(next) {
    mode = next;
    byId('account-password').required = next !== 'reset';
    byId('account-password-label').hidden = next === 'reset';
    byId('account-password').hidden = next === 'reset';
    byId('account-password').autocomplete = next === 'signin' ? 'current-password' : 'new-password';
    byId('account-password').minLength = next === 'signin' ? 1 : 8;
    byId('account-email').required = next !== 'recovery';
    byId('account-email').hidden = next === 'recovery';
    byId('account-email-label').hidden = next === 'recovery';
    byId('account-submit').textContent = { signin: 'Entrar', signup: 'Crear mi cuenta', reset: 'Enviar enlace de recuperación', recovery: 'Guardar contraseña' }[next];
    byId('account-switch-mode').textContent = next === 'signin' ? 'Crear una cuenta' : 'Ya tengo cuenta';
    byId('account-switch-mode').hidden = next === 'recovery';
    byId('account-forgot').hidden = next !== 'signin';
    feedback('');
  }
  byId('btn-account').addEventListener('click', () => { emit(); dialog.showModal(); checkService(); });
  byId('account-check-service')?.addEventListener('click', checkService);
  byId('account-close').addEventListener('click', () => dialog.close());
  byId('account-switch-mode').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
  byId('account-forgot').addEventListener('click', () => setMode('reset'));
  byId('account-sync-now').addEventListener('click', sync);
  byId('account-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || authBusy) return;
    const button = byId('account-submit');
    authBusy = true;
    button.disabled = true;
    feedback('Conectando…');
    const email = byId('account-email').value.trim();
    const password = byId('account-password').value;
    // Callbacks stay on this origin, including local previews. Configure these
    // exact origins in Supabase Auth before publishing.
    const redirectTo = new URL('./', location.href).href;
    try {
      let result;
      if (mode === 'signup') result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      else if (mode === 'reset') result = await client.auth.resetPasswordForEmail(email, { redirectTo });
      else if (mode === 'recovery') result = await client.auth.updateUser({ password });
      else result = await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      byId('account-password').value = '';
      if (mode === 'signup' && !result.data.session) feedback('Revisa tu correo y confirma tu cuenta con el enlace. Después podrás entrar con tu correo y contraseña.');
      else if (mode === 'reset') feedback('Si existe una cuenta con ese correo, recibirás un enlace para recuperar el acceso.');
      else if (mode === 'recovery') { recovering = false; setMode('signin'); emit(); feedback('Contraseña actualizada.'); }
      else feedback('Sesión iniciada. Sincronizando tu progreso…');
    } catch (error) { feedback(readableError(error), true); }
    finally { authBusy = false; render(); }
  });
  byId('account-signout').addEventListener('click', async () => {
    if (!client) return;
    try {
      await sync();
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      feedback('Sesión cerrada en este navegador.');
    } catch (error) { feedback(readableError(error), true); }
  });
  byId('account-export').addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'cinematic-progreso.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { feedback('No se pudo exportar la copia. ' + error.message, true); }
  });
  window.CinematicCloud = {
    has(course, lesson) { return completedKeys.has(window.CinematicProgress.pair(course, lesson)); },
    setCatalog(communities) { try { store?.setCatalog(communities); emit(); } catch (error) { storageError = error; renderError(); } },
    toggle(course, lesson) {
      if (storageError || !store) return { ok: false, message: 'No se pudo guardar. Revisa el almacenamiento del navegador.' };
      try {
        const completed = !store.isCompleted(course, lesson);
        store.setCompleted(course, lesson, completed);
        sync();
        return { ok: true, completed, message: session ? 'Cambio guardado aquí; sincronizando…' : 'Guardado en este navegador. Inicia sesión para sincronizarlo.' };
      } catch (error) { storageError = error; renderError(); return { ok: false, message: 'No se pudo guardar el cambio. No cierres esta página.' }; }
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
  window.addEventListener('storage', event => {
    if (event.key === null || event.key.startsWith(window.CinematicProgress.PREFIX)) { emit(); if (event.key?.includes(':op:')) sync(); }
  });
  window.addEventListener('online', sync);
  window.addEventListener('offline', () => { state = session ? 'error' : 'local'; message = 'Sin conexión. El progreso nuevo se conserva en este navegador.'; emit(); });
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden) sync(); }, 60000);
  if (config.url && config.publishableKey && window.createCinematicCloudClient && !storageError) {
    client = window.createCinematicCloudClient(config.url, config.publishableKey);
    client.auth.onAuthStateChange((event, nextSession) => {
      // Do not await Supabase work inside this callback (the SDK holds a lock).
      setTimeout(() => {
        const changed = session?.user?.id !== nextSession?.user?.id;
        session = nextSession;
        if (changed) generation++;
        try { store.setAccount(session?.user?.id); } catch (error) { storageError = error; }
        if (event === 'PASSWORD_RECOVERY') { recovering = true; setMode('recovery'); dialog.showModal(); }
        state = session ? 'syncing' : 'local'; message = ''; emit(); sync();
      }, 0);
    });
  }
  setMode('signin'); emit();
})();
