import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

import { prisma } from '@/lib/db';

/**
 * Автентикация на единствения администратор.
 *
 * Решенията тук са взети след червен екип, не по вкус:
 *  - **Паролата не се пази никъде** — в env стои само scrypt хеш (`соль:хеш`).
 *    Сравнението е `timingSafeEqual`, не `===`: разликата във времето при
 *    `===` изтича колко знака съвпадат.
 *  - **В базата стои само SHA-256 на сесийния токен.** Открадната база не
 *    дава валидна сесия.
 *  - **Токенът се ротира при вход** — иначе нападател подхвърля свой токен
 *    предварително и наследява сесията след като собственикът влезе
 *    (session fixation).
 *  - **Таванът на опитите е ПО ПРИНЦИПАЛ**, не глобален. Глобалният е
 *    едновременно и твърде хлабав (86 400 опита/ден), и опасен: чужд човек
 *    изяжда опитите и заключва собственика.
 *  - Проверката се вика **вътре в действието**, не в `page.tsx`: Next
 *    изпълнява server action-а ПРЕДИ да рендира страницата, значи guard в
 *    страницата закъснява с една мутация.
 */

/**
 * Представката `__Host-` е най-строгата (иска Secure, Path=/ и никакъв Domain)
 * — но точно затова браузърът я ОТХВЪРЛЯ ТИХО по обикновен HTTP. Резултатът
 * би бил „вход, който не се оплаква и не работи“. Затова силната представка се
 * ползва само когато сайтът наистина върви по HTTPS; иначе пада до обикновено
 * име, а `secure` следва същото условие.
 */
const OVER_HTTPS = (process.env.PUBLIC_BASE_URL ?? '').startsWith('https://');
const COOKIE = OVER_HTTPS ? '__Host-fivem-admin' : 'fivem-admin';
const SESSION_HOURS = 8;
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** IP-то никога не се пази в чист вид — само хеш, само за брояча. */
async function principalHash(): Promise<string> {
  const store = await headers();
  const ip =
    store.get('cf-connecting-ip') ??
    store.get('x-real-ip') ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  return sha256(`${ip}:${process.env.ADMIN_PASSWORD_HASH ?? ''}`);
}

/** Хешът е `соль:хеш` в шестнайсетичен вид — виж `npm run admin:hash`. */
export function verifyPassword(password: string): boolean {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!stored || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  try {
    const actual = scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expected, 'hex');
    if (expectedBuf.length !== actual.length) return false;
    return timingSafeEqual(actual, expectedBuf);
  } catch {
    return false;
  }
}

export async function tooManyAttempts(): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const failed = await prisma.loginAttempt.count({
    where: { ipHash: await principalHash(), ok: false, at: { gte: since } },
  });
  return failed >= MAX_ATTEMPTS;
}

export async function recordAttempt(ok: boolean): Promise<void> {
  await prisma.loginAttempt.create({ data: { ipHash: await principalHash(), ok } });
}

/** Създава сесия и ротира бисквитката. Връща токена само на браузъра. */
export async function startSession(): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await prisma.adminSession.create({ data: { tokenHash: sha256(token), expiresAt } });

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: OVER_HTTPS,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await prisma.adminSession.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  store.delete(COOKIE);
}

/** `true` само при жива сесия. Не хвърля — за условен рендер. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return false;

  const session = await prisma.adminSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt.getTime() < Date.now()) return false;

  await prisma.adminSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  return true;
}

/**
 * ПЪРВИЯТ ред във всяко админ действие. Хвърля, вместо да пренасочва: целта е
 * мутацията да не се случи, а не потребителят да види приятна страница.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error('Няма достъп');
}

/** Всяко решение оставя следа. `featuredUntil` са пари. */
export async function audit(action: string, target: string, detail?: string): Promise<void> {
  await prisma.auditLog.create({ data: { action, target, detail: detail ?? null } });
}
