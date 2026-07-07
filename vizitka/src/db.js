// SQLite база (better-sqlite3, WAL) — схема и миграции.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { join, resolve } from 'node:path';

export const DATA_DIR = resolve(process.env.DATA_DIR || 'data');
export const UPLOADS_DIR = join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'vizitka.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,               -- sha256 на токена от бисквитката
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,       -- unix ms
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'company')),
    display_name TEXT NOT NULL,
    headline TEXT NOT NULL DEFAULT '',   -- длъжност / слоган
    company TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    facebook TEXT NOT NULL DEFAULT '',
    instagram TEXT NOT NULL DEFAULT '',
    linkedin TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '',      -- име на файл в data/uploads
    is_public INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'blue',  -- цветова тема на визитката
    views INTEGER NOT NULL DEFAULT 0,    -- брой преглеждания (без собственика)
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// Леки миграции: добавяне на колони върху съществуваща база (idempotent).
const profileCols = new Set(
  db
    .prepare('PRAGMA table_info(profiles)')
    .all()
    .map((c) => c.name)
);
if (!profileCols.has('theme'))
  db.exec("ALTER TABLE profiles ADD COLUMN theme TEXT NOT NULL DEFAULT 'blue'");
if (!profileCols.has('views'))
  db.exec('ALTER TABLE profiles ADD COLUMN views INTEGER NOT NULL DEFAULT 0');

// Периодично чистене на изтекли сесии.
export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

export default db;
