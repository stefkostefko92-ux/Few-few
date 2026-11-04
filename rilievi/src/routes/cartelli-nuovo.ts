import type { Scheda } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { intersezioneScope, spansAziende } from '../auth/scope.js';
import { activeAziende } from '../aziende/service.js';
import { valoriDaScheda } from '../cartelli/da-scheda.js';
import { formValuesDalBody, MAX_TESTO, parseCartello } from '../cartelli/form.js';
import { cercaSchede, schedaPerCartello, ultimoCartello } from '../cartelli/scheda.js';
import { createCartello, type CartelloFull } from '../cartelli/service.js';
import { setFlash } from '../http/flash.js';
import type { FieldErrors, FormValues } from '../schede/field-parsers.js';
import type { SchedaRow } from '../schede/list.js';
import { highlight, MAX_QUERY_LENGTH } from '../schede/search.js';
import { businessDay } from '../time.js';
import { scope } from './interventi.js';

/**
 * Новата табела „Avviso di fermo impianto“ — от картата на уредбата или без карта (собственикът, 30
 * октомври 2026: „usare le schede per auto compilare cartello … lasciando la possibilità di creare anche
 * cartelli per impianti che non hanno schede“).
 *
 * - `?scheda=<id>` (бутонът на страницата на картата или изборът тук): формата идва попълнена
 *   (cartelli/da-scheda.ts) и табелата пази връзката с картата; фирмата е тази на картата.
 * - `?cerca=<думи>`: същата търсачка като в „Schede“ (матрикула, №, адрес…); една намерена карта —
 *   направо попълнената форма.
 * - Без нищо — празната форма, както досега: уредба без карта.
 * Карта се взима само ако човекът я вижда (`schede:read`) И пише табели в нейната фирма; в кошчето — не.
 * Формата за редакция (`renderForm`) е обща с cartelli.ts.
 */
export const cartelliNuovoRouter: Router = Router();

const write = requireCapability('interventi:write');

/** Фирмите, в които човекът може да създаде табела (като при листа за интервенция). */
async function aziendePerNuovo(req: Request) {
  const user = principalOf(req).user;
  const writable = scope(req, 'interventi:write');
  const choices = writable.all
    ? await activeAziende()
    : user.memberships
        .filter((m) => writable.aziendaIds.includes(m.aziendaId))
        .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
  const only = !user.master && choices.length === 1 ? choices[0]! : null;
  return { choices: only ? [] : choices, only };
}

/** Картите, от които човекът може да попълни табела: вижда ги и пише табели в тяхната фирма. */
const fonteSchede = (req: Request) =>
  intersezioneScope(scope(req, 'schede:read'), scope(req, 'interventi:write'));

/** Картата във формата: каква е и докъде води „Cambia“. */
export interface SchedaScelta {
  id: string;
  matricola: string | null;
  numeroImpianto: string | null;
  indirizzo: string | null;
  aziendaName: string | null;
}

interface Ricerca {
  query: string;
  rows: Array<SchedaRow & { segmenti: ReturnType<typeof highlight> }>;
  total: number;
}

export interface FormView {
  cartello: CartelloFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  conflict?: boolean;
  scheda?: SchedaScelta | null;
  ricerca?: Ricerca | null;
  puoCercare?: boolean;
  proposto?: boolean;
}

export function renderForm(res: Response, status: number, view: FormView): void {
  res.status(status).render('cartelli/form', {
    titleKey: view.cartello ? 'cartelli.modifica' : 'cartelli.new',
    maxTesto: MAX_TESTO,
    scheda: null,
    ricerca: null,
    puoCercare: false,
    proposto: false,
    ...view,
  });
}

function schedaScelta(row: Scheda, aziende: Array<{ id: string; name: string }>): SchedaScelta {
  return {
    id: row.id,
    matricola: row.matricola,
    numeroImpianto: row.numeroImpianto,
    indirizzo: row.indirizzo,
    aziendaName: aziende.find((a) => a.id === row.aziendaId)?.name ?? null,
  };
}

cartelliNuovoRouter.get('/cartelli/nuovo', write, async (req, res) => {
  const { choices, only } = await aziendePerNuovo(req);
  const fonte = fonteSchede(req);
  const puoCercare = fonte.all || fonte.aziendaIds.length > 0;
  const oggi = businessDay();
  const base: FormView = {
    cartello: null,
    values: { data: oggi },
    errors: {},
    base: '',
    aziende: choices,
    azienda: '',
    puoCercare,
  };

  if (req.query.scheda !== undefined) {
    const row = puoCercare ? await schedaPerCartello(fonte, req.query.scheda) : null;
    if (!row) return res.redirect(303, '/cartelli/nuovo');
    const values = valoriDaScheda(row, await ultimoCartello(row.id), oggi);
    return renderForm(res, 200, {
      ...base,
      values,
      azienda: row.aziendaId,
      scheda: schedaScelta(row, spansAziende(fonte) ? [...choices, ...(only ? [only] : [])] : []),
      proposto: values.testo !== '',
    });
  }

  const query = typeof req.query.cerca === 'string' ? req.query.cerca.trim() : '';
  if (query && puoCercare) {
    const found = await cercaSchede(fonte, query.slice(0, MAX_QUERY_LENGTH));
    // Една карта — направо попълнената форма (матрикула или номер, написани целите).
    if (found.total === 1 && found.rows[0])
      return res.redirect(303, `/cartelli/nuovo?scheda=${encodeURIComponent(found.rows[0].id)}`);
    const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
    return renderForm(res, 200, {
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

  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  renderForm(res, 200, {
    ...base,
    azienda:
      only?.id ??
      (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : ''),
  });
});

cartelliNuovoRouter.post('/cartelli', write, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const parsed = parseCartello(body);
  const { choices, only } = await aziendePerNuovo(req);
  const fonte = fonteSchede(req);
  const voluta = typeof body.scheda === 'string' && body.scheda !== '' ? body.scheda : null;
  const scheda = voluta ? await schedaPerCartello(fonte, voluta) : null;
  const tutte = only ? [only] : choices;
  const azienda = scheda
    ? (tutte.find((a) => a.id === scheda.aziendaId) ?? null)
    : (only ?? choices.find((a) => a.id === body.azienda) ?? null);
  const again = (errors: FieldErrors, conScheda: Scheda | null = null) =>
    renderForm(res, 422, {
      cartello: null,
      values: formValuesDalBody(body),
      errors,
      base: '',
      aziende: choices,
      azienda:
        conScheda?.aziendaId ?? only?.id ?? (typeof body.azienda === 'string' ? body.azienda : ''),
      scheda: conScheda ? schedaScelta(conScheda, spansAziende(fonte) ? tutte : []) : null,
      puoCercare: fonte.all || fonte.aziendaIds.length > 0,
    });
  const errori = parsed.ok ? {} : parsed.errors;
  // Пратената карта вече я няма за човека (в кошчето, чужда, подправена, фирмата ѝ е спряна) —
  // табелата не се записва; написаното остава, връзката — не.
  if ((voluta && !scheda) || (scheda && !azienda)) return again({ scheda: 'invalid', ...errori });
  if (!azienda) return again({ azienda: 'azienda', ...errori });
  if (!parsed.ok) return again(parsed.errors, scheda);
  const created = await createCartello(
    parsed.data,
    principalOf(req).user.id,
    azienda.id,
    scheda?.id ?? null,
  );
  if (!created) return again({ scheda: 'invalid' });
  setFlash(res, 'ok', 'cartelli.flash.creato');
  res.redirect(303, `/cartelli/${created.id}`);
});
