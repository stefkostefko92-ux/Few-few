import type { TipoAvvisoStato } from '@prisma/client';
import { mailEnabled } from '../mail/posta.js';
import { prisma } from '../db.js';
import { esitoCoda, type Esito } from '../master/sistema.js';
import { DAY } from '../time.js';

/**
 * Какво казва публичната страница `/stato` (условията 2027-01-12, чл. 2.4): частите на услугата сега,
 * прекъсванията в ход, планираната поддръжка, историята от 90 дни и целите за възстановяване. Проверките са
 * само думи (никакви числа, пътища и имена отвътре) и се помнят 30 секунди — публична страница не бива да
 * товари базата. Целите са организационни, не гарантирани (чл. 2.4, чл. 8).
 */

/** Колко данни най-много може да се загубят: интервалът между две ежедневни копия (deploy/backup.sh). */
export const RPO_ORE = 24;
/** За колко време организацията на доставчика цели да върне услугата — казано на страницата (чл. 2.4). */
export const RTO_ORE = 8;
export const GIORNI_STORICO = 90;

export interface Componente {
  chiave: string;
  esito: Esito;
  /** Без нея няма услуга (порталът, базата); другите (снимките, писмата) спират само себе си. */
  critico?: boolean;
}

export interface AvvisoVista {
  id: string;
  tipo: TipoAvvisoStato;
  titolo: string;
  testo: string;
  inizio: Date;
  fine: Date | null;
}

export type StatoGenerale = 'ok' | 'parziale' | 'manutenzione' | 'interruzione';

/** В ход (започнали и без край или с край напред), планирани (напред), минали (до 90 дни назад). */
export function classifica(avvisi: readonly AvvisoVista[], now: Date) {
  const t = now.getTime();
  const inCorso = avvisi.filter(
    (a) => a.inizio.getTime() <= t && (!a.fine || a.fine.getTime() > t),
  );
  const programmate = avvisi
    .filter((a) => a.inizio.getTime() > t)
    .sort((a, b) => a.inizio.getTime() - b.inizio.getTime());
  const storico = avvisi
    .filter((a) => a.fine && a.fine.getTime() <= t && t - a.fine.getTime() <= GIORNI_STORICO * DAY)
    .sort((a, b) => b.inizio.getTime() - a.inizio.getTime());
  inCorso.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'INTERRUZIONE' ? -1 : 1));
  return { inCorso, programmate, storico };
}

/**
 * Общото: прекъсване в ход или червена основна част — „interruzione“; поддръжка в ход; иначе червена или жълта
 * друга част — „parziale“.
 */
export function statoGenerale(
  componenti: readonly Componente[],
  inCorso: readonly AvvisoVista[],
): StatoGenerale {
  if (
    inCorso.some((a) => a.tipo === 'INTERRUZIONE') ||
    componenti.some((c) => c.critico && c.esito === 'errore')
  )
    return 'interruzione';
  if (inCorso.some((a) => a.tipo === 'MANUTENZIONE')) return 'manutenzione';
  if (componenti.some((c) => c.esito !== 'ok')) return 'parziale';
  return 'ok';
}

let memoria: { at: number; componenti: Componente[] } | null = null;

/** Частите на услугата за публиката: порталът, данните, снимките и клиповете, писмата. */
export async function componenti(now: Date = new Date()): Promise<Componente[]> {
  if (memoria && now.getTime() - memoria.at < 30_000) return memoria.componenti;
  const [db, coda] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    prisma.allegato.findFirst({
      where: { stato: { in: ['IN_CODA', 'IN_LAVORAZIONE'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);
  const piuVecchio =
    coda.status === 'fulfilled' && coda.value
      ? now.getTime() - coda.value.createdAt.getTime()
      : null;
  const risultato: Componente[] = [
    { chiave: 'portale', esito: 'ok', critico: true },
    { chiave: 'dati', esito: db.status === 'fulfilled' ? 'ok' : 'errore', critico: true },
    // Опашката: без грешките на отделни файлове (те са на файла, не на услугата).
    { chiave: 'foto', esito: coda.status === 'fulfilled' ? esitoCoda(piuVecchio, 0) : 'errore' },
    { chiave: 'email', esito: mailEnabled() ? 'ok' : 'errore' },
  ];
  memoria = { at: now.getTime(), componenti: risultato };
  return risultato;
}

/** Съобщенията за страницата: в ход, планирани и от последните 90 дни. */
export function avvisiPubblici(now: Date = new Date()): Promise<AvvisoVista[]> {
  return prisma.avvisoStato.findMany({
    where: {
      OR: [{ fine: null }, { fine: { gte: new Date(now.getTime() - GIORNI_STORICO * DAY) } }],
    },
    orderBy: { inizio: 'desc' },
    select: { id: true, tipo: true, titolo: true, testo: true, inizio: true, fine: true },
    take: 200,
  });
}

/** За тестовете: следващата проверка не идва от паметта. */
export const dimenticaComponenti = (): void => {
  memoria = null;
};
