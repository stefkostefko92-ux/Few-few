import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Client secret на доставчика в покой: AES-256-GCM с отделен ключ (SSO_KEK), различен от
 * MFA_ENC_KEY и FILES_KEK. AAD = клиент + запис — шифротекст, преместен към друг клиент или друг
 * доставчик, не се отваря. Формат: `v1.<id на ключа>.<base64(iv | tag | ciphertext)>`; id-то е
 * отпечатък (HMAC), не ключът — по него се избира текущият или предишен ключ (ротация).
 * Открит секрет не излиза оттук към API, лог или одит — само към token endpoint-а.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

function keyId(key: Uint8Array): string {
  return createHmac('sha256', key)
    .update('chatchat/sso/kek-id/v1')
    .digest()
    .subarray(0, 8)
    .toString('hex');
}

function aad(tenantId: string, configId: string): Buffer {
  return Buffer.from(`chatchat/sso/client-secret/v1|${tenantId}|${configId}`, 'utf8');
}

/** Грешка с код за лога (`oidcErrorCode`) — без съдържание. */
export class SecretError extends Error {
  constructor(readonly code: 'sso_secret_corrupt' | 'sso_secret_unknown_key') {
    super(code);
    this.name = 'SecretError';
  }
}

export class SecretBox {
  private readonly currentId: string;
  private readonly byId = new Map<string, Buffer>();

  constructor(current: Uint8Array, previous: readonly Uint8Array[] = []) {
    for (const k of [current, ...previous]) {
      if (k.byteLength !== KEY_BYTES) throw new Error('SSO_KEK трябва да е 32 байта');
    }
    this.currentId = keyId(current);
    for (const k of [current, ...previous]) this.byId.set(keyId(k), Buffer.from(k));
  }

  seal(plaintext: string, tenantId: string, configId: string): string {
    const key = this.byId.get(this.currentId) as Buffer;
    const iv = randomBytes(IV_BYTES);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(aad(tenantId, configId));
    const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
    const body = Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
    return `${VERSION}.${this.currentId}.${body}`;
  }

  /**
   * Открит секрет + дали е с предишен ключ (тогава викащият го преписва с текущия). Непознат ключ,
   * подправка или чужд запис → грешка (fail-closed: входът през доставчика не тръгва).
   */
  open(sealed: string, tenantId: string, configId: string): { secret: string; stale: boolean } {
    const [version, id, body] = sealed.split('.');
    if (version !== VERSION || !id || !body) throw new SecretError('sso_secret_corrupt');
    const key = this.byId.get(id);
    if (!key) throw new SecretError('sso_secret_unknown_key');
    const raw = Buffer.from(body, 'base64');
    if (raw.length <= IV_BYTES + TAG_BYTES) throw new SecretError('sso_secret_corrupt');
    try {
      const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
      d.setAAD(aad(tenantId, configId));
      d.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const secret = Buffer.concat([
        d.update(raw.subarray(IV_BYTES + TAG_BYTES)),
        d.final(),
      ]).toString('utf8');
      return { secret, stale: id !== this.currentId };
    } catch {
      throw new SecretError('sso_secret_corrupt');
    }
  }
}
