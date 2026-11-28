import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { nomeCsv, righeCsv } from '../http/csv.js';
import { DECISIONI, decidiContestazione } from '../pagamenti/contestazioni.js';
import { chiaveRegime } from '../pagamenti/importi.js';
import { avvisaNoteCredito, giornoDocumento, numeroDocumento } from '../pagamenti/note-credito.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { importoDa, segnaFatturato, segnaRimborsato } from '../pagamenti/rimborsi.js';
import { businessDay } from '../time.js';

/**
 * Счетоводната страна на плащанията в конзолата на MASTER (#31, одитът от 12 ноември 2026): отметката
 * „фактурирано“ (фактурата се издава извън портала, до 5 дни; номерът и датата ѝ — задължителни), изборът за
 * изгубен спор (кредитно известие или неплащане), отбелязването на върнатото (чл. 12.9) и
 * таблицата на плащанията за счетоводството (CSV). Само `aziende:manage`.
 */
export const masterPagamentiRegistroRouter: Router = Router();
const manage = requireCapability('aziende:manage');
const PATH = '/master/pagamenti';

masterPagamentiRegistroRouter.post(
  `${PATH}/:id/fatturato`,
  manage,
  requireCsrf,
  async (req, res) => {
    // Номерът и датата на фактурата — задължителни (кредитното известие ги съдържа — чл. 115, ал. 4 ЗДДС).
    const b = req.body as Record<string, unknown>;
    const numero = numeroDocumento(b.numero);
    const data = giornoDocumento(b.data);
    if (numero === null || data === null) {
      setFlash(res, 'error', 'pagamenti.master.fatturaNumeroErrore');
      return res.redirect(303, `${PATH}#h-fatturare`);
    }
    const ok = await segnaFatturato(principalOf(req).user.id, String(req.params.id), numero, data);
    if (ok) setFlash(res, 'ok', 'pagamenti.master.fatturato');
    res.redirect(303, `${PATH}#h-fatturare`);
  },
);

masterPagamentiRegistroRouter.post(
  `${PATH}/:id/rimborso`,
  manage,
  requireCsrf,
  async (req, res) => {
    const importo = importoDa((req.body as Record<string, unknown>).importo);
    if (importo === null || importo > 100_000_00) {
      setFlash(res, 'error', 'pagamenti.master.rimborsoErrore');
      return res.redirect(303, `${PATH}#h-rimborsi`);
    }
    const ok = await segnaRimborsato(principalOf(req).user.id, String(req.params.id), importo);
    if (ok) void avvisaNoteCredito();
    setFlash(
      res,
      ok ? 'ok' : 'error',
      ok ? 'pagamenti.master.rimborsato' : 'pagamenti.master.rimborsoErrore',
    );
    res.redirect(303, `${PATH}#h-rimborsi`);
  },
);

masterPagamentiRegistroRouter.post(
  `${PATH}/contestazioni/:id/decisione`,
  manage,
  requireCsrf,
  async (req, res) => {
    const scelta = (req.body as Record<string, unknown>).decisione;
    const decisione = DECISIONI.find((d) => d === scelta);
    const ok =
      decisione !== undefined &&
      (await decidiContestazione(principalOf(req).user.id, String(req.params.id), decisione));
    setFlash(
      res,
      ok ? 'ok' : 'error',
      ok ? 'rimborsi.contestazioni.decisa' : 'rimborsi.contestazioni.decisioneErrore',
    );
    res.redirect(303, `${PATH}#h-contestazioni`);
  },
);

masterPagamentiRegistroRouter.get(`${PATH}/esporta.csv`, manage, async (_req, res) => {
  const t = res.locals.t as (k: string, p?: Record<string, string | number>) => string;
  const fmt = res.locals.fmt as { dateTime: (d: Date) => string; dayRoma: (d: Date) => string };
  const righe = await prisma.pagamento.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 });
  const c = (k: string) => t(`pagamenti.master.csv.${k}`);
  const giorno = (d: Date | null) => (d ? fmt.dayRoma(d) : '');
  const csv = righeCsv(
    [
      c('creato'),
      c('completato'),
      c('stato'),
      c('ambiente'),
      c('azienda'),
      c('ragioneSociale'),
      c('sede'),
      c('partitaIva'),
      c('livello'),
      c('mesi'),
      c('dal'),
      c('al'),
      c('imponibile'),
      c('iva'),
      c('totale'),
      c('regime'),
      c('credito'),
      c('rimborso'),
      c('fatturato'),
      c('fattura'),
      c('fatturaData'),
      c('ordine'),
      c('vies'),
      c('viesData'),
    ],
    righe.map((p) => [
      fmt.dateTime(p.createdAt),
      p.completatoAt ? fmt.dateTime(p.completatoAt) : '',
      t(`pagamenti.master.statoPagamento.${p.stato}`),
      t(`pagamenti.master.ambiente.${p.ambiente}`),
      p.aziendaNome,
      p.ragioneSociale,
      p.sede,
      p.partitaIva,
      p.livello,
      p.mesi,
      giorno(p.inizio),
      giorno(p.fine ? new Date(p.fine.getTime() - 1) : null),
      formatoEuro(p.imponibileCent),
      formatoEuro(p.ivaCent),
      formatoEuro(p.totaleCent),
      t(`pagamenti.mail.regime.${chiaveRegime(p.regimeIva)}`),
      p.creditoCent > 0 ? formatoEuro(p.creditoCent) : '',
      p.rimborsoCent !== null ? formatoEuro(p.rimborsoCent) : '',
      giorno(p.fatturataAt),
      p.fatturaNumero ?? '',
      p.fatturaData ? fmt.dayRoma(p.fatturaData) : '',
      p.revolutOrderId ?? '',
      p.viesConsultazione ?? '',
      giorno(p.viesAt),
    ]),
  );
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nomeCsv('pagamenti', businessDay())}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(csv);
});
