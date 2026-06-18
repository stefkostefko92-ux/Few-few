import { randomBytes } from 'node:crypto';
import db from './db.js';

// Relying Party конфигурация спрямо публичния адрес.
export function rp(req) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const url = new URL(base);
  return { rpName: 'MedQR', rpID: url.hostname, origin: url.origin };
}

// ---- Временни предизвикателства (challenge) ----
const CHALLENGE_TTL_MS = 1000 * 60 * 5;

export function saveChallenge(userId, challenge) {
  const id = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO webauthn_challenges (id, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)'
  ).run(id, userId ?? null, challenge, expiresAt);
  return id;
}

export function takeChallenge(id) {
  if (!id) return null;
  const row = db
    .prepare("SELECT * FROM webauthn_challenges WHERE id = ? AND expires_at > datetime('now')")
    .get(id);
  db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(id);
  return row || null;
}

// ---- Удостоверения (credentials) ----
export function listCredentials(userId) {
  return db
    .prepare('SELECT id, credential_id, label, transports, created_at FROM webauthn_credentials WHERE user_id = ? ORDER BY id')
    .all(userId);
}

export function getCredentialsForUser(userId) {
  return db.prepare('SELECT * FROM webauthn_credentials WHERE user_id = ?').all(userId);
}

export function findCredential(credentialId) {
  return db.prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?').get(credentialId);
}

export function saveCredential(userId, { id, publicKey, counter, transports }, label) {
  db.prepare(
    `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, label)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    id,
    Buffer.from(publicKey).toString('base64'),
    counter || 0,
    JSON.stringify(transports || []),
    label || 'Паскей'
  );
}

export function updateCounter(credentialId, counter) {
  db.prepare('UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?').run(
    counter,
    credentialId
  );
}

export function deleteCredential(userId, id) {
  db.prepare('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?').run(id, userId);
}
