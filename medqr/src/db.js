import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || join(dataDir, 'medqr.sqlite');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Схема. Медицинските данни са специална категория лични данни по GDPR (чл. 9),
// затова: одит на всеки достъп, токени за спешен достъп вместо публични идентификатори,
// и минимизиране на това, което се показва без автентикация.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                  INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    emergency_token          TEXT UNIQUE NOT NULL,
    full_name                TEXT NOT NULL,
    date_of_birth            TEXT,
    blood_type               TEXT,
    allergies                TEXT,
    chronic_conditions       TEXT,
    current_medications      TEXT,
    hearing_status           TEXT,
    communication_pref       TEXT,
    preferred_language       TEXT,
    emergency_contact_name   TEXT,
    emergency_contact_phone  TEXT,
    emergency_contact_relation TEXT,
    additional_notes         TEXT,
    pin_hash                 TEXT,
    updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip          TEXT,
    user_agent  TEXT
  );
`);

export default db;
