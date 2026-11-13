import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { eliminazioneIl } from '../aziende/eliminazione.js';
import { COMPANY } from '../company.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { registroTrattamenti } from '../legale/registro-trattamenti.js';
import { inputRoma } from '../master/tempo.js';
import {
  aggiornaViolazione,
  creaViolazione,
  elencoViolazioni,
  leggiViolazioneSalvata,
} from '../master/violazioni.js';
import {
  CAMPI_VIOLAZIONE,
  leggiViolazione,
  RISCHI,
  RUOLI,
  scadenza72h,
  type DatiViolazione,
} from '../master/violazioni-form.js';

/**
 * Регистрите по GDPR в конзолата на MASTER (собственикът, 12 ноември 2026 — точка A6): `/master/registri` —
 * регистърът на дейностите (чл. 30(1) и (2)) с фирмите-администратори живо от базата, за печат;
 * `/master/violazioni` — регистърът на нарушенията (чл. 33(5)), записи и промени, без триене.
 */
export const masterRegistriRouter: Router = Router();
const manage = requireCapability('aziende:manage');

/** Фирмите-администратори: декларираното при приемането, администраторите, версията и състоянието. */
async function titolari(now = new Date()) {
  const [aziende, accettazioni] = await Promise.all([
    prisma.azienda.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        deactivatedAt: true,
        cambioFineAt: true,
        memberships: {
          where: { role: 'ADMIN', user: { deactivatedAt: null } },
          select: { user: { select: { email: true } } },
        },
      },
    }),
    prisma.accettazione.findMany({
      where: { tipo: 'CONDIZIONI', aziendaId: { not: null } },
      orderBy: { at: 'desc' },
      distinct: ['aziendaId'],
      select: {
        aziendaId: true,
        at: true,
        versione: true,
        ragioneSociale: true,
        sede: true,
        partitaIva: true,
      },
    }),
  ]);
  const perAzienda = new Map(accettazioni.map((a) => [a.aziendaId, a]));
  return aziende.map((a) => ({
    nome: a.name,
    admin: a.memberships.map((m) => m.user.email),
    accettazione: perAzienda.get(a.id) ?? null,
    stato: a.deactivatedAt
      ? ('recupero' as const)
      : a.cambioFineAt && a.cambioFineAt > now
        ? ('transizione' as const)
        : ('attiva' as const),
    fino: a.deactivatedAt ? eliminazioneIl(a.deactivatedAt) : null,
  }));
}

masterRegistriRouter.get('/master/registri', manage, async (_req, res) => {
  res.set('Cache-Control', 'no-store').render('master/registri', {
    registro: registroTrattamenti(),
    titolari: await titolari(),
    contatto: config().CONTACT_EMAIL,
    company: COMPANY,
  });
});

masterRegistriRouter.get('/master/violazioni', manage, async (_req, res) => {
  const righe = await elencoViolazioni();
  res.set('Cache-Control', 'no-store').render('master/violazioni', {
    righe: righe.map((r) => ({ ...r, scadenza: scadenza72h(r.rilevataAt) })),
  });
});

type Valori = Record<keyof DatiViolazione, string>;

/** Записаното (или нищо) като стойности на формата — часовете по Рим. */
function valoriDi(dati: Partial<Record<keyof DatiViolazione, unknown>>): Valori {
  return Object.fromEntries(
    CAMPI_VIOLAZIONE.map((k) => {
      const v = dati[k];
      return [k, v instanceof Date ? inputRoma(v) : typeof v === 'string' ? v : ''];
    }),
  ) as Valori;
}

function renderForm(
  res: Response,
  status: number,
  view: {
    id: string | null;
    valori: Valori;
    errori?: Partial<Record<string, true>>;
    meta?: { createdAt: Date; autore: string | null };
  },
): void {
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .render('master/violazione', {
      errori: {},
      meta: null,
      rischi: RISCHI,
      ruoli: RUOLI,
      ...view,
    });
}

const notFound = (req: Request, res: Response) =>
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');

masterRegistriRouter.get('/master/violazioni/nuova', manage, (_req, res) => {
  renderForm(res, 200, {
    id: null,
    valori: valoriDi({ rilevataAt: new Date(), ruolo: 'RESPONSABILE', rischio: 'RISCHIO' }),
  });
});

masterRegistriRouter.post('/master/violazioni', manage, requireCsrf, async (req, res) => {
  const esito = leggiViolazione(req.body);
  if (!esito.ok) {
    return renderForm(res, 422, {
      id: null,
      valori: valoriDi(req.body as Record<string, unknown>),
      errori: esito.errori,
    });
  }
  const id = await creaViolazione(principalOf(req).user, esito.dati);
  setFlash(res, 'ok', 'master.violazioni.flash.creata');
  res.redirect(303, `/master/violazioni/${id}`);
});

masterRegistriRouter.get('/master/violazioni/:id', manage, async (req, res) => {
  const riga = await leggiViolazioneSalvata(String(req.params.id));
  if (!riga) return notFound(req, res);
  renderForm(res, 200, {
    id: riga.id,
    valori: valoriDi(riga),
    meta: { createdAt: riga.createdAt, autore: riga.autore?.name ?? null },
  });
});

masterRegistriRouter.post('/master/violazioni/:id', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const riga = await leggiViolazioneSalvata(id);
  if (!riga) return notFound(req, res);
  const esito = leggiViolazione(req.body);
  if (!esito.ok) {
    return renderForm(res, 422, {
      id,
      valori: valoriDi(req.body as Record<string, unknown>),
      errori: esito.errori,
      meta: { createdAt: riga.createdAt, autore: riga.autore?.name ?? null },
    });
  }
  await aggiornaViolazione(principalOf(req).user, id, esito.dati);
  setFlash(res, 'ok', 'master.violazioni.flash.salvata');
  res.redirect(303, `/master/violazioni/${id}`);
});
