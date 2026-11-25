import { personeOccupate } from '../abbonamenti/persone.js';
import { maxPersone, statoAbbonamento } from '../abbonamenti/regole.js';
import { prisma } from '../db.js';
import { versioneContratto } from '../legale/versioni.js';
import { offertaDi } from './offerta.js';
import { periodoDi } from './periodo.js';
import { situazioneDi } from './situazione.js';

/**
 * Офертата за показване и за записа (условията, чл. 12.1) — от плана и от фирмата сега: заетите места, периодът
 * (pagamenti/periodo.ts) и режимът на ДДС. Страницата я показва, `avviaPagamento` (servizio.ts) я смята наново и
 * запечатва само ако е същата, която човекът е видял.
 */
type T = (key: string, p?: Record<string, string | number>) => string;

export interface Dichiarati {
  ragioneSociale: string;
  sede: string;
  partitaIva: { numero: string; paese: string };
}

/**
 * `senzaVies`: номерът на фирма извън България не е валиден във VIES — офертата е с 20 % български ДДС (чл. 12.10).
 */
export async function preparaOfferta(
  t: T,
  user: { email: string },
  aziendaId: string,
  piano: { livello: number; mesi: number; prezzoCent: number },
  dichiarati: Dichiarati,
  now: Date = new Date(),
  senzaVies = false,
) {
  const azienda = await prisma.azienda.findUniqueOrThrow({
    where: { id: aziendaId },
    select: { name: true, condizioniVersione: true },
  });
  const [posti, { campi, segmenti }] = await Promise.all([
    personeOccupate(prisma, aziendaId, now),
    situazioneDi(prisma, aziendaId, now),
  ]);
  const occupati = posti.membri + posti.inviti;
  const periodo = periodoDi(campi, segmenti, piano, now);
  const max = maxPersone(piano.livello);
  const basta = max === null || occupati <= max;
  if (!periodo.ok)
    return { azienda, campi, occupati, basta, errore: periodo.errore, offerta: null };
  const offerta = offertaDi(t, {
    ...dichiarati,
    senzaVies,
    ...piano,
    utentiAttuali: occupati,
    email: user.email,
    versione: versioneContratto(azienda.condizioniVersione),
    periodo,
    dopoProva: statoAbbonamento(campi, now).tipo === 'prova',
  });
  return { azienda, campi, occupati, basta, errore: null, offerta, periodo };
}
