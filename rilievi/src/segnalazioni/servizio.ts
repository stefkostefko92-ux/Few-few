import { randomInt } from 'node:crypto';
import type { EsitoSegnalazione, Segnalazione } from '@prisma/client';
import { allarme } from '../allarmi/servizio.js';
import { writeAudit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import {
  segnalazioneConfermaMail,
  segnalazioneDecisioneMail,
  segnalazioneMasterMail,
  segnalazioneMotivazioneMail,
} from '../mail/templates-segnalazioni.js';
import { DAY } from '../time.js';
import type { DatiSegnalazione } from './form.js';

/**
 * Сигналите за незаконно съдържание и модерирането им (чл. 16–18 от Регламент (ЕС) 2022/2065; условията
 * 2026-11-13, чл. 25). Сигналът се записва, потвърждава се по имейл (чл. 16, пар. 4 — само с номера: адресът не е
 * проверен и порталът не праща чужд текст на трети лица) и чака MASTER — отговорника за модерирането. Решава
 * човек, без автоматични средства (чл. 25.4): решението носи мотиви до подателя (чл. 16, пар. 5), а при
 * премахване или ограничаване — мотивите по чл. 17, пар. 3 до администраторите на фирмата, без самоличността на
 * подателя. Самото премахване MASTER прави в портала, както всеки запис. Одит — без текст и без подателя.
 */

/** Колко се пази решен сигнал: 5 години за доказване при спор; неразгледаемият — 1 година (избор, не закон). */
export const ANNI_SEGNALAZIONE = 5;
export const GIORNI_NON_VALIDA = 365;
/** Таванът на денонощие за целия портал — срещу засипване на формата. */
export const MAX_AL_GIORNO = 200;

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const riferimento = (): string =>
  `SG-${Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')}`;

const conservaFino = (esito: EsitoSegnalazione, da: Date): Date =>
  new Date(
    da.getTime() + (esito === 'NON_VALIDA' ? GIORNI_NON_VALIDA : ANNI_SEGNALAZIONE * 365) * DAY,
  );

const indirizziMaster = async (): Promise<string[]> =>
  (
    await prisma.user.findMany({
      where: { master: true, deactivatedAt: null },
      select: { email: true },
    })
  ).map((m) => m.email);

async function invia(evento: string, id: string, lavoro: () => Promise<void>): Promise<void> {
  try {
    await lavoro();
  } catch (error) {
    logger.error({ evento, segnalazione: id, err: errorMessage(error) }, 'segnalazione: email');
  }
}

export async function registraSegnalazione(
  dati: DatiSegnalazione,
): Promise<{ ok: true; riferimento: string } | { ok: false; errore: 'troppe' }> {
  const now = new Date();
  const recenti = await prisma.segnalazione.count({
    where: { createdAt: { gt: new Date(now.getTime() - DAY) } },
  });
  if (recenti >= MAX_AL_GIORNO) return { ok: false, errore: 'troppe' };
  const s = await prisma.$transaction(async (tx) => {
    const riga = await tx.segnalazione.create({ data: { ...dati, riferimento: riferimento() } });
    await writeAudit(
      {
        actorId: null,
        action: 'SEGNALAZIONE_RICEVUTA',
        aziendaId: null,
        targetType: 'segnalazione',
        targetId: riga.id,
        meta: { minori: dati.minori },
      },
      tx,
    );
    return riga;
  });
  void allarme('segnalazione');
  void invia('segnalazione.mail_fallita', s.id, async () => {
    if (s.email) await sendMail(segnalazioneConfermaMail({ to: s.email, segnalazione: s }));
    const link = `${config().PUBLIC_BASE_URL}/master/segnalazioni/${s.id}`;
    for (const to of await indirizziMaster())
      await sendMail(segnalazioneMasterMail({ to, riferimento: s.riferimento, link }));
  });
  return { ok: true, riferimento: s.riferimento };
}

/**
 * Проверка по инициатива на доставчика (условията 2026-11-14, чл. 25.6; чл. 17 DSA): MASTER сам отваря случай за
 * съдържание или акаунт — без подател, без писмо за потвърждение — и го решава като сигнал, с мотивите до
 * фирмата (и при спиране или прекратяване на акаунт заради съдържанието му — чл. 17, пар. 1, б. „в“ и „г“).
 */
export async function registraIniziativa(
  actorId: string,
  dati: { dove: string; motivo: string },
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const riga = await tx.segnalazione.create({
      data: { ...dati, iniziativa: true, stato: 'IN_ESAME', riferimento: riferimento() },
    });
    await writeAudit(
      {
        actorId,
        action: 'SEGNALAZIONE_RICEVUTA',
        aziendaId: null,
        targetType: 'segnalazione',
        targetId: riga.id,
        meta: { iniziativa: true },
      },
      tx,
    );
    return riga.id;
  });
}

