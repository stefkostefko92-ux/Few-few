import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { spansAziende } from '../auth/scope.js';
import { formValuesDalBody, valoriDaScheda } from '../buoni/form-valori.js';
import { parseBuono, type ErroriBuono } from '../buoni/form.js';
import { createBuono } from '../buoni/service.js';
import { cercaSchede, schedaPerCartello } from '../cartelli/scheda.js';
import { setFlash } from '../http/flash.js';
import { highlight, MAX_QUERY_LENGTH } from '../schede/search.js';
import { erroriFirme, renderBuonoForm, type BuonoFormView } from './buoni.js';
import { aziendePerNuovo, fonteSchede, schedaScelta } from './cartelli-nuovo.js';

/**
 * Новият „Buono di lavoro“ — от картата на уредбата или без карта (собственикът — „sì, da scheda o
 * libero“). Както при протокола (verbali-nuovo.ts):
 * - `?scheda=<id>` (бутонът на картата или изборът тук): номерът на бона, матрикулата, адресът и редовете
 *   с работите, които картата казва; листът пази връзката, фирмата е тази на картата.
 * - `?cerca=<думи>`: търсенето на карта; една намерена — направо попълнената форма.
 * - Без нищо — празната форма: уредба без карта.
 * Карта се взима само ако човекът я вижда (`schede:read`) И пише във фирмата ѝ (`interventi:write`); в
 * кошчето — не.
 */
export const buoniNuovoRouter: Router = Router();

const write = requireCapability('interventi:write');

buoniNuovoRouter.get('/buoni/nuovo', write, async (req, res) => {
  const { choices, only } = await aziendePerNuovo(req);
  const fonte = fonteSchede(req);
  const puoCercare = fonte.all || fonte.aziendaIds.length > 0;
  const base: BuonoFormView = {
    buono: null,
    values: {},
    errors: {},
    base: '',
    aziende: choices,
    azienda: '',
    puoCercare,
  };
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';

  if (req.query.scheda !== undefined) {
    const row = puoCercare ? await schedaPerCartello(fonte, req.query.scheda) : null;
    if (!row) return res.redirect(303, '/buoni/nuovo');
    return renderBuonoForm(res, 200, {
      ...base,
      values: valoriDaScheda(row),
      azienda: row.aziendaId,
      scheda: schedaScelta(row, spansAziende(fonte) ? [...choices, ...(only ? [only] : [])] : []),
    });
  }

  const query = typeof req.query.cerca === 'string' ? req.query.cerca.trim() : '';
  if (query && puoCercare) {
    const found = await cercaSchede(fonte, query.slice(0, MAX_QUERY_LENGTH));
    if (found.total === 1 && found.rows[0])
      return res.redirect(303, `/buoni/nuovo?scheda=${encodeURIComponent(found.rows[0].id)}`);
    return renderBuonoForm(res, 200, {
      ...base,
      azienda: only?.id ?? (choices.some((a) => a.id === preset) ? preset : ''),
      ricerca: {
        query,
        total: found.total,
        rows: found.rows.map((row) => ({
          ...row,
          segmenti: highlight(row.indirizzo, found.tokens),
        })),
      },
    });
  }

  renderBuonoForm(res, 200, {
    ...base,
    azienda:
      only?.id ??
      (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : ''),
  });
});

async function creaDalBody(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const parsed = parseBuono(body);
  const { choices, only } = await aziendePerNuovo(req);
  const fonte = fonteSchede(req);
  const voluta = typeof body.scheda === 'string' && body.scheda !== '' ? body.scheda : null;
  const scheda = voluta ? await schedaPerCartello(fonte, voluta) : null;
  const tutte = only ? [only] : choices;
  const azienda = scheda
    ? (tutte.find((a) => a.id === scheda.aziendaId) ?? null)
    : (only ?? choices.find((a) => a.id === body.azienda) ?? null);
  const again = (errors: ErroriBuono) =>
    renderBuonoForm(res, 422, {
      buono: null,
      values: formValuesDalBody(body),
      errors,
      base: '',
      aziende: choices,
      azienda:
        scheda?.aziendaId ?? only?.id ?? (typeof body.azienda === 'string' ? body.azienda : ''),
      scheda: scheda ? schedaScelta(scheda, spansAziende(fonte) ? tutte : []) : null,
      puoCercare: fonte.all || fonte.aziendaIds.length > 0,
    });
  const errori = parsed.ok ? {} : parsed.errors;
  // Пратената карта вече я няма за човека — листът не се записва; написаното остава, връзката — не.
  if ((voluta && !scheda) || (scheda && !azienda)) return again({ scheda: 'invalid', ...errori });
  if (!azienda) return again({ azienda: 'azienda', ...errori });
  if (!parsed.ok) return again(parsed.errors);
  const esito = await createBuono({
    data: parsed.data,
    firme: parsed.firme,
    actorId: principalOf(req).user.id,
    aziendaId: azienda.id,
    schedaId: scheda?.id ?? null,
  });
  if (esito.esito === 'firme') return again(erroriFirme(esito.errori, parsed.campi));
  if (esito.esito !== 'ok') return again({ scheda: 'invalid' });
  setFlash(res, 'ok', 'buoni.flash.creato');
  res.redirect(303, `/buoni/${esito.id}`);
}

buoniNuovoRouter.post('/buoni', write, requireCsrf, creaDalBody);
