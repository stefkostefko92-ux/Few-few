import { Router, type Request, type Response } from 'express';
import { personeOccupate } from '../abbonamenti/persone.js';
import { LIVELLI, statoAbbonamento, type CampiAbbonamento } from '../abbonamenti/regole.js';
import { principalOf, requireUser, sendError } from '../auth/guards.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { clienteAttivo } from '../pagamenti/config.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { periodoDi } from '../pagamenti/periodo.js';
import { pianiAttivi } from '../pagamenti/piani.js';
import { situazioneDi } from '../pagamenti/situazione.js';
import type { SessionUser } from '../types.js';
import { ICONE_SEZIONI, sezioniDi } from './impostazioni-vista.js';

/**
 * „Abbonamento“ в настройките (#31, #33): състоянието (без срок, пробен месец, платен, изтекъл), нивата по брой
 * хора и заетите места. Не по способност (`aziende:settings`), а по роля ADMIN във фирмата: изтеклата фирма няма
 * способности за писане, но администраторът ѝ трябва да види състоянието и да поднови. MASTER — всички фирми.
 */
export const impostazioniAbbonamentoRouter: Router = Router();
const PATH = '/impostazioni/abbonamento';

/** Фирмите, чийто абонамент човекът вижда: MASTER — всички активни; иначе — където е ADMIN. */
function aziendeAbbonamento(user: SessionUser) {
  const ids = user.memberships
    .filter((m) => m.role === 'ADMIN' && !m.soloEsportazione)
    .map((m) => m.aziendaId);
  return prisma.azienda.findMany({
    where: { deactivatedAt: null, ...(user.master ? {} : { id: { in: ids } }) },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      preventiviAttivi: true,
      abbonamentoFino: true,
      abbonamentoProva: true,
      abbonamentoLivello: true,
      abbonamentoCambioAt: true,
      abbonamentoCambioLivello: true,
    },
  });
}

/** Редът на картата „Abbonamento“ в `/impostazioni`. */
export function rigaAbbonamento(
  azienda: CampiAbbonamento,
  t: (key: string, p?: Record<string, string | number>) => string,
  giorno: (d: Date) => string,
): string {
  const s = statoAbbonamento(azienda, new Date());
  const fine = s.fino ? giorno(new Date(s.fino.getTime() - 1)) : '';
  return t(`abbonamento.hub.${s.tipo}`, { data: fine, livello: s.livello ?? '' });
}

async function render(req: Request, res: Response): Promise<void> {
  const user = principalOf(req).user;
  const aziende = await aziendeAbbonamento(user);
  const wanted = typeof req.query.azienda === 'string' ? req.query.azienda : null;
  const azienda = wanted ? aziende.find((a) => a.id === wanted) : aziende[0];
  if (!azienda) {
    sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    return;
  }
  const now = new Date();
  const stato = statoAbbonamento(azienda, now);
  const posti = await personeOccupate(prisma, azienda.id, now);
  const occupati = posti.membri + posti.inviti;
  // Плановете — само на ADMIN на фирмата (MASTER не плаща), при включени плащания и при фирма със срок
  // („без срок“ остава така, докато MASTER реши — чл. 12.8).
  const admin = user.memberships.some(
    (m) => m.aziendaId === azienda.id && m.role === 'ADMIN' && !m.soloEsportazione,
  );
  const vendibile = admin && azienda.abbonamentoFino && (await clienteAttivo());
  const situazione = vendibile ? await situazioneDi(prisma, azienda.id, now) : null;
  const piani = situazione
    ? (await pianiAttivi()).map((p) => {
        const max = LIVELLI[p.livello as keyof typeof LIVELLI];
        const periodo = periodoDi(situazione.campi, situazione.segmenti, p, now);
        return {
          id: p.id,
          livello: p.livello,
          mesi: p.mesi,
          max,
          prezzo: formatoEuro(p.prezzoCent),
          basta: max === null || occupati <= max,
          // По-високо ниво при период, даден на ръка — само чрез MASTER (не се смята онлайн).
          manuale: !periodo.ok && periodo.errore === 'manuale',
          // Вече има купен план в опашка: същото или по-ниско ниво — след началото му (чл. 12.3).
          inCoda: !periodo.ok && periodo.errore === 'inCoda',
        };
      })
    : null;
  res.render('impostazioni/sezione', {
    sezione: 'abbonamento',
    // Изтекла фирма: другите раздели са само за четене — тук и износът стигат.
    sezioni: stato.solaLettura ? ['abbonamento', 'esportazione'] : sezioniDi(azienda),
    senzaPanoramica: stato.solaLettura,
    icone: ICONE_SEZIONI,
    aziende,
    azienda,
    error: null,
    abbonamento: {
      stato,
      ultimoGiorno: stato.fino ? new Date(stato.fino.getTime() - 1) : null,
      posti,
      livelli: Object.entries(LIVELLI).map(([n, max]) => ({ n: Number(n), max })),
      contatto: config().CONTACT_EMAIL,
      piani,
      occupati,
    },
  });
}

impostazioniAbbonamentoRouter.get(PATH, requireUser, render);
