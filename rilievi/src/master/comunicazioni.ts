import type { LivelloComunicazione } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { sendMail } from '../mail/mailer.js';
import { comunicazioneMail } from '../mail/templates.js';
import type { SessionUser } from '../types.js';
import { errorMessage, logger } from '../logger.js';
import { giornoRoma } from './tempo.js';
import type { NuovaComunicazione } from './comunicazioni-form.js';

/** Колко съобщения стоят над страницата наведнъж — по-старите чакат затварянето на тези. */
export const MAX_IN_PAGINA = 3;

export type StatoComunicazione = 'programmata' | 'attiva' | 'conclusa' | 'fermata';

/** Къде е съобщението във времето си. */
export function statoDi(
  c: { inizioAt: Date; fineAt: Date | null; fermataAt: Date | null },
  now: Date,
): StatoComunicazione {
  if (c.fermataAt) return 'fermata';
  if (c.fineAt && c.fineAt <= now) return 'conclusa';
  return c.inizioAt > now ? 'programmata' : 'attiva';
}

/** Администраторите на фирмите-получатели (активни хора на активни фирми) — адресите за писмото. */
async function indirizziAdmin(aziendaIds: string[]): Promise<string[]> {
  const righe = await prisma.membership.findMany({
    where: {
      role: 'ADMIN',
      user: { deactivatedAt: null },
      azienda: {
        deactivatedAt: null,
        ...(aziendaIds.length > 0 ? { id: { in: aziendaIds } } : {}),
      },
    },
    select: { user: { select: { email: true } } },
  });
  return [...new Set(righe.map((r) => r.user.email))];
}

/** Колко писма тръгват наведнъж — бавен SMTP не държи стотици връзки отворени. */
const PISMA_NAVEDNAZH = 4;

/**
 * Писмата до администраторите — след отговора на заявката (бавен SMTP не държи страницата на MASTER),
 * по `PISMA_NAVEDNAZH` наведнъж, всяко поотделно (никой не вижда чуждия адрес). Писмото назовава дните,
 * в които лентата е в портала. В базата остава само броят на тръгналите.
 */
async function inviaEmail(id: string, c: NuovaComunicazione, indirizzi: string[]): Promise<void> {
  const link = new URL('/schede', config().PUBLIC_BASE_URL).href;
  const quando = c.fineAt
    ? `dal ${giornoRoma(c.inizioAt)} al ${giornoRoma(new Date(c.fineAt.getTime() - 1))}`
    : `dal ${giornoRoma(c.inizioAt)}`;
  let inviate = 0;
  for (let i = 0; i < indirizzi.length; i += PISMA_NAVEDNAZH) {
    const esiti = await Promise.allSettled(
      indirizzi
        .slice(i, i + PISMA_NAVEDNAZH)
        .map((to) =>
          sendMail(comunicazioneMail({ to, titolo: c.titolo, testo: c.testo, quando, link })),
        ),
    );
    inviate += esiti.filter((e) => e.status === 'fulfilled' && e.value === 'sent').length;
  }
  await prisma.comunicazione.update({ where: { id }, data: { emailInviate: inviate } });
}

/** Същото съобщение (заглавие, текст, получатели, първи ден), записано преди малко — второ „Pubblica“. */
const DOPPIO_MS = 10 * 60_000;

/**
 * Записва съобщението и одита (без текста — само нивото и броя на фирмите); писмата, ако са поискани,
 * тръгват след това във фонов режим. Второ натискане на „Pubblica“ (страницата е увиснала, повторена
 * заявка) не прави второ съобщение и втори кръг писма: `doppio`.
 */
