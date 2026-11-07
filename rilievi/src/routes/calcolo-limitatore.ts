import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { formDaDati, parseDatiLimitatore, prefillLimitatore } from '../limitatore/dati.js';
import { leggiCalcolo, salvaCalcolo } from '../limitatore/service.js';
import { ARGANI } from '../ordini/moduli.js';
import { storedValori } from '../ordini/valori.js';
import type { SchedaFull } from '../schede/service.js';
import { valoriDalBody, type Percorso } from './calcolo-argano-vista.js';
import {
  inviaPdfLimitatore,
  renderLimitatore,
  type VistaLimitatore,
} from './calcolo-limitatore-vista.js';
import { loadScheda, notFound } from './schede-shared.js';

/**
 * Изчислението за ограничителя на картата (собственикът, 5 ноември 2026 — „таб calcolo limitatore“ по
 * неговия Excel, като изчислението за аргано): формата (скоростта и видът на парашута; първия път — Vn от
 * картата), записът и резултатът. Бутонът на картата го няма при хидравлична уредба (там картата няма раздела „Limitatore“) —
 * като при аргано. Чете всеки, който вижда картата; пише, който пише карти в нейната фирма — не в
 * кошчето. Записът е върху отворената версия на изчислението (`base`). Без карта —
 * calcolo-limitatore-libero.ts.
 */
export const calcoloLimitatoreRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');

const puoScrivere = (req: Request, scheda: SchedaFull) =>
  !scheda.deletedAt && canIn(principalOf(req).user, 'schede:write', scheda.aziendaId);

const identificativo = (scheda: SchedaFull) =>
  scheda.numeroImpianto ?? scheda.matricola ?? scheda.id.slice(-8);

function percorso(res: Response, scheda: SchedaFull): Percorso {
  const t = res.locals.t as (key: string) => string;
  return {
    azione: `/schede/${scheda.id}/calcolo-limitatore`,
    pdf: `/schede/${scheda.id}/calcolo-limitatore.pdf`,
    indietro: { href: `/schede/${scheda.id}`, testo: t('limitatore.indietro') },
    annulla: `/schede/${scheda.id}`,
    elimina: null,
  };
}

function render(
  req: Request,
  res: Response,
  status: number,
  scheda: SchedaFull,
  vista: Omit<VistaLimitatore, 'percorso' | 'impianto' | 'identita' | 'puoScrivere'>,
): void {
  renderLimitatore(res, status, {
    ...vista,
    percorso: percorso(res, scheda),
    impianto: scheda,
    identita: null,
    puoScrivere: puoScrivere(req, scheda),
  });
}

calcoloLimitatoreRouter.get('/schede/:id/calcolo-limitatore', read, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  const salvato = await leggiCalcolo(scheda.id);
  const values = salvato?.dati
    ? formDaDati(salvato.dati)
    : prefillLimitatore(storedValori(ARGANI, scheda.preventivoArgano));
  render(req, res, 200, scheda, {
    salvato,
    values,
    errori: {},
    base: salvato ? salvato.updatedAt.toISOString() : '',
    proposto: !salvato?.dati && Object.keys(values).length > 0,
  });
});

calcoloLimitatoreRouter.post(
  '/schede/:id/calcolo-limitatore',
  write,
  requireCsrf,
  async (req, res) => {
    const scheda = await loadScheda(req);
    if (!scheda || !puoScrivere(req, scheda)) return notFound(req, res);
    const body = req.body as Record<string, unknown>;
    const values = valoriDalBody(body);
    const base = typeof body.base === 'string' ? body.base : '';
    const { dati, errori } = parseDatiLimitatore(body);
    if (!dati) {
      return render(req, res, 422, scheda, {
        salvato: await leggiCalcolo(scheda.id),
        values,
        errori,
        base,
      });
    }
    const esito = await salvaCalcolo(scheda, base, dati, principalOf(req).user.id);
    if (esito === 'missing') return notFound(req, res);
    if (esito === 'conflict') {
      const salvato = await leggiCalcolo(scheda.id);
      return render(req, res, 409, scheda, {
        salvato,
        values,
        errori: {},
        base: salvato ? salvato.updatedAt.toISOString() : '',
        conflitto: true,
      });
    }
    setFlash(res, 'ok', 'limitatore.flash.salvato');
    res.redirect(303, `/schede/${scheda.id}/calcolo-limitatore#risultati`);
  },
);

calcoloLimitatoreRouter.get(
  '/schede/:id/calcolo-limitatore.pdf',
  read,
  pdfLimiter,
  async (req, res) => {
    const scheda = await loadScheda(req);
    const salvato = scheda ? await leggiCalcolo(scheda.id) : null;
    if (!scheda || !salvato?.dati) return notFound(req, res);
    await inviaPdfLimitatore(req, res, {
      dati: salvato.dati,
      salvato,
      impianto: scheda,
      aziendaId: scheda.aziendaId,
      nome: identificativo(scheda),
    });
  },
);
