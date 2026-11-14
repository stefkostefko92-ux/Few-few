import { Prisma, type FornitoreIdentita } from '@prisma/client';
import { writeUserAudit } from '../audit.js';
import { isLocked, minutesLeft } from '../auth/lockout.js';
import type { Identita } from '../auth/oidc.js';
import { fornitoriConfigurati } from '../auth/oidc.js';
import type { Fornitore } from '../auth/oidc-stato.js';
import { prisma } from '../db.js';
import { sendMail } from '../mail/mailer.js';
import { accessoEsternoMail } from '../mail/templates.js';
import { accessoAttivo, completaAccesso, type LoggedUser } from './login.js';

/**
 * Входът с доставчика на самоличност на клиента (D1, чл. 4.6) — правилата върху базата. Човекът свързва СВОЯ
 * акаунт от „Account“ с паролата си; входът намира акаунта САМО по самоличността (`<tid>:<oid>` / `sub`) —
 * никога по имейл (имейлът от доставчика не доказва, че адресът е негов). Пуска само докато някоя активна
 * фирма на човека позволява същата организация (директория или домейн), човекът не е деактивиран, нито
 * заключен; MASTER — никога (собственикът на портала влиза само с паролата и кода си). Включен ли е кодът
 * на 2FA, доставчикът замества само паролата.
 */

export const ENUM_FORNITORE: Readonly<Record<Fornitore, FornitoreIdentita>> = {
  microsoft: 'MICROSOFT',
  google: 'GOOGLE',
};
export const NOME_FORNITORE: Readonly<Record<Fornitore, string>> = {
  microsoft: 'Microsoft',
  google: 'Google',
};
const COLONNA = { microsoft: 'accessoMicrosoft', google: 'accessoGoogle' } as const;

/** Активна (не свършила) фирма на човека, която пуска тази организация на този доставчик. */
async function aziendaConsente(
  userId: string,
  fornitore: Fornitore,
  organizzazione: string | null,
): Promise<boolean> {
  if (!organizzazione) return false;
  const n = await prisma.membership.count({
    where: { userId, azienda: { deactivatedAt: null, [COLONNA[fornitore]]: organizzazione } },
  });
  return n > 0;
}

/** Доставчиците, които някоя активна фирма на човека е включила (каквото „Account“ предлага). */
export async function fornitoriDelleAziende(userId: string): Promise<Fornitore[]> {
  const configurati = fornitoriConfigurati();
  if (configurati.length === 0) return [];
  const aziende = await prisma.azienda.findMany({
    where: { deactivatedAt: null, memberships: { some: { userId } } },
    select: { accessoMicrosoft: true, accessoGoogle: true },
  });
  return configurati.filter((f) => aziende.some((a) => a[COLONNA[f]] !== null));
}

let visibili: { at: number; valore: Fornitore[] } | null = null;

/** Бутоните на страницата за вход: доставчик с приложение и поне една активна фирма, която го е включила. */
export async function fornitoriVisibili(now: number = Date.now()): Promise<Fornitore[]> {
  if (visibili && now - visibili.at < 60_000) return visibili.valore;
  const configurati = fornitoriConfigurati();
  const valore: Fornitore[] = [];
  for (const f of configurati) {
    const n = await prisma.azienda.count({
      where: { deactivatedAt: null, [COLONNA[f]]: { not: null } },
    });
    if (n > 0) valore.push(f);
  }
  visibili = { at: now, valore };
  return valore;
}

/** След запис на настройката: бутоните следват веднага. */
export const dimenticaVisibili = (): void => {
  visibili = null;
};

/** Свързаните акаунти на човека — за „Account“. */
export function identitaDi(userId: string) {
  return prisma.identitaEsterna.findMany({
    where: { userId },
    select: { fornitore: true, etichetta: true, createdAt: true, usataAt: true },
    orderBy: { fornitore: 'asc' },
  });
}

export type EsitoCollega = 'ok' | 'altraOrganizzazione' | 'giaUsato';

class GiaUsato extends Error {}

