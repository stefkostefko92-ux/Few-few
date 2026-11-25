import { attemptFailed, MAX_FAILED_LOGINS, reserveAttempt } from '../auth/lockout.js';
import { verificaCodice } from '../auth/codice.js';
import { registraErrore, reteBloccata } from '../auth/rete.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { prisma } from '../db.js';
import { bloccoCodiciMail } from '../mail/templates.js';
import { sendMail } from '../mail/mailer.js';
import { MINUTE } from '../time.js';
import {
  accessoAttivo,
  auditBlocco,
  completaAccesso,
  minutiBlocco,
  type LoggedUser,
} from './login.js';

/**
 * Вторият фактор при вход. След вярна парола сесия НЕ се създава: има само предизвикателство (ред в
 * базата + бисквитка с токена, в базата — SHA-256) за 10 минути и най-много MAX_CODICI опита с код.
 * Грешните кодове се броят и в заключването на акаунта (заедно с паролите) и в тавана на мрежата; нова
 * парола не дава нови опити — броячът на акаунта пада едва след верния код. Заключат ли кодовете
 * акаунта, човекът получава писмо: паролата му явно е известна на друг.
 */
export const SFIDA_MS = 10 * MINUTE;
export const MAX_CODICI = 5;

export async function creaSfida(userId: string, next: string): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  // Изтеклите на човека се махат тук — иначе чакат поддръжката.
  await prisma.loginChallenge.deleteMany({ where: { userId, expiresAt: { lte: new Date(now) } } });
  await prisma.loginChallenge.create({
    data: {
      tokenHash: sha256Hex(token),
      userId,
      next,
      expiresAt: new Date(now + SFIDA_MS),
    },
  });
  return token;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Живото предизвикателство по токена от бисквитката, или null. */
export async function sfidaValida(token: string | undefined) {
  if (!token || !TOKEN.test(token)) return null;
  const sfida = await prisma.loginChallenge.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!sfida || sfida.expiresAt.getTime() <= Date.now() || sfida.failures >= MAX_CODICI)
    return null;
  return sfida;
}

export type EsitoCodice =
  | { kind: 'ok'; user: LoggedUser; next: string; via: 'totp' | 'recupero' }
  | { kind: 'invalid'; left: number }
  | { kind: 'locked'; minutes: number }
  | { kind: 'expired' }
  | { kind: 'throttled' };

const chiudi = (id: string) => prisma.loginChallenge.deleteMany({ where: { id } });

export async function verificaSfida(
  token: string | undefined,
  input: string,
  ip: string | null | undefined,
): Promise<EsitoCodice> {
  if (await reteBloccata(ip)) return { kind: 'throttled' };
  const sfida = await sfidaValida(token);
  if (!sfida) return { kind: 'expired' };
  // Опитът на предизвикателството се заема преди проверката (паралелни заявки не надхвърлят тавана).
  const taken = await prisma.loginChallenge.updateMany({
    where: { id: sfida.id, failures: { lt: MAX_CODICI }, expiresAt: { gt: new Date() } },
    data: { failures: { increment: 1 } },
  });
  if (taken.count === 0) {
    await chiudi(sfida.id);
    return { kind: 'expired' };
  }
  const user = await prisma.user.findUnique({
    where: { id: sfida.userId },
    select: { id: true, email: true, totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true },
  });
  // 2FA, изключена междувременно (от управляващия) — входът започва отначало.
  if (!user?.totpEnabledAt) {
    await chiudi(sfida.id);
    return { kind: 'expired' };
  }
  const attempt = await reserveAttempt(user.id);
  if (!attempt.reserved) {
    await chiudi(sfida.id);
    if (attempt.lockedNow) await bloccatoDaiCodici(user);
    return { kind: 'locked', minutes: await minutiBlocco(user.id) };
  }
  const via = await verificaCodice(user, input);
  if (!via) {
    await registraErrore(ip);
    const failure = await attemptFailed(user.id);
    if (failure.locked) {
      await chiudi(sfida.id);
      if (failure.lockedNow) await bloccatoDaiCodici(user);
      return { kind: 'locked', minutes: await minutiBlocco(user.id) };
    }
    const left = Math.min(MAX_CODICI - (sfida.failures + 1), MAX_FAILED_LOGINS - failure.count);
    if (left <= 0) {
      await chiudi(sfida.id);
      return { kind: 'expired' };
    }
    return { kind: 'invalid', left };
  }
  // Предизвикателството се изразходва веднъж: двойно изпращане на верния код не дава две сесии.
  if ((await chiudi(sfida.id)).count !== 1) return { kind: 'expired' };
  const allowed = await accessoAttivo(user.id);
  if (!allowed) return { kind: 'expired' };
  await completaAccesso(user.id, via);
  return { kind: 'ok', user: allowed, next: sfida.next, via };
}

async function bloccatoDaiCodici(user: { id: string; email: string }): Promise<void> {
  await auditBlocco(user.id);
  await sendMail(bloccoCodiciMail({ to: user.email }));
}

/** Поддръжката: изтеклите предизвикателства. */
export async function pulisciSfide(now: number = Date.now()): Promise<number> {
  const result = await prisma.loginChallenge.deleteMany({
    where: { expiresAt: { lte: new Date(now) } },
  });
  return result.count;
}
