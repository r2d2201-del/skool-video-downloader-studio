const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const catalog = [{ courses: [{ id: 'course', modules: [{ lessons: [{ id: 'a' }, { id: 'b' }] }] }] }];
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(predicate) { for (let n = 0; n < 200; n++) { if (predicate()) return; await tick(); } assert.fail('State did not settle'); }
function backend() {
  const rows = new Map();
  return {
    rows, offline: false, writes: [],
    async fetch(url, options = {}) {
      if (this.offline) throw new TypeError('Failed to fetch');
      const user = options.headers.Authorization.replace('Bearer token-', '');
      const parsed = new URL(url);
      let data;
      if (options.method === 'POST') {
        const op = JSON.parse(options.body), key = JSON.stringify([user, op.p_course, op.p_lesson]);
        this.writes.push({ user, op });
        const old = rows.get(key);
        if (old && (op.p_import || old.version !== op.p_version)) data = { applied: old.mutation_id === op.p_mutation, row: old };
        else {
          const row = { course_id: op.p_course, lesson_id: op.p_lesson, completed: op.p_completed, version: (old?.version || 0) + 1, mutation_id: op.p_mutation };
          rows.set(key, row); data = { applied: true, row };
        }
      } else data = [...rows.entries()].filter(([key]) => JSON.parse(key)[0] === user).map(([, row]) => row).slice(Number(parsed.searchParams.get('offset')), Number(parsed.searchParams.get('offset')) + 500);
      return { ok: true, json: async () => structuredClone(data) };
    }
  };
}
function page(t, remote, { cached = {}, configured = true } = {}) {
  const dom = new JSDOM(html, { url: 'https://courses.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  for (const [key, value] of Object.entries(cached)) w.localStorage.setItem(key, value);
  w.AbortController = AbortController;
  w.fetch = remote.fetch.bind(remote);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  let session = null, callback;
  const auth = {
    onAuthStateChange(cb) { callback = cb; cb('INITIAL_SESSION', null); },
    async getSession() { return { data: { session } }; },
    async signInWithPassword({ email }) { session = { user: { id: email, email }, access_token: 'token-' + email }; callback('SIGNED_IN', session); return { data: { session } }; },
    async signOut() { session = null; callback('SIGNED_OUT', null); return {}; }
  };
  w.CINEMATIC_CLOUD_CONFIG = configured ? { url: 'https://cloud.test', publishableKey: 'sb_publishable_test' } : {};
  w.createCinematicCloudClient = () => ({ auth });
  for (const file of ['js/progress-store.js', 'js/cloud-progress.js']) w.eval(fs.readFileSync(file, 'utf8'));
  w.CinematicCloud.setCatalog(catalog);
  return { w, auth, status: () => w.document.getElementById('progress-sync-status').textContent,
    async login(email = 'one@example.test') {
      w.document.getElementById('account-email').value = email;
      w.document.getElementById('account-password').value = 'local-test-only';
      w.document.getElementById('account-auth-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await until(() => this.status() === 'Guardado en la nube');
    }
  };
}
test('account form migrates old marks and another device receives them', async t => {
  const remote = backend();
  const a = page(t, remote, { cached: { cinematic_lms_completed_lessons: '["a"]' } });
  assert.equal(a.w.CinematicCloud.has('course', 'a'), true);
  await a.login();
  assert.equal(remote.rows.size, 1);
  const b = page(t, remote); await b.login();
  assert.equal(b.w.CinematicCloud.has('course', 'a'), true);
  b.w.CinematicCloud.toggle('course', 'a');
  await until(() => b.status() === 'Guardado en la nube');
  a.w.dispatchEvent(new a.w.Event('focus'));
  await until(() => !a.w.CinematicCloud.has('course', 'a'));
  assert.equal(a.status(), 'Guardado en la nube');
});
test('a failed cloud request stays pending and reconnecting retries it', async t => {
  const remote = backend(), a = page(t, remote); await a.login();
  remote.offline = true;
  a.w.CinematicCloud.toggle('course', 'a');
  await until(() => a.w.document.getElementById('progress-sync-status').dataset.state === 'error');
  assert.match(a.status(), /Pendiente/);
  assert.equal(a.w.CinematicCloud.has('course', 'a'), true);
  const cached = Object.fromEntries(Object.keys(a.w.localStorage).map(key => [key, a.w.localStorage.getItem(key)]));
  remote.offline = false;
  const b = page(t, remote, { cached }); await b.login();
  assert.equal(b.w.CinematicCloud.has('course', 'a'), true);
  assert.equal(remote.rows.size, 1);
});
test('missing cloud configuration leaves local marking operational and login disabled', t => {
  const a = page(t, backend(), { configured: false });
  assert.equal(a.w.document.getElementById('account-submit').disabled, true);
  assert.equal(a.w.CinematicCloud.toggle('course', 'a').ok, true);
  assert.equal(a.w.CinematicCloud.has('course', 'a'), true);
  assert.match(a.status(), /Solo en este navegador/);
});
test('bundled sanitization removes executable notes while retaining links and formatting', t => {
  const dom = new JSDOM('', { runScripts: 'outside-only', url: 'https://courses.test' });
  t.after(() => dom.window.close());
  dom.window.eval(fs.readFileSync('js/supabase-client.js', 'utf8'));
  const safe = dom.window.CinematicSanitize('<h2>Notas</h2><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">peligro</a><a href="https://example.com" target="_blank" rel="noopener">recurso</a>');
  assert.doesNotMatch(safe, /onerror|javascript:/);
  assert.match(safe, /<h2>Notas<\/h2>/);
  assert.match(safe, /https:\/\/example.com/);
});
