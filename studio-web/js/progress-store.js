/* Durable, account-scoped progress. Each pending change has its own storage key:
 * tabs never replace a shared array. The server arbitrates same-lesson conflicts. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CinematicProgress = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PREFIX = 'cinematic_progress_v3:';
  const LEGACY = 'cinematic_lms_completed_lessons';
  const pair = (course, lesson) => JSON.stringify([String(course), String(lesson)]);

  class ProgressStore {
    constructor({ storage, uuid, now = Date.now, onChange = () => {} }) {
      this.storage = storage;
      this.uuid = uuid;
      this.now = now;
      this.onChange = onChange;
      this.scope = 'guest';
      this.userId = null;
      this.catalog = [];
      this.lastTime = 0;
      this.error = null;
    }
    read(key, fallback = null) {
      const raw = this.storage.getItem(key);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); }
      catch (_) { throw new Error('Hay datos locales dañados. No se han sobrescrito.'); }
    }
    entries(prefix) {
      const keys = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      return keys.map(key => [key, this.read(key)]);
    }
    prefix(type, scope = this.scope) { return `${PREFIX}${scope}:${type}:`; }
    record(course, lesson, scope = this.scope) {
      return this.read(this.prefix('record', scope) + pair(course, lesson));
    }
    pending(scope = this.scope) {
      return this.entries(this.prefix('op', scope)).map(([key, value]) => ({ ...value, storageKey: key }))
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    }
    completedKeys() {
      const result = new Set();
      for (const [, row] of this.entries(this.prefix('record'))) {
        if (row.completed) result.add(pair(row.course_id, row.lesson_id));
      }
      for (const op of this.pending()) {
        const key = pair(op.course, op.lesson);
        if (op.completed) result.add(key); else result.delete(key);
      }
      return result;
    }
    isCompleted(course, lesson) {
      const pending = this.pending().filter(op => op.course === String(course) && op.lesson === String(lesson));
      return pending.length ? pending[pending.length - 1].completed : !!this.record(course, lesson)?.completed;
    }
    setAccount(userId) {
      this.userId = userId || null;
      this.scope = userId ? `user:${userId}` : 'guest';
      this.onChange();
    }
    setCatalog(communities) {
      this.catalog = communities.flatMap(c => (c.courses || []).flatMap(course =>
        (course.modules || []).flatMap(m => (m.lessons || []).map(l => ({ course: String(course.id), lesson: String(l.id) })))));
      // Keep the old key untouched as a backup. Never reimport a lesson with a
      // v3 record (including an explicit incomplete record).
      const legacy = this.read(LEGACY, []);
      if (!Array.isArray(legacy)) throw new Error('El progreso antiguo no tiene el formato esperado.');
      const ids = new Set(legacy.map(String));
      if (this.read(PREFIX + 'guest-owner')) return;
      for (const { course, lesson } of this.catalog) {
        if (ids.has(lesson) && !this.record(course, lesson, 'guest')) {
          this.storage.setItem(this.prefix('record', 'guest') + pair(course, lesson), JSON.stringify({ course_id: course, lesson_id: lesson, completed: true, version: 0 }));
        }
      }
    }
    setCompleted(course, lesson, completed, kind = 'edit') {
      course = String(course); lesson = String(lesson);
      const baseVersion = this.record(course, lesson)?.version || 0;
      if (!this.userId) {
        this.storage.setItem(this.prefix('record') + pair(course, lesson), JSON.stringify({ course_id: course, lesson_id: lesson, completed: !!completed, version: 0 }));
      } else {
        const newestPending = this.pending().reduce((latest, op) => Math.max(latest, op.createdAt), 0);
        this.lastTime = Math.max(this.now(), this.lastTime + 1, newestPending + 1);
        const op = { id: this.uuid(), course, lesson, completed: !!completed, baseVersion, createdAt: this.lastTime, kind };
        this.storage.setItem(this.prefix('op') + op.id, JSON.stringify(op));
      }
      this.onChange();
    }
    importGuest() {
      if (!this.userId) return;
      const ownerKey = PREFIX + 'guest-owner';
      const owner = this.read(ownerKey);
      if (owner && owner !== this.userId) return;
      // Bind the import to one account before sending any changes. Another
      // account on a shared browser must never inherit this user's history.
      this.storage.setItem(ownerKey, JSON.stringify(this.userId));
      const existing = new Set(this.pending().map(op => pair(op.course, op.lesson)));
      for (const [, record] of this.entries(this.prefix('record', 'guest'))) {
        const { course_id: course, lesson_id: lesson } = record;
        if (record.completed && !this.record(course, lesson) && !existing.has(pair(course, lesson))) {
          this.setCompleted(course, lesson, true, 'import');
        }
      }
    }
    merge(rows, scope = this.scope) {
      for (const row of rows) {
        const current = this.record(row.course_id, row.lesson_id, scope);
        if (!current || Number(row.version) >= Number(current.version)) {
          this.storage.setItem(this.prefix('record', scope) + pair(row.course_id, row.lesson_id), JSON.stringify(row));
        }
      }
      this.onChange();
    }
    async sync(remote, isCurrent = () => true) {
      if (!this.userId) return { conflicts: 0 };
      const scope = this.scope;
      const userId = this.userId;
      const current = () => isCurrent() && this.scope === scope && this.userId === userId;
      const rows = await remote.list(userId);
      if (!current()) return { conflicts: 0 };
      this.merge(rows, scope);
      this.importGuest();
      let conflicts = 0;
      // A bounded snapshot leaves newer clicks pending for the next pass.
      const groups = new Map();
      for (const op of this.pending(scope)) {
        const key = pair(op.course, op.lesson);
        groups.set(key, [...(groups.get(key) || []), op]);
      }
      for (const group of groups.values()) {
        if (!current()) break;
        const op = group[group.length - 1];
        const result = await remote.write(userId, op);
        if (!current()) break;
        if (!result || !result.row) throw new Error('El servidor no confirmó el guardado.');
        this.merge([result.row], scope);
        if (!result.applied && op.kind !== 'import') conflicts++;
        // Rebase only clicks made while our successful request was in flight.
        // A rejected stale offline edit is never allowed to undo a newer edit.
        const sent = new Set(group.map(item => item.id));
        if (result.applied) {
          for (const newer of this.pending(scope)) {
            if (newer.course === op.course && newer.lesson === op.lesson && !sent.has(newer.id) && newer.baseVersion === op.baseVersion) {
              const { storageKey, ...value } = newer;
              this.storage.setItem(storageKey, JSON.stringify({ ...value, baseVersion: result.row.version }));
            }
          }
        }
        for (const item of group) this.storage.removeItem(item.storageKey);
        this.onChange();
      }
      return { conflicts };
    }
    exportData() {
      return { format: 'cinematic-progress-backup', version: 3, exportedAt: new Date(this.now()).toISOString(),
        records: this.entries(this.prefix('record')).map(([, row]) => row),
        pending: this.pending().map(({ storageKey, ...op }) => op), legacy: this.read(LEGACY, []) };
    }
  }
  return { ProgressStore, PREFIX, LEGACY, pair };
});