/** Отворените първи (най-старите отгоре), после решените. */
export async function elencoSegnalazioni() {
  const [aperte, chiuse] = await Promise.all([
    prisma.segnalazione.findMany({
      where: { stato: { in: ['RICEVUTA', 'IN_ESAME', 'RIESAME'] } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
    prisma.segnalazione.findMany({
      where: { stato: { in: ['DECISA', 'CHIUSA'] } },
      orderBy: { decisaAt: 'desc' },
      take: 100,
    }),
  ]);
  return { aperte, chiuse };
}

export const ESITI: readonly EsitoSegnalazione[] = [
  'RIMOSSO',
  'LIMITATO',
  'NESSUNA_AZIONE',
  'NON_VALIDA',
];

export interface Decisione {
  esito: EsitoSegnalazione;
  motivazione: string;
  aziendaId: string | null;
  misura: string | null;
  fatti: string | null;
  fondamento: string | null;
}

export type EsitoDecisione = 'ok' | 'assente' | 'giaDecisa' | 'azienda';

/** Решението на MASTER: веднъж; после — писмата до подателя и, при мярка, до администраторите на фирмата. */
export async function decidiSegnalazione(
  actorId: string,
  id: string,
  d: Decisione,
): Promise<EsitoDecisione> {
  const now = new Date();
  const misura = d.esito === 'RIMOSSO' || d.esito === 'LIMITATO';
  const esito = await prisma.$transaction(
    async (tx): Promise<EsitoDecisione | { s: Segnalazione; admin: string[] }> => {
      const azienda =
        misura && d.aziendaId
          ? await tx.azienda.findUnique({
              where: { id: d.aziendaId },
              select: { id: true, name: true },
            })
          : null;
      if (misura && d.aziendaId && !azienda) return 'azienda';
      const { count } = await tx.segnalazione.updateMany({
        where: { id, stato: { in: ['RICEVUTA', 'IN_ESAME'] } },
        data: {
          stato: 'DECISA',
          esito: d.esito,
          motivazione: d.motivazione,
          misura: misura ? d.misura : null,
          fatti: misura ? d.fatti : null,
          fondamento: misura ? d.fondamento : null,
          aziendaId: azienda?.id ?? null,
          aziendaNome: azienda?.name ?? null,
          decisaAt: now,
          decisaById: actorId,
          conservaFino: conservaFino(d.esito, now),
        },
      });
      if (count !== 1)
        return (await tx.segnalazione.count({ where: { id } })) === 0 ? 'assente' : 'giaDecisa';
      await writeAudit(
        {
          actorId,
          action: 'SEGNALAZIONE_DECISA',
          aziendaId: null,
          targetType: 'segnalazione',
          targetId: id,
          meta: { esito: d.esito },
        },
        tx,
      );
      const admin = azienda
        ? (
            await tx.membership.findMany({
              where: { aziendaId: azienda.id, role: 'ADMIN', user: { deactivatedAt: null } },
              select: { user: { select: { email: true } } },
            })
          ).map((m) => m.user.email)
        : [];
      return { s: await tx.segnalazione.findUniqueOrThrow({ where: { id } }), admin };
    },
  );
  if (typeof esito === 'string') return esito;
  const { s, admin } = esito;
  void invia('segnalazione.mail_fallita', s.id, async () => {
    if (s.email) await sendMail(segnalazioneDecisioneMail({ to: s.email, segnalazione: s }));
    for (const to of admin) await sendMail(segnalazioneMotivazioneMail({ to, segnalazione: s }));
  });
  return 'ok';
}

/** Прегледът по чл. 25.7: изходът му се записва, сигналът се затваря и срокът на пазене тече от него. */
export async function registraRiesame(
  actorId: string,
  id: string,
  esito: string,
): Promise<boolean> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const s = await tx.segnalazione.findUnique({ where: { id }, select: { esito: true } });
    if (!s?.esito) return false;
    const { count } = await tx.segnalazione.updateMany({
      where: { id, stato: { in: ['DECISA', 'RIESAME'] } },
      data: {
        stato: 'CHIUSA',
        riesameAt: now,
        riesameEsito: esito,
        conservaFino: conservaFino(s.esito, now),
      },
    });
    if (count !== 1) return false;
    await writeAudit(
      {
        actorId,
        action: 'SEGNALAZIONE_RIESAME',
        aziendaId: null,
        targetType: 'segnalazione',
        targetId: id,
      },
      tx,
    );
    return true;
  });
}

/** Чл. 18: кой орган е уведомен (записва се кога). */
export async function registraAutorita(id: string, autorita: string): Promise<boolean> {
  const { count } = await prisma.segnalazione.updateMany({
    where: { id },
    data: { autorita, autoritaAt: new Date() },
  });
  return count === 1;
}

/** Поддръжката: решените сигнали след срока им. Нерешен сигнал няма срок и не се трие. */
export async function pulisciSegnalazioni(now: Date = new Date()): Promise<number> {
  return (await prisma.segnalazione.deleteMany({ where: { conservaFino: { lt: now } } })).count;
}
