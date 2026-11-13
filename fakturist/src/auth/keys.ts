import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * Ключовете — изведени (HKDF-SHA256, отделен етикет за всяко предназначение) от LEDGER_SEAL_KEY: тайната
 * на сървъра, която по правило НЕ се сменя и е в бекъпа на тайните. Затова шифрованите 2FA тайни и
 * печатите на документите преживяват рестарт и смяна на JWT_SECRET. Изведените ключове са независими —
 * познат един не издава другите. Нов етикет (`…-v2`) = нов ключ.
 */
const SALT = 'fakturist';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const cache = new Map<string, Buffer>();

function derived(info: string): Buffer {
  let key = cache.get(info);
  if (!key) {
    const ikm = Buffer.from(config().LEDGER_SEAL_KEY, 'hex');
    key = Buffer.from(hkdfSync('sha256', ikm, SALT, info, 32));
    cache.set(info, key);
  }
  return key;
}

/**
 * `aad` вързва шифрования запис с притежателя му (userId): запис от един акаунт не се дешифрира в
 * друг — чернова на 2FA не може да се пренесе в чужда сесия.
 */
function encrypt(info: string, plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', derived(info), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Подправен или повреден запис хвърля (GCM проверява етикета). */
function decrypt(info: string, payload: string, aad: string): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('Повреден шифрован запис');
  const decipher = createDecipheriv('aes-256-gcm', derived(info), raw.subarray(0, IV_BYTES), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}

/** TOTP тайната в базата: AES-256-GCM (IV 12 байта, етикет 16), base64, вързана с userId. */
export const encryptTotpSecret = (plaintext: string, userId: string): string =>
  encrypt('totp-secret-v2', plaintext, userId);
export const decryptTotpSecret = (payload: string, userId: string): string =>
  decrypt('totp-secret-v2', payload, userId);

/** Започнатата настройка на 2FA (скрито поле на формата) — свой ключ и вързана с userId. */
export const encryptTotpDraft = (plaintext: string, userId: string): string =>
  encrypt('totp-draft-v1', plaintext, userId);
export function decryptTotpDraft(payload: string, userId: string): string | null {
  try {
    return decrypt('totp-draft-v1', payload, userId);
  } catch {
    return null;
  }
}

/** Тайните на интеграциите (src/admin/integrations.ts) — вързани с кода: SMTP ключ не става Revolut ключ. */
export const encryptIntegrationSecrets = (plaintext: string, code: string): string =>
  encrypt('integration-secrets-v1', plaintext, `integration:${code}`);
export const decryptIntegrationSecrets = (payload: string, code: string): string =>
  decrypt('integration-secrets-v1', payload, `integration:${code}`);

/**
 * Токенът на поканата за прехвърляне, докато чака в опашката с писма. В TransferInvite е само хешът му;
 * тук е шифрован и вързан с id на поканата.
 */
export const encryptInviteToken = (token: string, inviteId: string): string =>
  encrypt('transfer-token-v1', token, `invite:${inviteId}`);
export const decryptInviteToken = (payload: string, inviteId: string): string =>
  decrypt('transfer-token-v1', payload, `invite:${inviteId}`);

/** Печатът на веригата на документите (src/ledger/chain.ts). */
export function sealHmac(content: string): string {
  return createHmac('sha256', derived('document-seal-v1')).update(content, 'utf8').digest('hex');
}

/** Печатът на веригата на одита (src/audit.ts). */
export function auditHmac(content: string): string {
  return createHmac('sha256', derived('audit-seal-v1')).update(content, 'utf8').digest('hex');
}

/**
 * Токенът на връзка по имейл (нова парола, потвърждение на имейла), докато чака в опашката с писма.
 * В UserToken е само хешът му; тук е шифрован и вързан с id-то на реда.
 */
export const encryptUserToken = (token: string, tokenId: string): string =>
  encrypt('user-token-v1', token, `user-token:${tokenId}`);
export const decryptUserToken = (payload: string, tokenId: string): string =>
  decrypt('user-token-v1', payload, `user-token:${tokenId}`);

/** Токенът на покана за член на фирмата, докато чака в опашката с писма (SPEC 45). */
export const encryptMemberInviteToken = (token: string, inviteId: string): string =>
  encrypt('member-invite-token-v1', token, `member-invite:${inviteId}`);
export const decryptMemberInviteToken = (payload: string, inviteId: string): string =>
  decrypt('member-invite-token-v1', payload, `member-invite:${inviteId}`);
