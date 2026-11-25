// Миграцията на СТАРА база (src/db.js) — пътят, по който минава продукционната база при всеки старт.
// Smoke тестът вижда само свежа база, където колоните идват от CREATE TABLE; тук базата е от преди
// колоните за тема, корица, модерация, AI съгласие и админ. Пази privacy-by-default на съществуващите
// профили (ai_discoverable = 0, hidden_by_admin = 0, is_admin = 0) и това, че повторен старт не чупи.
// (Изпитателя, класиране по риск 21.11.2026 — V3.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const DB_MODULE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db.js');

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✘ ${name}\n  ${err.message}`);
  }
}

// Старата схема: users без is_admin, profiles без колоните, добавени по-късно с ALTER.
const OLD_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'personal',
    display_name TEXT NOT NULL,
    headline TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    facebook TEXT NOT NULL DEFAULT '',
    instagram TEXT NOT NULL DEFAULT '',
    linkedin TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '',
    is_public INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const NEW_PROFILE_COLS = {
  theme: 'blue',
  views: 0,
  accent: '',
  avatar_shape: 'circle',
  font: 'system',
  cover: '',
  hidden_by_admin: 0,
  ai_discoverable: 0,
  ai_consent_at: null,
};

/** Нова папка с база по старата схема; `extra` — SQL, изпълнен след нея (частична миграция). */
function oldDataDir(extra = '') {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-mig-'));
  const db = new Database(join(dir, 'vizitka.db'));
  db.exec(OLD_SCHEMA + extra);
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (1, 'a@b.bg', 'x')").run();
  db.prepare(
    "INSERT INTO profiles (id, user_id, slug, display_name, is_public) VALUES (1, 1, 'ivan', 'Иван', 1)"
  ).run();
  const now = Date.now();
  db.prepare("INSERT INTO sessions VALUES ('old', 1, 'c', ?, datetime('now'))").run(now - 1000);
  db.prepare("INSERT INTO sessions VALUES ('new', 1, 'c', ?, datetime('now'))").run(
    now + 3_600_000
  );
  db.close();
  return dir;
}

/** Стартира src/db.js в дъщерен процес (модулът е singleton) — както при рестарт на услугата. */
function boot(dir, code = '') {
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(DB_MODULE)}); ${code}; m.default.close();`,
    ],
    { env: { ...process.env, DATA_DIR: dir, NODE_ENV: 'test' }, encoding: 'utf8' }
  );
  assert.equal(r.status, 0, `src/db.js не стартира върху старата база:\n${r.stderr}`);
}

const cols = (db, table) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

await test('стара база: всички нови колони се добавят', () => {
  const dir = oldDataDir();
  boot(dir);
  const db = new Database(join(dir, 'vizitka.db'), { readonly: true });
  const p = cols(db, 'profiles');
  for (const c of Object.keys(NEW_PROFILE_COLS)) assert.ok(p.includes(c), `липсва profiles.${c}`);
  assert.ok(cols(db, 'users').includes('is_admin'), 'липсва users.is_admin');
  db.close();
});

await test('съществуващият профил получава безопасните стойности (AI и админ — изключени)', () => {
  const dir = oldDataDir();
  boot(dir);
  const db = new Database(join(dir, 'vizitka.db'), { readonly: true });
  const row = db.prepare('SELECT * FROM profiles WHERE id = 1').get();
  for (const [c, v] of Object.entries(NEW_PROFILE_COLS)) assert.equal(row[c], v, `profiles.${c}`);
  assert.equal(row.is_public, 1, 'публичността не се пипа');
  assert.equal(db.prepare('SELECT is_admin FROM users WHERE id = 1').get().is_admin, 0);
  db.close();
});

await test('повторен старт: без грешка и без промяна на данните', () => {
  const dir = oldDataDir();
  boot(dir);
  const db1 = new Database(join(dir, 'vizitka.db'), { readonly: true });
  const before = JSON.stringify(db1.prepare('SELECT * FROM profiles').all());
  db1.close();
  boot(dir);
  const db2 = new Database(join(dir, 'vizitka.db'), { readonly: true });
  assert.equal(JSON.stringify(db2.prepare('SELECT * FROM profiles').all()), before);
  db2.close();
});

await test('частично мигрирана база (има theme, няма cover): добавя само липсващото', () => {
  const dir = oldDataDir("ALTER TABLE profiles ADD COLUMN theme TEXT NOT NULL DEFAULT 'red';");
  boot(dir);
  const db = new Database(join(dir, 'vizitka.db'), { readonly: true });
  const row = db.prepare('SELECT theme, cover FROM profiles WHERE id = 1').get();
  assert.equal(row.theme, 'red', 'съществуващата колона не се пипа');
  assert.equal(row.cover, '');
  db.close();
});

await test('purgeExpiredSessions маха изтеклите и пази бъдещите', () => {
  const dir = oldDataDir();
  boot(dir, 'm.purgeExpiredSessions()');
  const db = new Database(join(dir, 'vizitka.db'), { readonly: true });
  const ids = db
    .prepare('SELECT id FROM sessions ORDER BY id')
    .all()
    .map((r) => r.id);
  assert.deepEqual(ids, ['new']);
  db.close();
});

await test('индексите съществуват след миграцията', () => {
  const dir = oldDataDir();
  boot(dir);
  const db = new Database(join(dir, 'vizitka.db'), { readonly: true });
  const idx = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all()
    .map((r) => r.name);
  for (const n of ['idx_links_profile', 'idx_pass_reg_serial', 'idx_sessions_user'])
    assert.ok(idx.includes(n), `липсва индекс ${n}`);
  db.close();
});

if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nМиграцията на старата база: всички тестове минаха.');
