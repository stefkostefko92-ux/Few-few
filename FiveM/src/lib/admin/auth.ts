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
/**
 * ВНИМАНИЕ: `seo.ts` пада към продукционния домейн, когато `PUBLIC_BASE_URL`
 * липсва — тук НЕ пада. Разминаването е нарочно: там липсващият адрес значи
 * грозен canonical, тук значи мълчаливо слаба сесийна бисквитка. Продукция без
 * `PUBLIC_BASE_URL` вече не минава тихо — вика се в лога при всеки старт.
 */
const OVER_HTTPS = (process.env.PUBLIC_BASE_URL ?? '').startsWith('https://');
if (!OVER_HTTPS && process.env.NODE_ENV === 'production') {
  console.error(
    '[admin] PUBLIC_BASE_URL не е https:// — сесийната бисквитка е БЕЗ `__Host-` и БЕЗ `secure`. ' +
      'Това е приемливо само на машина за разработка.',
  );
}
const COOKIE = OVER_HTTPS ? '__Host-fivem-admin' : 'fivem-admin';
const SESSION_HOURS = 8;
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
/**
 * ВТОРА линия срещу тавана по принципал. Принципалът се чете от хедър, а
 * хедър може да е подхвърлен — значи таванът по принципал сам по себе си е
 * толкова силен, колкото прокси-конфигурацията. Глобалният таван е нарочно
 * висок: той не бива да заключва собственика при нормална работа, а само да
 * спре разбиване с ротиран хедър.
 */
const MAX_ATTEMPTS_GLOBAL = 60;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * IP-то никога не се пази в чист вид — само хеш, само за брояча.
 *
 * Чете се ЕДИН хедър и той е този, който НАШЕТО прокси презаписва:
 * `proxy_set_header X-Real-IP $remote_addr` (виж `DEPLOY.md`). Това не е вкус —
 * предишният вариант четеше и `cf-connecting-ip`, и `x-forwarded-for`, а нито
 * един от двата не се пипа от конфигурацията ни, тоест и двата идваха направо
 * от клиента. Последицата беше двупосочна и доказана: с ротиран хедър таванът
 * на опитите изчезва, а с хедър, сочещ IP-то на собственика, панелът се
 * заключва за него. Име на хедър, който сами не презаписваме, е вход, не факт.
 *
 * `TRUST_PROXY_IP_HEADER` позволява друго име, ако прокси-то е различно —
 * съзнателен избор на оператора, вписан в `.env`, не подразбиране.
 */
export function trustedIpHeader(): string {
  return (process.env.TRUST_PROXY_IP_HEADER ?? 'x-real-ip').toLowerCase();
}

/**
 * Чистата половина — тества се без заявка. `lookup` е четенето на хедър.
 * Взима се ЕДИН хедър, никога „първият, който има стойност“: точно веригата от
 * резервни варианти правеше тавана заобиколим.
 */
export function principalIp(lookup: (name: string) => string | null | undefined): string {
  return lookup(trustedIpHeader())?.trim() || 'local';
}

async function principalHash(): Promise<string> {
  const store = await headers();
  const ip = principalIp((name) => store.get(name));
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

/**
 * Двоен таван: по принципал (строг) И глобален (хлабав). Само първият не стига
 * — той се крепи на хедър, а хедърът може да е подхвърлен; само вторият не
 * стига — чужд човек изяжда опитите и заключва собственика.
 */
export async function tooManyAttempts(): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [byPrincipal, total] = await prisma.$transaction([
    prisma.loginAttempt.count({
      where: { ipHash: await principalHash(), ok: false, at: { gte: since } },
    }),
    prisma.loginAttempt.count({ where: { ok: false, at: { gte: since } } }),
  ]);
  return byPrincipal >= MAX_ATTEMPTS || total >= MAX_ATTEMPTS_GLOBAL;
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