/** Свързва самоличността с акаунта (замества досегашната от същия доставчик). Одит без самоличността. */
export async function collegaIdentita(
  user: { id: string; email: string },
  fornitore: Fornitore,
  identita: Identita,
): Promise<EsitoCollega> {
  if (!(await aziendaConsente(user.id, fornitore, identita.organizzazione)))
    return 'altraOrganizzazione';
  const chiave = { fornitore: ENUM_FORNITORE[fornitore], soggetto: identita.soggetto };
  try {
    await prisma.$transaction(async (tx) => {
      const presente = await tx.identitaEsterna.findUnique({
        where: { fornitore_soggetto: chiave },
        select: { userId: true },
      });
      if (presente && presente.userId !== user.id) throw new GiaUsato();
      await tx.identitaEsterna.deleteMany({
        where: { userId: user.id, fornitore: chiave.fornitore },
      });
      await tx.identitaEsterna.create({
        data: {
          ...chiave,
          userId: user.id,
          organizzazione: identita.organizzazione ?? '',
          etichetta: identita.etichetta,
        },
      });
      await writeUserAudit(
        {
          actorId: user.id,
          action: 'ACCESSO_ESTERNO_COLLEGATO',
          targetType: 'user',
          targetId: user.id,
          meta: { fornitore },
        },
        user.id,
        tx,
      );
    });
  } catch (error) {
    if (
      error instanceof GiaUsato ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    )
      return 'giaUsato';
    throw error;
  }
  await sendMail(
    accessoEsternoMail({
      to: user.email,
      fornitore: NOME_FORNITORE[fornitore],
      evento: 'collegato',
    }),
  );
  return 'ok';
}

/** Откача доставчика от акаунта; false — нямаше какво. */
export async function scollegaIdentita(
  user: { id: string; email: string },
  fornitore: Fornitore,
): Promise<boolean> {
  const tolte = await prisma.$transaction(async (tx) => {
    const { count } = await tx.identitaEsterna.deleteMany({
      where: { userId: user.id, fornitore: ENUM_FORNITORE[fornitore] },
    });
    if (count > 0) {
      await writeUserAudit(
        {
          actorId: user.id,
          action: 'ACCESSO_ESTERNO_SCOLLEGATO',
          targetType: 'user',
          targetId: user.id,
          meta: { fornitore },
        },
        user.id,
        tx,
      );
    }
    return count;
  });
  if (tolte === 0) return false;
  await sendMail(
    accessoEsternoMail({
      to: user.email,
      fornitore: NOME_FORNITORE[fornitore],
      evento: 'scollegato',
    }),
  );
  return true;
}

export type EsitoAccessoEsterno =
  | { kind: 'ok'; user: LoggedUser }
  | { kind: 'mfa'; userId: string }
  | { kind: 'sconosciuto' }
  | { kind: 'nonAttivo' }
  | { kind: 'deactivated' }
  | { kind: 'locked'; minutes: number };

/** Входът с проверената самоличност: сесия, предизвикателство за кода или причината за отказа. */
export async function accediConIdentita(
  fornitore: Fornitore,
  identita: Identita,
): Promise<EsitoAccessoEsterno> {
  const riga = await prisma.identitaEsterna.findUnique({
    where: {
      fornitore_soggetto: { fornitore: ENUM_FORNITORE[fornitore], soggetto: identita.soggetto },
    },
    select: {
      id: true,
      userId: true,
      organizzazione: true,
      user: { select: { master: true, lockedUntil: true, totpEnabledAt: true } },
    },
  });
  if (!riga || riga.user.master) return { kind: 'sconosciuto' };
  if (riga.organizzazione !== identita.organizzazione) return { kind: 'nonAttivo' };
  if (isLocked(riga.user)) return { kind: 'locked', minutes: minutesLeft(riga.user.lockedUntil!) };
  const allowed = await accessoAttivo(riga.userId);
  if (!allowed) return { kind: 'deactivated' };
  if (!(await aziendaConsente(riga.userId, fornitore, identita.organizzazione)))
    return { kind: 'nonAttivo' };
  await prisma.identitaEsterna.update({
    where: { id: riga.id },
    data: { usataAt: new Date(), ...(identita.etichetta ? { etichetta: identita.etichetta } : {}) },
  });
  if (riga.user.totpEnabledAt) return { kind: 'mfa', userId: riga.userId };
  await completaAccesso(riga.userId, fornitore);
  return { kind: 'ok', user: allowed };
}
