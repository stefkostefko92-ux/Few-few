import type { Request, Response } from 'express';
import { principalOf, safeNext } from '../auth/guards.js';
import { MESI_PROVA, scadenzaDopoMesi } from '../abbonamenti/regole.js';
import { datiSalvati } from '../aziende/dati.js';
import { prisma } from '../db.js';
import { amministratoriDi } from '../legale/accettazioni.js';
import type { Dichiarati } from '../legale/firma.js';
import { percorsoDaFirmare } from '../legale/percorsi.js';
import { daAccettare } from '../legale/stato.js';
import { versioneDaFirmare, VERSIONE } from '../legale/versioni.js';

/** Страницата за приемане (views/legale/accetta.ejs) — обща за двете стъпки при грешка. */
export const testo = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, 400) : '';

export interface FormAccetta {
  errori: Record<string, string>;
  valori: Partial<
    Record<'ragioneSociale' | 'sede' | 'partitaIva' | 'condizioni' | 'regole', string>
  >;
  errore: string | null;
}

/** Данните на фирмата за попълване: записаните в настройките (табелата), иначе името ѝ. */
async function proposti(aziendaId: string, nome: string): Promise<Partial<Dichiarati>> {
  const row = await prisma.azienda.findUnique({
    where: { id: aziendaId },
    select: { datiSocietari: true },
  });
  const dati = datiSalvati(row?.datiSocietari);
  return {
    ragioneSociale: dati?.ragioneSociale || nome,
    sede: dati?.indirizzo ?? '',
    partitaIva: dati?.partitaIva ?? '',
  };
}

/**
 * Пробният месец на новата фирма (чл. 12.2) — каже се на страницата преди подписа: ако фирмата е в пробен
 * период и още не е сключила договора, последният ден, ако подпише сега. Иначе null.
 */
async function provaDa(aziendaId: string): Promise<{ fine: Date } | null> {
  const [row, firmate] = await Promise.all([
    prisma.azienda.findUnique({ where: { id: aziendaId }, select: { abbonamentoProva: true } }),
    prisma.accettazione.count({ where: { aziendaId, tipo: 'CONDIZIONI' } }),
  ]);
  if (!row?.abbonamentoProva || firmate > 0) return null;
  return { fine: new Date(scadenzaDopoMesi(null, MESI_PROVA, new Date()).getTime() - 1) };
}

export async function renderAccetta(
  req: Request,
  res: Response,
  status: number,
  form: FormAccetta,
): Promise<void> {
  const stato = daAccettare(principalOf(req).user);
  const azienda = stato.azienda;
  const next = safeNext(
    req.method === 'GET' ? req.query.next : (req.body as { next?: unknown }).next,
  );
  res.status(status).render('legale/accetta', {
    stato,
    azienda: azienda?.name ?? '',
    amministratori:
      stato.condizioni === 'attendi' && azienda ? await amministratoriDi(azienda.id) : [],
    valori: {
      ...(stato.condizioni === 'accetta' && azienda
        ? await proposti(azienda.id, azienda.name)
        : {}),
      ...form.valori,
    },
    errori: form.errori,
    errore: form.errore,
    prova: stato.condizioni === 'accetta' && azienda ? await provaDa(azienda.id) : null,
    // Условията — във версията, която се подписва (в навечерието на версия, която влиза сама — тя).
    versione: { CONDIZIONI: versioneDaFirmare('CONDIZIONI'), REGOLE: VERSIONE.REGOLE },
    next,
    condizioniPath: percorsoDaFirmare(),
  });
}
