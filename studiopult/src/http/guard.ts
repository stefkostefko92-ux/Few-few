/**
 * Пазачът на входа (модел на заплахите, т. 3 от плана на AI-джията, 28.11.2026):
 * - Host трябва да е точно `127.0.0.1:<порт>` — иначе 421 (DNS rebinding: чужд сайт, чието име сочи към
 *   127.0.0.1, праща Host със своето име);
 * - POST иска точен Origin `http://127.0.0.1:<порт>` — без, `null` или чужд → 403 (CSRF);
 * - GET от чужд сайт (Sec-Fetch-Site: cross-site/same-site) → 403;
 * - еднократен токен от терминала → бисквитка HttpOnly; SameSite=Strict (други локални потребители и
 *   процеси виждат порта, но не и токена).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'pult';

export function hostOk(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}`;
}

export function originOk(origin: string | undefined, port: number): boolean {
  return origin === `http://127.0.0.1:${port}`;
}

/** Липсва (стар браузър, curl), same-origin или none (адрес, въведен на ръка) — да; иначе не. */
export function fetchSiteOk(site: string | undefined): boolean {
  return site === undefined || site === 'same-origin' || site === 'none';
}

const b64url = (b: Buffer): string => b.toString('base64url');
const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Еднократният токен (32 байта) се сменя за стойност на бисквитката; повторна смяна → null. */
export class SessionGate {
  readonly startToken: string;
  private used = false;
  private cookieValue: string | null = null;

  constructor(rand: (n: number) => Buffer = randomBytes) {
    this.startToken = b64url(rand(32));
  }

  exchange(token: string | null | undefined): string | null {
    if (this.used || typeof token !== 'string' || !same(token, this.startToken)) return null;
    this.used = true;
    this.cookieValue = b64url(randomBytes(32));
    return this.cookieValue;
  }

  valid(cookieHeader: string | undefined): boolean {
    if (!this.cookieValue || !cookieHeader) return false;
    for (const part of cookieHeader.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE && same(v.join('='), this.cookieValue)) return true;
    }
    return false;
  }

  setCookie(value: string): string {
    return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/`;
  }
}

/** Заглавията на всеки отговор. Без CORS. */
export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' blob:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};
