import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { spansAziende } from '../auth/scope.js';
import { cercaSchede, schedaPerCartello } from '../cartelli/scheda.js';
import { setFlash } from '../http/flash.js';
import { datiDi } from '../preventivi/dati.js';
import { valoriDaCopia, valoriDaScheda } from '../preventivi/da-scheda.js';
import { formValuesDalBody, parsePreventivo, type ErroriPreventivo } from '../preventivi/form.js';
import { createPreventivo } from '../preventivi/service.js';
import { highlight, MAX_QUERY_LENGTH } from '../schede/search.js';
import { businessDay } from '../time.js';
import { schedaScelta } from './cartelli-nuovo.js';
import {
  aziendePerPreventivo,
  condizioniDi,
  fonteSchede,
  loadPreventivo,
  puoScrivere,
  renderPreventivoForm,
  type PreventivoFormView,
} from './preventivi-vista.js';

/**
 * Новата оферта — от картата на уредбата, като копие на друга оферта или празна:
 * - `?scheda=<id>`: уредбата, предметът и по ред за всяка работа от картата (без цени); фирмата — на картата.
 * - `?da=<id>`: „Duplica“ — всичко от видимата оферта, днешен ден; нов номер и „Bozza“.
 * - `?cerca=<думи>`: търсенето на карта; една намерена — направо попълнената форма.
 * Условията идват от настройките на фирмата, когато тя е известна (иначе — от браузъра при избора й).
 */
export const preventiviNuovoRouter: Router = Router();

const write = requireCapability('preventivi:write');

preventiviNuovoRouter.get('/preventivi/nuovo', write, async (req, res) => {
  const { choices, only } = await aziendePerPreventivo(req);
  const fonte = fonteSchede(req);
  const puoCercare = fonte.all || fonte.aziendaIds.length > 0;
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const azienda =
    only?.id ??
    (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : '');
  const base: PreventivoFormView = {
    preventivo: null,
    values: {
      data: businessDay(),
      validitaGiorni: '30',
      condizioni: azienda ? ((await condizioniDi(azienda)) ?? '') : '',
    },
    errors: {},
    base: '',
    aziende: choices,
    azienda,
    puoCercare,
  };

  if (req.query.da !== undefined) {
    const row = await loadPreventivo(req, String(req.query.da));
    if (!row || !puoScrivere(req, row)) return res.redirect(303, '/preventivi/nuovo');
    return renderPreventivoForm(res, 200, {
      ...base,
      values: valoriDaCopia(datiDi(row)),
      azienda: row.aziendaId,
      aziende: [],
    });
  }

  if (req.query.scheda !== undefined) {
    const row = puoCercare ? await schedaPerCartello(fonte, req.query.scheda) : null;
    // Карта на фирма без включени оферти (MASTER вижда всички карти) — няма оферта от нея.
    const suaAzienda =
      row && (only?.id === row.aziendaId || choices.some((a) => a.id === row.aziendaId));
    if (!row || !suaAzienda) return res.redirect(303, '/preventivi/nuovo');
    return renderPreventivoForm(res, 200, {
      ...base,
      values: valoriDaScheda(row, await condizioniDi(row.aziendaId)),
      azienda: row.aziendaId,
      scheda: schedaScelta(row, spansAziende(fonte) ? [...choices, ...(only ? [only] : [])] : []),
    });
  }

  const query = typeof req.query.cerca === 'string' ? req.query.cerca.trim() : '';
  if (query && puoCercare) {
    const found = await cercaSchede(fonte, query.slice(0, MAX_QUERY_LENGTH));
    if (found.total === 1 && found.rows[0])
      return res.redirect(303, `/preventivi/nuovo?scheda=${encodeURIComponent(found.rows[0].id)}`);
    return renderPreventivoForm(res, 200, {
      ...base,
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

  renderPreventivoForm(res, 200, base);
});

async function creaDalBody(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const parsed = parsePreventivo(body);
  const { choices, only } = await aziendePerPreventivo(req);
  const fonte = fonteSchede(req);
  const voluta = typeof body.scheda === 'string' && body.scheda !== '' ? body.scheda : null;
  const scheda = voluta ? await schedaPerCartello(fonte, voluta) : null;
  const tutte = only ? [only] : choices;
  const azienda = scheda
    ? (tutte.find((a) => a.id === scheda.aziendaId) ?? null)
    : (only ?? choices.find((a) => a.id === body.azienda) ?? null);
  const again = (errors: ErroriPreventivo) =>
    renderPreventivoForm(res, 422, {
      preventivo: null,
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
  // Пратената карта вече я няма за човека — офертата не се записва; написаното остава, връзката — не.
  if ((voluta && !scheda) || (scheda && !azienda)) return again({ scheda: 'invalid', ...errori });
  if (!azienda) return again({ azienda: 'required', ...errori });
  if (!parsed.ok) return again(parsed.errors);
  const esito = await createPreventivo({
    data: parsed.data,
    actorId: principalOf(req).user.id,
    aziendaId: azienda.id,
    schedaId: scheda?.id ?? null,
  });
  if (esito.esito === 'spento') return again({ azienda: 'invalid' });
  if (esito.esito !== 'ok') return again({ scheda: 'invalid' });
  setFlash(res, 'ok', 'preventivi.flash.creato');
  res.redirect(303, `/preventivi/${esito.id}`);
}

preventiviNuovoRouter.post('/preventivi', write, requireCsrf, creaDalBody);
