import db from './db.js';
import { encrypt, decrypt } from './crypto.js';
import { randomToken } from './auth.js';

// Полета, които се криптират в покой. emergency_token (търсене), pin_hash (вече
// хеширан), id/user_id/updated_at остават нешифровани.
export const ENCRYPTED_FIELDS = [
  'full_name',
  'date_of_birth',
  'blood_type',
  'allergies',
  'chronic_conditions',
  'current_medications',
  'hearing_status',
  'communication_pref',
  'can_speak',
  'sign_language',
  'preferred_language',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relation',
  'emergency_contact_email',
  'additional_notes',
];

// Полета, които потребителят може да редактира (без full_name, който е и при регистрация).
export const EDITABLE_FIELDS = ENCRYPTED_FIELDS;

function decryptRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of ENCRYPTED_FIELDS) out[f] = decrypt(row[f]);
  return out;
}

export function createForUser(userId, fullName) {
  db.prepare('INSERT INTO profiles (user_id, emergency_token, full_name) VALUES (?, ?, ?)').run(
    userId,
    randomToken(24),
    encrypt(fullName)
  );
}

export function getByUserId(userId) {
  return decryptRow(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId));
}

export function getByToken(token) {
  return decryptRow(db.prepare('SELECT * FROM profiles WHERE emergency_token = ?').get(token));
}

export function updateFields(profileId, data) {
  const cols = ENCRYPTED_FIELDS.filter((f) => f in data);
  if (cols.length === 0) return;
  const setClause = cols.map((f) => `${f} = ?`).join(', ');
  const values = cols.map((f) => encrypt(String(data[f] ?? '').trim()));
  db.prepare(`UPDATE profiles SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(
    ...values,
    profileId
  );
}

export function rotateToken(profileId) {
  db.prepare('UPDATE profiles SET emergency_token = ? WHERE id = ?').run(
    randomToken(24),
    profileId
  );
}
