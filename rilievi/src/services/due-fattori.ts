import QRCode from 'qrcode';
import { writeUserAudit } from '../audit.js';
import { z } from 'zod';
import { cifraBozza, cifraSegreto, decifraBozza } from '../auth/chiavi.js';
import { canManageAccount, type Actor } from '../auth/manage.js';
import { issueRecoveryCodes, remainingRecoveryCodes } from '../auth/recovery.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { generateTotpSecret, otpauthUrl, segretoLeggibile, verifyTotp } from '../auth/totp.js';
import { prisma } from '../db.js';
import { dueFattoriMail } from '../mail/templates.js';
import { sendMail } from '../mail/mailer.js';
import { MINUTE } from '../time.js';
import { reauthCode, reauthPassword, type Reauth } from './reauth.js';

/**
 * Двуфакторният вход по избор на всеки човек (собственикът, 31 октомври 2026 — „2FA, изключена по
 * подразбиране, която всеки потребител може да активира по желание“). Включване: паролата (иначе чужда
 * сесия би сложила свое приложение и би заключила собственика) → тайната (в скритото поле, шифрована,
 * още не важи) → кодът от приложението → включена, резервните кодове се показват веднъж, другите
 * сесии падат.
 * Изключване и нови кодове: паролата И код. Изгубен телефон без резервни кодове: изключва я който
 * управлява акаунта (auth/manage.ts — като връзката за нова парола), с одит и писмо до човека.
 */

export const EMITTENTE = 'Rilievi Impianti';

export interface StatoDueFattori {
  attiva: boolean;
  dal: Date | null;
  codiciRimasti: number;
}

export async function statoDueFattori(userId: string): Promise<StatoDueFattori> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpEnabledAt: true },
  });
  return {
    attiva: user.totpEnabledAt !== null,
    dal: user.totpEnabledAt,
    codiciRimasti: user.totpEnabledAt ? await remainingRecoveryCodes(userId) : 0,
  };
}

export interface Configurazione {
  segreto: string;
  url: string;
  qrSvg: string;
}

async function configurazione(email: string, segreto: string): Promise<Configurazione> {
  const url = otpauthUrl(EMITTENTE, email, segreto);
  // SVG от нашия сървър (без външни картинки и без data: адреси — CSP-то остава строго).
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { segreto: segretoLeggibile(segreto), url, qrSvg };
}

const utente = (userId: string) =>
  prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      totpSecretEnc: true,
      totpEnabledAt: true,
      totpLastStep: true,
    },
  });

/** Започнатата настройка живее 15 минути — след това се започва пак (с паролата). */
const BOZZA_MS = 15 * MINUTE;

const bozzaSchema = z.object({
  s: z.string().regex(/^[A-Z2-7]{32}$/),
  sid: z.string().max(100),
  u: z.string().max(100),
  exp: z.number().int(),
});

/** Тайната от скритото поле, ако е на този човек, от тази сесия и не е изтекла; иначе null. */
function segretoDaBozza(userId: string, sessionId: string, bozza: unknown): string | null {
  if (typeof bozza !== 'string' || bozza.length > 400) return null;
  const json = decifraBozza(bozza);
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = bozzaSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { s, sid, u, exp } = parsed.data;
  return u === userId && sid === sessionId && exp > Date.now() ? s : null;
}

export type Avvio =
  { ok: true; setup: Configurazione; bozza: string } | { ok: false; error: Reauth | 'attiva' };

/**
 * Нова тайна след вярна парола. Не влиза в базата: пътува шифрована (cifraBozza) в скритото поле на
 * формата с кода, вързана за човека и сесията, 15 минути — и важи едва след кода от приложението.
 */
export async function avviaDueFattori(
  userId: string,
  sessionId: string,
  password: string,
): Promise<Avvio> {
  const user = await utente(userId);
  if (user.totpEnabledAt) return { ok: false, error: 'attiva' };
  const denied = await reauthPassword(user, password);
  if (denied) return { ok: false, error: denied };
  const segreto = generateTotpSecret();
  const bozza = cifraBozza(
    JSON.stringify({ s: segreto, sid: sessionId, u: userId, exp: Date.now() + BOZZA_MS }),
  );
  return { ok: true, setup: await configurazione(user.email, segreto), bozza };
}

/** Настройката от скритото поле — за формата с кода след грешен код; изтекла или чужда — null. */
export async function configurazioneDaBozza(
  userId: string,
  sessionId: string,
  bozza: unknown,
): Promise<Configurazione | null> {
  const segreto = segretoDaBozza(userId, sessionId, bozza);
  if (!segreto) return null;
  const user = await utente(userId);
  return configurazione(user.email, segreto);
}