export async function creaComunicazione(
  autore: SessionUser,
  c: NuovaComunicazione,
): Promise<{ id: string; email: number | null; doppio: boolean }> {
  const esistente = await prisma.comunicazione.findFirst({
    where: {
      titolo: c.titolo,
      testo: c.testo,
      inizioAt: c.inizioAt,
      aziendaIds: { equals: c.aziendaIds },
      fermataAt: null,
      createdAt: { gte: new Date(Date.now() - DOPPIO_MS) },
    },
    select: { id: true },
  });
  if (esistente) return { id: esistente.id, email: null, doppio: true };
  const creata = await prisma.$transaction(async (tx) => {
    const riga = await tx.comunicazione.create({
      data: {
        titolo: c.titolo,
        testo: c.testo,
        livello: c.livello,
        aziendaIds: c.aziendaIds,
        inizioAt: c.inizioAt,
        fineAt: c.fineAt,
        autoreId: autore.id,
      },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId: autore.id,
        action: 'COMUNICAZIONE_CREATE',
        aziendaId: null,
        targetType: 'comunicazione',
        targetId: riga.id,
        meta: { livello: c.livello, aziende: c.aziendaIds.length, email: c.email },
      },
      tx,
    );
    return riga;
  });
  if (!c.email) return { id: creata.id, email: null, doppio: false };
  const indirizzi = await indirizziAdmin(c.aziendaIds);
  inviaEmail(creata.id, c, indirizzi).catch((error: unknown) => {
    logger.error({ err: errorMessage(error), id: creata.id }, 'писмата на съобщението не тръгнаха');
  });
  return { id: creata.id, email: indirizzi.length, doppio: false };
}

/** Спира съобщението сега (само едно, което още не е спряно); false — няма такова. */
export async function fermaComunicazione(autore: SessionUser, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.comunicazione.updateMany({
      where: { id, fermataAt: null },
      data: { fermataAt: new Date() },
    });
    if (count === 0) return false;
    await writeAudit(
      {
        actorId: autore.id,
        action: 'COMUNICAZIONE_STOP',
        aziendaId: null,
        targetType: 'comunicazione',
        targetId: id,
      },
      tx,
    );
    return true;
  });
}

/** Всички съобщения за страницата на MASTER, най-новите отгоре, с колко души са ги затворили. */
export async function elencoComunicazioni() {
  return prisma.comunicazione.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      titolo: true,
      testo: true,
      livello: true,
      aziendaIds: true,
      inizioAt: true,
      fineAt: true,
      fermataAt: true,
      emailInviate: true,
      createdAt: true,
      autore: { select: { name: true } },
      _count: { select: { chiusure: true } },
    },
  });
}

export interface ComunicazioneInPagina {
  id: string;
  titolo: string;
  testo: string;
  livello: LivelloComunicazione;
}

/**
 * Съобщенията над страницата на човека: текущите (започнали, без край или с край в бъдещето, неспрени), до
 * всички или до някоя от активните му фирми, които още не е затворил — най-спешните първи, после
 * най-новите. MASTER — никое (той ги пише и ги вижда на своята страница).
 */
export async function comunicazioniPer(
  user: SessionUser,
  now: Date = new Date(),
): Promise<ComunicazioneInPagina[]> {
  if (user.master || user.memberships.length === 0) return [];
  const aziende = user.memberships.map((m) => m.aziendaId);
  const righe = await prisma.comunicazione.findMany({
    where: {
      fermataAt: null,
      inizioAt: { lte: now },
      OR: [{ fineAt: null }, { fineAt: { gt: now } }],
      AND: [{ OR: [{ aziendaIds: { isEmpty: true } }, { aziendaIds: { hasSome: aziende } }] }],
      chiusure: { none: { userId: user.id } },
    },
    orderBy: [{ livello: 'desc' }, { inizioAt: 'desc' }],
    take: MAX_IN_PAGINA,
    select: { id: true, titolo: true, testo: true, livello: true },
  });
  return righe;
}

/** Човекът затваря лентата на съобщението — само на едно, което вижда; иначе нищо. */
export async function chiudiComunicazione(user: SessionUser, id: string): Promise<void> {
  const visibili = await destinatarioDi(user, id);
  if (!visibili) return;
  await prisma.comunicazioneChiusa.createMany({
    data: [{ comunicazioneId: id, userId: user.id }],
    skipDuplicates: true,
  });
}

/** Съобщението `id` е ли до човека (каквото и да е времето му) — затварянето пише само такива. */
async function destinatarioDi(user: SessionUser, id: string): Promise<boolean> {
  if (user.master) return false;
  const aziende = user.memberships.map((m) => m.aziendaId);
  const riga = await prisma.comunicazione.findFirst({
    where: {
      id,
      OR: [{ aziendaIds: { isEmpty: true } }, { aziendaIds: { hasSome: aziende } }],
    },
    select: { id: true },
  });
  return riga !== null;
}
