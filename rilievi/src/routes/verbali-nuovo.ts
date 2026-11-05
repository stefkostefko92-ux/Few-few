import type { Scheda } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { spansAziende } from '../auth/scope.js';
import { schedaPerCartello, cercaSchede } from '../cartelli/scheda.js';
import { setFlash } from '../http/flash.js';
import type { FieldErrors } from '../schede/field-parsers.js';
import { highlight, MAX_QUERY_LENGTH } from '../schede/search.js';
import { businessDay } from '../time.js';
import { formValuesDalBody, parseVerbale, valoriDaScheda } from '../verbali/form.js';
import { createVerbale } from '../verbali/service.js';
import { aziendePerNuovo, fonteSchede, schedaScelta } from './cartelli-nuovo.js';
import { renderVerbaleForm, type VerbaleFormView } from './verbali.js';

/**
 * Новият „Verbale di chiusura cantiere“ — от картата на уредбата или без карта (собственикът, 5 ноември
 * 2026: „свързано със Scheda … да се попълва автоматично само indirizzo, Nº Buono и дата“; „От карта или
 * без карта“). Както при табелите (cartelli-nuovo.ts):
 * - `?scheda=<id>` (бутонът на картата или изборът тук): адресът и „N° buono“ от картата, датата —
 *   днешната; всичко друго е празно. Протоколът пази връзката; фирмата е тази на картата.
 * - `?cerca=<думи>`: търсенето на карта; една намерена — направо попълнената форма.
 * - Без нищо — празната форма с днешната дата: уредба без карта.
 * Карта се взима само ако човекът я вижда (`schede:read`) И пише във фирмата ѝ (`interventi:write`); в
 * кошчето — не.
 */
export const verbaliNuovoRouter: Router = Router();

const write = requireCapability('interventi:write');

verbaliNuovoRouter.get('/verbali/nuovo', write, async (req, res) => {
  const { choices, only } = await aziendePerNuovo(req);
  const fonte = fonteSchede(req);
  const puoCercare = fonte.all || fonte.aziendaIds.length > 0;
  const oggi = businessDay();
  const base: VerbaleFormView = {
    verbale: null,
    values: { data: oggi },
    errors: {},
    base: '',
    aziende: choices,
    azienda: '',
    puoCercare,
  };
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';

  if (req.query.scheda !== undefined) {
    const row = puoCercare ? await schedaPerCartello(fonte, req.query.scheda) : null;
    if (!row) return res.redirect(303, '/verbali/nuovo');
    return renderVerbaleForm(res, 200, {
      ...base,
      values: valoriDaScheda(row, oggi),
      azienda: row.aziendaId,
      scheda: schedaScelta(row, spansAziende(fonte) ? [...choices, ...(only ? [only] : [])] : []),
    });
  }

  const query = typeof req.query.cerca === 'string' ? req.query.cerca.trim() : '';
  if (query && puoCercare) {
    const found = await cercaSchede(fonte, query.slice(0, MAX_QUERY_LENGTH));
    if (found.total === 1 && found.rows[0])
      return res.redirect(303, `/verbali/nuovo?scheda=${encodeURIComponent(found.rows[0].id)}`);
    return renderVerbaleForm(res, 200, {
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

  renderVerbaleForm(res, 200, {
    ...base,
    azienda:
      only?.id ??
      (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : ''),
  });
});

async function creaDalBody(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const parsed = parseVerbale(body);
  const { choices, only } = await aziendePerNuovo(req);
  const fonte = fonteSchede(req);
  const voluta = typeof body.scheda === 'string' && body.scheda !== '' ? body.scheda : null;
  const scheda = voluta ? await schedaPerCartello(fonte, voluta) : null;
  const tutte = only ? [only] : choices;
  const azienda = scheda
    ? (tutte.find((a) => a.id === scheda.aziendaId) ?? null)
    : (only ?? choices.find((a) => a.id === body.azienda) ?? null);
  const again = (errors: FieldErrors, conScheda: Scheda | null = null) =>
    renderVerbaleForm(res, 422, {
      verbale: null,
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
  // протоколът не се записва; написаното остава, връзката — не.
  if ((voluta && !scheda) || (scheda && !azienda)) return again({ scheda: 'invalid', ...errori });
  if (!azienda) return again({ azienda: 'azienda', ...errori });
  if (!parsed.ok) return again(parsed.errors, scheda);
  const created = await createVerbale(
    parsed.data,
    principalOf(req).user.id,
    azienda.id,
    scheda?.id ?? null,
  );
  if (!created) return again({ scheda: 'invalid' });
  setFlash(res, 'ok', 'verbali.flash.creato');
  res.redirect(303, `/verbali/${created.id}`);
}

verbaliNuovoRouter.post('/verbali', write, requireCsrf, creaDalBody);