export type Conferma =
  { ok: true; codici: string[] } | { ok: false; error: 'codice' | 'attiva' | 'scaduta' };

export async function confermaDueFattori(
  userId: string,
  sessionId: string,
  bozza: unknown,
  codice: string,
): Promise<Conferma> {
  const user = await utente(userId);
  if (user.totpEnabledAt) return { ok: false, error: 'attiva' };
  const segreto = segretoDaBozza(userId, sessionId, bozza);
  if (!segreto) return { ok: false, error: 'scaduta' };
  const step = verifyTotp(segreto, codice.slice(0, 64), null);
  if (step === null) return { ok: false, error: 'codice' };
  const codici = await prisma.$transaction(async (tx) => {
    // Включва я само една заявка: двойното изпращане не издава втори комплект кодове (на екрана
    // биха останали кодове, които ги няма в базата).
    const enabled = await tx.user.updateMany({
      where: { id: userId, totpEnabledAt: null },
      data: { totpSecretEnc: cifraSegreto(segreto), totpEnabledAt: new Date(), totpLastStep: step },
    });
    if (enabled.count !== 1) return null;
    const nuovi = await issueRecoveryCodes(userId, tx);
    // Другите сесии са отворени без втория фактор — падат; текущата остава.
    await destroyAllSessions(userId, sessionId, tx);
    await writeUserAudit(
      { actorId: userId, action: 'TOTP_ON', targetType: 'user', targetId: userId },
      userId,
      tx,
    );
    return nuovi;
  });
  if (!codici) return { ok: false, error: 'attiva' };
  await sendMail(dueFattoriMail({ to: user.email, evento: 'attivata' }));
  return { ok: true, codici };
}

export type Esito = { ok: true } | { ok: false; error: Reauth | 'spenta' };

/** Паролата И код (от приложението или резервен) — и двете се броят в заключването. */
async function confermaForte(userId: string, password: string, codice: string): Promise<Esito> {
  const user = await utente(userId);
  if (!user.totpEnabledAt) return { ok: false, error: 'spenta' };
  const denied = (await reauthPassword(user, password)) ?? (await reauthCode(user, codice));
  return denied ? { ok: false, error: denied } : { ok: true };
}

export async function disattivaDueFattori(
  userId: string,
  password: string,
  codice: string,
): Promise<Esito> {
  const check = await confermaForte(userId, password, codice);
  if (!check.ok) return check;
  const email = await spegni(userId, { actorId: userId, action: 'TOTP_OFF' });
  if (email) await sendMail(dueFattoriMail({ to: email, evento: 'disattivata' }));
  return { ok: true };
}

export type NuoviCodici = { ok: true; codici: string[] } | { ok: false; error: Reauth | 'spenta' };

export async function nuoviCodici(
  userId: string,
  password: string,
  codice: string,
): Promise<NuoviCodici> {
  const check = await confermaForte(userId, password, codice);
  if (!check.ok) return check;
  const codici = await prisma.$transaction(async (tx) => {
    const nuovi = await issueRecoveryCodes(userId, tx);
    await writeUserAudit(
      { actorId: userId, action: 'TOTP_CODES', targetType: 'user', targetId: userId },
      userId,
      tx,
    );
    return nuovi;
  });
  return { ok: true, codici };
}

/** Изключва 2FA (тайна, стъпка, резервни кодове, чакащите входове) с одит; имейлът — за писмото. */
async function spegni(
  userId: string,
  audit: { actorId: string; action: 'TOTP_OFF' | 'TOTP_RESET' },
): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const off = await tx.user.updateMany({
      where: { id: userId, totpEnabledAt: { not: null } },
      data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    });
    if (off.count !== 1) return null;
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.loginChallenge.deleteMany({ where: { userId } });
    await writeUserAudit({ ...audit, targetType: 'user', targetId: userId }, userId, tx);
    const row = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    return row.email;
  });
}

/**
 * Изгубен телефон: изключва я управляващият акаунта (MASTER или администраторът, който управлява
 * членството на човека във всяка негова фирма) — никога своята (за нея — паролата и кодът).
 */
export async function azzeraDueFattori(actor: Actor, targetId: string): Promise<boolean> {
  if (actor.id === targetId) return false;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      master: true,
      totpEnabledAt: true,
      memberships: { select: { aziendaId: true, role: true } },
    },
  });
  if (!target?.totpEnabledAt || !canManageAccount(actor, target)) return false;
  const email = await spegni(targetId, { actorId: actor.id, action: 'TOTP_RESET' });
  if (!email) return false;
  await sendMail(dueFattoriMail({ to: email, evento: 'azzerata' }));
  return true;
}
