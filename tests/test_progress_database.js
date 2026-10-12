const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

test('Postgres schema: revisions, retry, import and account isolation', async t => {
  const db = new PGlite();
  const one = randomUUID(), two = randomUUID();
  t.after(() => db.close());
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema auth, public to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  await db.query('insert into auth.users values ($1), ($2)', [one, two]);
  await db.exec(fs.readFileSync('docs/progress-schema.sql', 'utf8'));
  async function asUser(id) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
    await db.exec('set role authenticated');
  }
  async function change(lesson, completed, version, mutation = randomUUID(), importing = false) {
    const result = await db.query('select public.set_lesson_progress($1,$2,$3,$4,$5,$6) result', ['course', lesson, completed, version, mutation, importing]);
    return result.rows[0].result;
  }
  await asUser(one);
  const id = randomUUID();
  const first = await change('a', true, 0, id);
  assert.equal(first.applied, true);
  assert.equal(first.row.version, 1);
  assert.equal(first.row.user_id, undefined);
  const retry = await change('a', true, 0, id);
  assert.equal(retry.applied, true);
  assert.equal(retry.row.version, 1);
  const unmark = await change('a', false, 1);
  assert.equal(unmark.row.version, 2);
  const stale = await change('a', true, 1);
  assert.equal(stale.applied, false);
  assert.equal(stale.row.completed, false);
  const imported = await change('a', true, 0, randomUUID(), true);
  assert.equal(imported.applied, false);
  assert.equal(imported.row.completed, false);
  await change('b', true, 0);
  assert.equal((await db.query('select * from public.lesson_progress')).rows.length, 2);

  await asUser(two);
  assert.equal((await db.query('select * from public.lesson_progress')).rows.length, 0);
  assert.equal((await db.query('update public.lesson_progress set completed=true where user_id=$1 returning *', [one])).rows.length, 0);
  await assert.rejects(db.query('insert into public.lesson_progress(user_id,course_id,lesson_id,completed,mutation_id) values($1,$2,$3,true,$4)', [one, 'course', 'intrusion', randomUUID()]), /row-level security/);
  await change('a', true, 0);
  await assert.rejects(db.query('update public.lesson_progress set user_id=$1', [one]), /row-level security/);
  await assert.rejects(db.query('delete from public.lesson_progress'), /permission denied/);
  await assert.rejects(change('', true, 0), /Invalid progress/);
  await asUser(null);
  await assert.rejects(change('a', true, 0), /Authentication required/);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from public.lesson_progress'), /permission denied/);
  await assert.rejects(change('a', true, 0), /permission denied/);
});
