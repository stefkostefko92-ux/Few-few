import { decryptSecret, encryptSecret } from '../auth/crypto.js';

/**
 * Токенът за отписване: отпечатъците (HMAC-SHA256, по 32 байта) на стойността, шифровани с AES-256-GCM
 * (LOVETS_UNSUB_KEY). Без база: връзката работи, докато има ключ, а адресът не е в URL-а. Случаен iv →
 * всяко писмо има свой токен. Подправен, отрязан или с чужд ключ → null (общ 404 навън).
 */
const FP_BYTES = 32;
const TOKEN_RX = /^[A-Za-z0-9_-]{10,40}\.[A-Za-z0-9_-]{16,40}\.[A-Za-z0-9_-]{10,500}$/;

export function makeUnsubToken(fingerprints: string[], keyBase64: string): string {
  if (!fingerprints.length || fingerprints.some((f) => !/^[0-9a-f]{64}$/.test(f))) {
    throw new Error('невалиден отпечатък');
  }
  const packed = Buffer.concat(fingerprints.map((f) => Buffer.from(f, 'hex'))).toString(
    'base64url',
  );
  return encryptSecret(packed, keyBase64);
}

export function readUnsubToken(token: string, keyBase64: string): string[] | null {
  if (!TOKEN_RX.test(token)) return null;
  try {
    const raw = Buffer.from(decryptSecret(token, keyBase64), 'base64url');
    if (!raw.length || raw.length % FP_BYTES !== 0) return null;
    const out: string[] = [];
    for (let i = 0; i < raw.length; i += FP_BYTES)
      out.push(raw.subarray(i, i + FP_BYTES).toString('hex'));
    return out;
  } catch {
    return null;
  }
}
