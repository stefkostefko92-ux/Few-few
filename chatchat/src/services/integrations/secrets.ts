import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Тайните на конекторите (API токени, HMAC ключове) в покой: AES-256-GCM с INTEGRATION_KEK —
 * отделен ключ от MFA_ENC_KEY и FILES_KEK. Записът е `v1.<id на ключа>.<base64(iv | tag | шифър)>`;
 * AAD-ът връзва шифъра към клиента — запис, преместен в реда на друг клиент, не се отваря.
 * Отвореното се ползва само в паметта на изпращача/теста на връзката: никога в API, одит или лог.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

export type SecretFailure = 'unknown_key' | 'corrupt';

/** Без съдържание в съобщението — само причината (за кода в дневника на доставките). */
export class SecretError extends Error {
  constructor(readonly reason: SecretFailure) {
    super(`тайните на конектора не се отварят: ${reason}`);
    this.name = 'SecretError';
  }
}

/** Отпечатъкът на ключа (не е тайна) — по него записът казва с кой ключ е шифрован. */
export function keyId(key: Uint8Array): string {
  return createHmac('sha256', key)
    .update('chatchat/integrations/kek-id/v1')
    .digest()
    .subarray(0, 8)
    .toString('hex');
}

/** Текущият ключ пише, предишните само четат (ротация: INTEGRATION_KEK_PREVIOUS). */
export class SecretKeyring {
  readonly currentId: string;
  private readonly byId = new Map<string, Buffer>();

  constructor(current: Uint8Array, previous: readonly Uint8Array[] = []) {
    for (const k of [current, ...previous]) {
      if (k.byteLength !== KEY_BYTES) throw new Error('INTEGRATION_KEK трябва да е 32 байта');
      this.byId.set(keyId(k), Buffer.from(k));
    }
    this.currentId = keyId(current);
  }

  find(id: string): Buffer | undefined {
    return this.byId.get(id);
  }
}

const aad = (tenantId: string, kid: string) =>
  Buffer.from(`chatchat/integrations/${VERSION}|${tenantId}|${kid}`, 'utf8');

export type SecretValues = Record<string, string>;

export function sealSecrets(
  keyring: SecretKeyring,
  tenantId: string,
  values: SecretValues,
): string {
  const kid = keyring.currentId;
  const key = keyring.find(kid);
  if (!key) throw new SecretError('unknown_key');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(tenantId, kid));
  const body = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()]);
  return `${VERSION}.${kid}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

export function openSecrets(
  keyring: SecretKeyring,
  tenantId: string,
  sealed: string,
): SecretValues {
  const [version, kid, payload] = sealed.split('.');
  if (version !== VERSION || !kid || !payload) throw new SecretError('corrupt');
  const key = keyring.find(kid);
  if (!key) throw new SecretError('unknown_key');
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new SecretError('corrupt');
  let parsed: unknown;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
    decipher.setAAD(aad(tenantId, kid));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const text = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
    parsed = JSON.parse(text);
  } catch {
    throw new SecretError('corrupt');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SecretError('corrupt');
  }
  const out: SecretValues = {};
  for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** Шифрован ли е записът със стар ключ (за да се преопакова при следващ запис). */
export function sealedWithCurrent(keyring: SecretKeyring, sealed: string | null): boolean {
  return sealed === null || sealed.split('.')[1] === keyring.currentId;
}
