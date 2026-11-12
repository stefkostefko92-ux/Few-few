import { Router, type Request, type Response } from 'express';
import { principalOf, requireCsrf, requireUser, sendError } from '../auth/guards.js';
import { datiSalvati } from '../aziende/dati.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { writeLimiter } from '../http/limits.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { clienteAttivo } from '../pagamenti/config.js';
import { partitaIvaDa } from '../pagamenti/importi.js';
import { riconcilia } from '../pagamenti/riconcilia.js';
import { avviaPagamento, preparaOfferta, type Dichiarati } from '../pagamenti/servizio.js';

/**
 * Плащането на план от администратора на фирмата (#31; условията 2026-11-12, чл. 12): офертата с данните за
 * фактурата (попълнени от настройките, поправими тук — и изтекла фирма купува, чл. 12.5 d), отметката, после
 * Revolut; връщането — сверката с Revolut. Само ADMIN на активна фирма; чужда фирма или план — 404.
 */
export const abbonamentoPagamentoRouter: Router = Router();
const BASE = '/impostazioni/abbonamento';

const notFound = (req: Request, res: Response) =>
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');

/** Фирмата, ако човекът е неин ADMIN и тя е активна; иначе null. */
async function aziendaAdmin(req: Request, raw: unknown) {
  const user = principalOf(req).user;
  const id = typeof raw === 'string' ? raw : '';
  const m = user.memberships.find(
    (x) => x.aziendaId === id && x.role === 'ADMIN' && !x.soloEsportazione,
  );
  if (!m) return null;
  return prisma.azienda.findFirst({
    where: { id, deactivatedAt: null },
    select: { id: true, name: true, datiSocietari: true, abbonamentoFino: true },
  });
}

const testo = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

function leggiDichiarati(body: Record<string, unknown>) {
  const errori: Record<string, string> = {};
  const ragioneSociale = testo(body.ragioneSociale, 200);
  const sede = testo(body.sede, 300);
  const partitaIva = partitaIvaDa(body.partitaIva);
  if (ragioneSociale.length < 2) errori.ragioneSociale = 'pagamenti.errore.ragioneSociale';
  if (sede.length < 5) errori.sede = 'pagamenti.errore.sede';
  if (!partitaIva) errori.partitaIva = 'pagamenti.errore.partitaIva';
  if (body.accetto !== 'si') errori.accetto = 'pagamenti.errore.accetto';
  const valori = {
    ragioneSociale,
    sede,
    partitaIva: typeof body.partitaIva === 'string' ? body.partitaIva.slice(0, 40) : '',
  };
  return {
    errori,
    valori,
    dichiarati: partitaIva ? ({ ragioneSociale, sede, partitaIva } satisfies Dichiarati) : null,
  };
}

async function vistaOfferta(
  req: Request,
  res: Response,
  status: number,
  azienda: NonNullable<Awaited<ReturnType<typeof aziendaAdmin>>>,
  piano: { id: string; livello: number; mesi: number; prezzoCent: number },
  valori: { ragioneSociale: string; sede: string; partitaIva: string },
  errori: Record<string, string>,
  errore: string | null = null,
): Promise<void> {
  const t = res.locals.t as (k: string, p?: Record<string, string | number>) => string;
  const user = principalOf(req).user;
  // L'anteprima: con una P. IVA non valida si mostra come per l'Italia — la conferma la ricontrolla.
  const piva = partitaIvaDa(valori.partitaIva) ?? { numero: valori.partitaIva, paese: 'IT' };
  const { offerta, occupati, basta } = await preparaOfferta(t, user, azienda.id, piano, {
    ragioneSociale: valori.ragioneSociale || azienda.name,
    sede: valori.sede || '—',
    partitaIva: piva,
  });
  res.set('Cache-Control', 'no-store');
  res.status(status).render('impostazioni/offerta', {
    azienda,
    piano,
    offerta,
    totale: formatoEuro(offerta.importo.totale),
    valori,
    errori,
    errore: errore ?? (basta ? null : 'pagamenti.errore.persone'),
    occupati,
  });
}

abbonamentoPagamentoRouter.get(`${BASE}/offerta`, requireUser, async (req, res) => {
  const azienda = await aziendaAdmin(req, req.query.azienda);
  const piano =
    typeof req.query.piano === 'string'
      ? await prisma.pianoAbbonamento.findFirst({ where: { id: req.query.piano, attivo: true } })
      : null;
  if (!azienda || !piano || !azienda.abbonamentoFino || !(await clienteAttivo()))
    return notFound(req, res);
  const dati = datiSalvati(azienda.datiSocietari);
  await vistaOfferta(
    req,
    res,
    200,
    azienda,
    piano,
    {
      ragioneSociale: dati?.ragioneSociale || azienda.name,
      sede: dati?.indirizzo ?? '',
      partitaIva: dati?.partitaIva ?? '',
    },
    {},
  );
});

abbonamentoPagamentoRouter.post(
  `${BASE}/paga`,
  requireUser,
  writeLimiter,
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const azienda = await aziendaAdmin(req, body.azienda);
    const piano =
      typeof body.piano === 'string'
        ? await prisma.pianoAbbonamento.findFirst({ where: { id: body.piano, attivo: true } })
        : null;
    if (!azienda || !piano || !azienda.abbonamentoFino || !(await clienteAttivo()))
      return notFound(req, res);
    const { errori, valori, dichiarati } = leggiDichiarati(body);
    if (Object.keys(errori).length > 0 || !dichiarati)
      return vistaOfferta(req, res, 422, azienda, piano, valori, errori, 'pagamenti.errore.titolo');
    const t = res.locals.t as (k: string, p?: Record<string, string | number>) => string;
    const esito = await avviaPagamento(t, principalOf(req).user, azienda.id, piano.id, dichiarati, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    if (esito.ok) return res.redirect(303, esito.checkoutUrl);
    if (esito.errore === 'spenti' || esito.errore === 'piano') return notFound(req, res);
    return vistaOfferta(
      req,
      res,
      esito.errore === 'persone' ? 422 : 503,
      azienda,
      piano,
      valori,
      {},
      esito.errore === 'persone' ? 'pagamenti.errore.persone' : 'pagamenti.errore.revolut',
    );
  },
);

abbonamentoPagamentoRouter.get(`${BASE}/esito/:id`, requireUser, async (req, res) => {
  const p = await prisma.pagamento.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, aziendaId: true },
  });
  const azienda = p ? await aziendaAdmin(req, p.aziendaId) : null;
  if (!p || !azienda) return notFound(req, res);
  const stato = await riconcilia(p.id);
  if (stato === 'COMPLETATO') {
    const a = await prisma.azienda.findUniqueOrThrow({
      where: { id: azienda.id },
      select: { abbonamentoFino: true },
    });
    const fine = a.abbonamentoFino ? new Date(a.abbonamentoFino.getTime() - 1) : new Date();
    setFlash(res, 'ok', 'pagamenti.esito.completato', {
      data: new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(fine),
    });
  } else if (stato === 'IN_ATTESA') {
    setFlash(res, 'info', 'pagamenti.esito.attesa');
  } else {
    setFlash(res, 'error', 'pagamenti.esito.fallito');
  }
  res.redirect(303, `${BASE}?azienda=${encodeURIComponent(azienda.id)}`);
});
