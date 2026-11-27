import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Достъпът до `/internal/*` — сборовете за петъчния отчет на vpsdash (на същия сървър).
 *
 * Приложението върви в Docker, затова отвътре и публичната заявка (през nginx), и локалната (vpsdash)
 * идват от шлюза на Docker — IP-то не различава нищо. Различава ги заглавката, която nginx слага ВИНАГИ
 * (`X-Forwarded-For $remote_addr`, deploy/nginx/fakturist.conf): минала през прокси = скрита (404), за да
 * не издава, че крайната точка съществува. Отгоре — `location ^~ /internal/ { return 404; }` в nginx и
 * Bearer токен, сравнен за постоянно време. Без настроен токен крайната точка я няма.
 */
export type InternalAccess = 'ok' | 'hidden' | 'unauthorized';

const PROXY_HEADERS = ['x-forwarded-for', 'forwarded', 'x-real-ip'] as const;

const digest = (value: string) => createHash('sha256').update(value).digest();

export function internalAccess(
  headers: Record<string, string | string[] | undefined>,
  token: string | undefined,
): InternalAccess {
  if (!token) return 'hidden';
  if (PROXY_HEADERS.some((name) => headers[name] !== undefined)) return 'hidden';
  const raw = headers['authorization'];
  if (typeof raw !== 'string') return 'unauthorized';
  const match = /^Bearer (\S+)$/i.exec(raw.trim());
  if (!match) return 'unauthorized';
  // Отпечатъците са с еднаква дължина — сравнението не издава нито съдържанието, нито дължината.
  return timingSafeEqual(digest(match[1]!), digest(token)) ? 'ok' : 'unauthorized';
}
