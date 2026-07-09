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
    allergy_keys             TEXT,
    chronic_conditions       TEXT,
    condition_keys           TEXT,
    current_medications      TEXT,
    hearing_status           TEXT,
    communication_pref       TEXT,
    can_speak                TEXT,
    sign_language            TEXT,
    interpreter_contact      TEXT,
    preferred_language       TEXT,
    emergency_contact_name   TEXT,
    emergency_contact_phone  TEXT,
    emergency_contact_relation TEXT,
    emergency_contact_country TEXT,
    emergency_contact_email  TEXT,
    notify_on_scan           INTEGER NOT NULL DEFAULT 0,
    last_notified_at         TEXT,
    last_sos_at              TEXT,
    last_located_at          TEXT,
    additional_notes         TEXT,
    pin_hash                 TEXT,
    pin_attempts             INTEGER NOT NULL DEFAULT 0,
    pin_locked_until         TEXT,
    updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen  TEXT NOT NULL DEFAULT (datetime('now')),
    ip         TEXT,
    user_agent TEXT,
    long_lived INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL
  );

  -- Еднократни резервни кодове за 2FA (пазят се само като хеш).
  CREATE TABLE IF NOT EXISTS recovery_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    used_at    TEXT
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
  -- Tamper-evident: всеки запис носи hash на (предишен hash + съдържание).
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    event      TEXT NOT NULL,
    detail     TEXT,
    ip         TEXT,
    at         TEXT NOT NULL DEFAULT (datetime('now')),
    prev_hash  TEXT,
    hash       TEXT
  );

  -- WebAuthn / passkeys удостоверения.
  CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key    TEXT NOT NULL,
    counter       INTEGER NOT NULL DEFAULT 0,
    transports    TEXT,
    label         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Временни WebAuthn предизвикателства (challenge) по време на ceremony.
  CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER,
    challenge  TEXT NOT NULL,
    expires_at TEXT NOT NULL
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
ensureColumn('profiles', 'can_speak', 'TEXT');
ensureColumn('profiles', 'sign_language', 'TEXT');
ensureColumn('profiles', 'interpreter_contact', 'TEXT');
ensureColumn('profiles', 'allergy_keys', 'TEXT');
ensureColumn('profiles', 'condition_keys', 'TEXT');
ensureColumn('profiles', 'emergency_contact_country', 'TEXT');
ensureColumn('profiles', 'emergency_contact_email', 'TEXT');
ensureColumn('profiles', 'notify_on_scan', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('profiles', 'last_notified_at', 'TEXT');
ensureColumn('profiles', 'last_sos_at', 'TEXT');
ensureColumn('profiles', 'last_located_at', 'TEXT');
ensureColumn('profiles', 'pin_attempts', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('profiles', 'pin_locked_until', 'TEXT');
ensureColumn('sessions', 'last_seen', 'TEXT');
ensureColumn('sessions', 'long_lived', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('sessions', 'ip', 'TEXT');
ensureColumn('sessions', 'user_agent', 'TEXT');
ensureColumn('audit_log', 'prev_hash', 'TEXT');
ensureColumn('audit_log', 'hash', 'TEXT');

export default db;
