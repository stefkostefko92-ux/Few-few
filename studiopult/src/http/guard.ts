/**
 * Пазачът на входа (модел на заплахите, т. 3 от плана на AI-джията, 28.11.2026):
 * - Host трябва да е точно `127.0.0.1:<порт>` — иначе 421 (DNS rebinding: чужд сайт, чието име сочи към
 *   127.0.0.1, праща Host със своето име);
 * - POST иска точен Origin `http://127.0.0.1:<порт>` — без, `null` или чужд → 403 (CSRF);
 * - GET от чужд сайт (Sec-Fetch-Site: cross-site/same-site) → 403;
 * - еднократен токен от терминала → API токен във фрагмента `/app#t=…` (никога не стига до сървър) →
 *   `Authorization: Bearer` на всяко /api/*. Бисквитка НЯМА: червеният екип на #515 (F2) показа, че Chrome
 *   праща бисквитката на 127.0.0.1:A и на всеки друг порт на 127.0.0.1 → всеки локален слушател я получава;
 * - прегледът (`<video src>` не праща заглавия) е по подписан адрес: един път, 10 минути, HMAC с ключ на процеса.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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

export const FILE_TTL_MS = 10 * 60_000;

/** Еднократният токен (32 байта) се сменя за API токен; повторна смяна → null. */
export class SessionGate {
  readonly startToken: string;
  private used = false;
  private apiToken: string | null = null;
  private readonly fileKey = randomBytes(32);

  constructor(rand: (n: number) => Buffer = randomBytes) {
    this.startToken = b64url(rand(32));
  }

  exchange(token: string | null | undefined): string | null {
    if (this.used || typeof token !== 'string' || !same(token, this.startToken)) return null;
    this.used = true;
    this.apiToken = b64url(randomBytes(32));
    return this.apiToken;
  }

  /** Точно `Bearer <токен>`; сравнението е с постоянно време. */
  valid(authorization: string | undefined): boolean {
    if (!this.apiToken || typeof authorization !== 'string') return false;
    if (!authorization.startsWith('Bearer ')) return false;
    return same(authorization.slice(7), this.apiToken);
  }

  private mac(rel: string, exp: string): string {
    return b64url(createHmac('sha256', this.fileKey).update(`${rel}\n${exp}`).digest());
  }

  signFile(rel: string, now = Date.now()): { exp: string; sig: string } {
    const exp = String(now + FILE_TTL_MS);
    return { exp, sig: this.mac(rel, exp) };
  }

  fileOk(rel: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
    if (!this.apiToken || typeof exp !== 'string' || typeof sig !== 'string') return false;
    if (!/^\d{13}$/.test(exp)) return false;
    const t = Number(exp);
    if (t <= now || t > now + FILE_TTL_MS) return false;
    return same(sig, this.mac(rel, exp));
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
