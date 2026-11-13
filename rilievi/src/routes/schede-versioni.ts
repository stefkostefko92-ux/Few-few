import { Router, type Response } from 'express';
import { requireCapability } from '../auth/guards.js';
import { nomeModulo } from '../ordini/moduli.js';
import { SLOTS } from '../ordini/registry.js';
import { fieldByKey } from '../schede/fields.js';
import { displayValue, schedaTitle } from '../schede/format.js';
import {
  differenze,
  elencoVersioni,
  versioneConPrecedente,
  type Istantanea,
} from '../schede/versioni.js';
import { loadScheda, notFound } from './schede-shared.js';

/**
 * Версиите на картата (точка C4; schede/versioni.ts): списъкът и разликите на една версия спрямо
 * предишната — полето по името си, „преди“ и „после“ като на страницата на картата; модулите и мерките —
 * с името си. Вижда ги, който вижда картата.
 */
export const schedeVersioniRouter: Router = Router();
const read = requireCapability('schede:read');

/** Колоната на модул → името му. */
const MODULI = new Map(SLOTS.map((s) => [String(s.column), nomeModulo(s.modulo)]));

function righeDiff(res: Response, prima: Istantanea | null, dopo: Istantanea) {
  const { t, fmt } = res.locals;
  return differenze(prima, dopo).map((d) => {
    const field = fieldByKey(d.key);
    if (field) {
      const viva = (v: unknown) =>
        field.kind === 'date' && typeof v === 'string' ? new Date(v) : v;
      return {
        etichetta: t(`scheda.field.${d.key}`),
        prima: displayValue(field, viva(d.prima), t, fmt) || t('flusso.versioni.vuoto'),
        dopo: displayValue(field, viva(d.dopo), t, fmt) || t('flusso.versioni.vuoto'),
        dettaglio: false,
      };
    }
    const etichetta =
      d.key === 'misureBottoniere'
        ? t('flusso.versioni.misure')
        : MODULI.has(d.key)
          ? `${t('flusso.versioni.modulo')}: ${MODULI.get(d.key)}`
          : t('flusso.versioni.altro', { chiave: d.key });
    return { etichetta, prima: '', dopo: '', dettaglio: true };
  });
}

schedeVersioniRouter.get('/schede/:id/versioni', read, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  res.render('schede/versioni', {
    scheda,
    ident: schedaTitle(scheda, res.locals.t),
    versioni: await elencoVersioni(scheda.id),
    versione: null,
  });
});

schedeVersioniRouter.get('/schede/:id/versioni/:n', read, async (req, res) => {
  const scheda = await loadScheda(req);
  const n = Number(req.params.n);
  if (!scheda || !Number.isInteger(n) || n < 1) return notFound(req, res);
  const v = await versioneConPrecedente(scheda.id, n);
  if (!v) return notFound(req, res);
  res.render('schede/versioni', {
    scheda,
    ident: schedaTitle(scheda, res.locals.t),
    versioni: null,
    versione: {
      numero: v.numero,
      at: v.at,
      autore: v.autore?.name ?? null,
      prima: v.precedente === null,
      righe: v.precedente === null ? [] : righeDiff(res, v.precedente, v.dati as Istantanea),
    },
  });
});
