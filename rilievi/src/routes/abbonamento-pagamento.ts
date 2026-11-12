import { Router, type Request, type Response } from 'express';
import { principalOf, requireCsrf, requireUser, sendError } from '../auth/guards.js';
import { datiSalvati } from '../aziende/dati.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { ritornoLimiter, writeLimiter } from '../http/limits.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { clienteAttivo } from '../pagamenti/config.js';
import { partitaIvaDa } from '../pagamenti/importi.js';
import { riconcilia } from '../pagamenti/riconcilia.js';
import { daPeriodo } from '../pagamenti/situazione.js';
import { config } from '../config.js';
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
  // Прегледът: с невалиден ДДС номер — като за Италия; потвърждението го проверява и сверява отпечатъка.
  const piva = partitaIvaDa(valori.partitaIva) ?? { numero: valori.partitaIva, paese: 'IT' };
  const pronta = await preparaOfferta(t, user, azienda.id, piano, {
    ragioneSociale: valori.ragioneSociale || azienda.name,
    sede: valori.sede || '—',
    partitaIva: piva,
  });
  if (!pronta.offerta) {
    // План в опашка или период, даден на ръка: тук не се купува — разделът казва защо.
    setFlash(res, 'info', `pagamenti.errore.${pronta.errore}`, { email: config().CONTACT_EMAIL });
    return res.redirect(303, `${BASE}?azienda=${encodeURIComponent(azienda.id)}`);
  }
  const cli = await clienteAttivo();
  res.set('Cache-Control', 'no-store');
  res.status(status).render('impostazioni/offerta', {
    azienda,
    piano,
    offerta: pronta.offerta,
    totale: formatoEuro(pronta.offerta.importo.totale),
    valori,
    errori,
    errore: errore ?? (pronta.basta ? null : 'pagamenti.errore.persone'),
    occupati: pronta.occupati,
    sandboxProva: cli !== null && !daPeriodo(cli.ambiente),
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
    const esito = await avviaPagamento(
      t,
      principalOf(req).user,
      azienda.id,
      piano.id,
      dichiarati,
      { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      typeof body.hash === 'string' ? body.hash : '',
    );
    if (esito.ok) return res.redirect(303, esito.checkoutUrl);
    if (esito.errore === 'spenti' || esito.errore === 'piano') return notFound(req, res);
    const [status, chiave] =
      esito.errore === 'cambiata'
        ? [409, 'pagamenti.errore.cambiata']
        : esito.errore === 'persone'
          ? [422, 'pagamenti.errore.persone']
          : esito.errore === 'revolut'
            ? [503, 'pagamenti.errore.revolut']
            : [409, `pagamenti.errore.${esito.errore}`];
    return vistaOfferta(req, res, status, azienda, piano, valori, {}, chiave);
  },
);

// Връщането от Revolut пита Revolut — с таван, за да не изяде лимита на акаунта.
abbonamentoPagamentoRouter.get(
  `${BASE}/esito/:id`,
  requireUser,
  ritornoLimiter,
  async (req, res) => {
    const p = await prisma.pagamento.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, aziendaId: true },
    });
    const azienda = p ? await aziendaAdmin(req, p.aziendaId) : null;
    if (!p || !azienda) return notFound(req, res);
    const stato = await riconcilia(p.id);
    if (stato === 'COMPLETATO') {
      const fatto = await prisma.pagamento.findUniqueOrThrow({
        where: { id: p.id },
        select: { inizio: true, fine: true, ambiente: true },
      });
      const giorno = (d: Date) =>
        new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(d);
      const fine = giorno(new Date((fatto.fine ?? new Date()).getTime() - 1));
      if (!daPeriodo(fatto.ambiente)) setFlash(res, 'info', 'pagamenti.esito.prova');
      else if (fatto.inizio && fatto.inizio.getTime() > Date.now())
        setFlash(res, 'ok', 'pagamenti.esito.completatoCoda', {
          inizio: giorno(fatto.inizio),
          data: fine,
        });
      else setFlash(res, 'ok', 'pagamenti.esito.completato', { data: fine });
    } else if (stato === 'IN_ATTESA') {
      setFlash(res, 'info', 'pagamenti.esito.attesa');
    } else {
      setFlash(res, 'error', 'pagamenti.esito.fallito');
    }
    res.redirect(303, `${BASE}?azienda=${encodeURIComponent(azienda.id)}`);
  },
);
