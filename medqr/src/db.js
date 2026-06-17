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
// затова: чувствителните полета се криптират в покой (виж crypto.js), всеки достъп
// и важно действие се записва в одит, а спешният достъп е чрез непредвидим токен.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    email_verified  INTEGER NOT NULL DEFAULT 0,
    consent_at      TEXT,
    consent_version TEXT,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    totp_secret     TEXT,
    totp_enabled    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Еднократни токени за потвърждение на имейл и нулиране на парола.
  -- Пази се само SHA-256 хеш на токена; суровият токен е само в имейл линка.
  CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

  -- Временно състояние между паролата и 2FA кода при вход.
  CREATE TABLE IF NOT EXISTS pending_logins (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip          TEXT,
    user_agent  TEXT
  );

  -- Одит на действия по сигурността (вход, изход, промени, изтриване и т.н.).
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    event      TEXT NOT NULL,
    detail     TEXT,
    ip         TEXT,
    at         TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Лека миграция: добавя липсващи колони към съществуващи бази (idempotent).
function ensureColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}
ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');

export default db;
