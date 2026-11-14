import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { nomeCsv, righeCsv } from '../http/csv.js';
import { setFlash } from '../http/flash.js';
import { salvaIva } from '../pagamenti/config.js';
import { chiaveRegime } from '../pagamenti/importi.js';
import { numeroDocumento, segnaNotaEmessa, tutteLeNoteCredito } from '../pagamenti/note-credito.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { importoDa } from '../pagamenti/rimborsi.js';
import { businessDay } from '../time.js';

/**
 * ДДС-ът и кредитните известия в „Pagamenti“ на MASTER (версия 4.1; условията 2026-11-14, чл. 12.9–12.10): ключът
 * за продажбата с български ДДС при номер извън VIES и другите продажби за прага; отбелязването на издадено
 * кредитно известие (издава се извън портала) и таблицата им за счетоводството. Само `aziende:manage`.
 */
export const masterPagamentiIvaRouter: Router = Router();
const manage = requireCapability('aziende:manage');
const PATH = '/master/pagamenti';

masterPagamentiIvaRouter.post(`${PATH}/iva`, manage, requireCsrf, async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const importo = (v: unknown) => {
    const raw = typeof v === 'string' ? v.trim() : '';
    return raw === '' ? 0 : importoDa(raw);
  };
  const altre = importo(b.altre);
  const precedente = importo(b.altrePrecedente);
  if (altre === null || precedente === null) {
    setFlash(res, 'error', 'vies.master.ivaErrore');
    return res.redirect(303, `${PATH}#h-iva`);
  }
  await salvaIva(principalOf(req).user.id, {
    senzaVies: b.senzaVies === '1',
    altreVenditeUeCent: altre,
    altreVenditeUePrecCent: precedente,
  });
  setFlash(res, 'ok', 'vies.master.ivaSalvato');
  res.redirect(303, `${PATH}#h-iva`);
});

/** Денят на документа („2026-11-14“) — не в бъдещето и не преди портала. */
function giornoDocumento(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw >= '2026-01-01' && raw <= businessDay() ? d : null;
}

masterPagamentiIvaRouter.post(
  `${PATH}/note-credito/:id/emessa`,
  manage,
  requireCsrf,
  async (req, res) => {
    const b = req.body as Record<string, unknown>;
    const numero = numeroDocumento(b.numero);
    const giorno = giornoDocumento(b.data);
    const ok =
      numero !== null &&
      giorno !== null &&
      (await segnaNotaEmessa(principalOf(req).user.id, String(req.params.id), numero, giorno));
    setFlash(
      res,
      ok ? 'ok' : 'error',
      ok ? 'rimborsi.note.flash.ok' : 'rimborsi.note.flash.errore',
    );
    res.redirect(303, `${PATH}#h-note`);
  },
);

masterPagamentiIvaRouter.get(`${PATH}/note-credito.csv`, manage, async (_req, res) => {
  const t = res.locals.t as (k: string, p?: Record<string, string | number>) => string;
  const fmt = res.locals.fmt as { dayRoma: (d: Date) => string };
  const c = (k: string) => t(`rimborsi.note.csv.${k}`);
  const righe = await tutteLeNoteCredito();
  const csv = righeCsv(
    [
      c('evento'),
      c('entro'),
      c('origine'),
      c('azienda'),
      c('ragioneSociale'),
      c('partitaIva'),
      c('fattura'),
      c('imponibile'),
      c('iva'),
      c('totale'),
      c('regime'),
      c('numero'),
      c('emessa'),
    ],
    righe.map((n) => [
      fmt.dayRoma(n.eventoAt),
      fmt.dayRoma(n.entroIl),
      t(`rimborsi.note.origine.${n.origine}`),
      n.pagamento.aziendaNome,
      n.pagamento.ragioneSociale,
      n.pagamento.partitaIva,
      n.pagamento.fatturaNumero ?? '',
      formatoEuro(n.imponibileCent),
      formatoEuro(n.ivaCent),
      formatoEuro(n.totaleCent),
      t(`pagamenti.mail.regime.${chiaveRegime(n.pagamento.regimeIva)}`),
      n.numero ?? '',
      n.emessaAt ? fmt.dayRoma(n.emessaAt) : '',
    ]),
  );
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nomeCsv('note-di-credito', businessDay())}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(csv);
});
