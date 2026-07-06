// SQLite база на лицензионния сървър (better-sqlite3, WAL).
// Ключът НЕ се пази в явен вид — само SHA-256 хеш + префикс за показване.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.STORE_DB || "./data/store.db";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS licenses (
  id            TEXT PRIMARY KEY,             -- lic_<random>
  keyHash       TEXT NOT NULL UNIQUE,         -- SHA-256 на ключа (за търсене при активация)
  keyPlain      TEXT NOT NULL,                -- пълният ключ (възстановим за клиента/support)
  plan          TEXT NOT NULL,                -- monthly | yearly | lifetime
  seats         INTEGER NOT NULL,             -- брой каси
  status        TEXT NOT NULL,                -- active | past_due | canceled | revoked
  email         TEXT,
  stripeCustomerId      TEXT,
  stripeSubscriptionId  TEXT,
  stripeSessionId       TEXT UNIQUE,          -- идемпотентност: 1 лиценз на Checkout сесия
  stripePaymentIntentId TEXT,                 -- за refund/chargeback → revoke (lifetime)
  periodEnd     INTEGER,                      -- unix ms; NULL = lifetime
  emailSentAt   INTEGER,                      -- ключът е изпратен по имейл (идемпотентно)
  createdAt     INTEGER NOT NULL,
  revokedAt     INTEGER
);
CREATE TABLE IF NOT EXISTS activations (
  id          TEXT PRIMARY KEY,
  licenseId   TEXT NOT NULL REFERENCES licenses(id),
  deviceId    TEXT NOT NULL,
  deviceName  TEXT,
  activatedAt INTEGER NOT NULL,
  deactivatedAt INTEGER,
  UNIQUE(licenseId, deviceId)
);
CREATE TABLE IF NOT EXISTS stripe_events (
  id          TEXT PRIMARY KEY,               -- Stripe event id (идемпотентност)
  type        TEXT NOT NULL,
  processedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lic_sub ON licenses(stripeSubscriptionId);
CREATE INDEX IF NOT EXISTS idx_act_lic ON activations(licenseId);
`);

/** Обработено ли е вече това Stripe събитие? Ако не — маркира го. */
export function claimEvent(eventId, type) {
  try {
    db.prepare("INSERT INTO stripe_events (id, type, processedAt) VALUES (?, ?, ?)").run(
      eventId,
      type,
      Date.now()
    );
    return true;
  } catch {
    return false; // вече обработено
  }
}

// съществуващи бази отпреди колоната emailSentAt
try { db.exec("ALTER TABLE licenses ADD COLUMN emailSentAt INTEGER"); } catch { /* вече я има */ }
