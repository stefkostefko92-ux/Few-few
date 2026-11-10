import { Router, type Request, type Response } from 'express';
import { formDaDati, prefillArgano } from '../argano/da-scheda.js';
import { parseDatiArgano } from '../argano/dati.js';
import { leggiCalcolo, salvaCalcolo } from '../argano/service.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { ARGANI } from '../ordini/moduli.js';
import { storedValori } from '../ordini/valori.js';
import type { SchedaFull } from '../schede/service.js';
import {
  inviaPdf,
  renderCalcolo,
  valoriDalBody,
  type Percorso,
  type VistaCalcolo,
} from './calcolo-argano-vista.js';
import { loadScheda, notFound } from './schede-shared.js';

/**
 * Изчислението за аргано на картата (собственикът, 31 октомври 2026 — от „RT-E MOD 10411-1“, отделна
 * страница и PDF): формата с данните (първия път — от „Modulo rilievi dati argani“ на картата), записът и
 * резултатите. Чете всеки, който вижда картата; пише, който пише карти в нейната фирма — не в кошчето.
 * Записът е върху отворената версия на изчислението (`base`). Без карта — calcolo-argano-libero.ts.
 */
export const calcoloArganoRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');

const puoScrivere = (req: Request, scheda: SchedaFull) =>
  !scheda.deletedAt && canIn(principalOf(req).user, 'schede:write', scheda.aziendaId);

const identificativo = (scheda: SchedaFull) =>
  scheda.numeroImpianto ?? scheda.matricola ?? scheda.id.slice(-8);

function percorso(res: Response, scheda: SchedaFull): Percorso {
  const t = res.locals.t as (key: string) => string;
  return {
    azione: `/schede/${scheda.id}/calcolo-argano`,
    pdf: `/schede/${scheda.id}/calcolo-argano.pdf`,
    indietro: { href: `/schede/${scheda.id}`, testo: t('argano.indietro') },
    annulla: `/schede/${scheda.id}`,
    elimina: null,
  };
}

function render(
  req: Request,
  res: Response,
  status: number,
  scheda: SchedaFull,
  vista: Omit<VistaCalcolo, 'percorso' | 'impianto' | 'identita' | 'puoScrivere'>,
): void {
  renderCalcolo(res, status, {
    ...vista,
    percorso: percorso(res, scheda),
    impianto: scheda,
    identita: null,
    puoScrivere: puoScrivere(req, scheda),
  });
}

calcoloArganoRouter.get('/schede/:id/calcolo-argano', read, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  const salvato = await leggiCalcolo(scheda.id);
  const values = salvato?.dati
    ? formDaDati(salvato.dati)
    : prefillArgano(storedValori(ARGANI, scheda.preventivoArgano), scheda.portataKg);
  render(req, res, 200, scheda, {
    salvato,
    values,
    errori: {},
    base: salvato ? salvato.updatedAt.toISOString() : '',
    proposto: !salvato?.dati,
  });
});

calcoloArganoRouter.post('/schede/:id/calcolo-argano', write, requireCsrf, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda || !puoScrivere(req, scheda)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const values = valoriDalBody(body);
  const base = typeof body.base === 'string' ? body.base : '';
  const { dati, errori } = parseDatiArgano(body);
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
  setFlash(res, 'ok', 'argano.flash.salvato');
  res.redirect(303, `/schede/${scheda.id}/calcolo-argano#risultati`);
});

calcoloArganoRouter.get('/schede/:id/calcolo-argano.pdf', read, pdfLimiter, async (req, res) => {
  const scheda = await loadScheda(req);
  const salvato = scheda ? await leggiCalcolo(scheda.id) : null;
  if (!scheda || !salvato?.dati) return notFound(req, res);
  await inviaPdf(req, res, {
    dati: salvato.dati,
    salvato,
    impianto: scheda,
    aziendaId: scheda.aziendaId,
    nome: identificativo(scheda),
  });
});
