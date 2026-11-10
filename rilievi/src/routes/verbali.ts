import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { firmaSalvata, pathFirma } from '../interventi/firma.js';
import { improntaLeggibile } from '../interventi/sigillo.js';
import type { FieldErrors, FormValues } from '../schede/field-parsers.js';
import { sigilloVerbaleIntatto } from '../verbali/conferma.js';
import {
  MAX_BUONO,
  MAX_INDIRIZZO,
  formValuesDalBody,
  formValuesFromVerbale,
  parseVerbale,
} from '../verbali/form.js';
import { COPIE } from '../verbali/pdf.js';
import { getVerbale, listVerbali, updateVerbale, type VerbaleFull } from '../verbali/service.js';
import { SEZIONI_VERBALE, valoriVerbale, maxDi } from '../verbali/voci.js';
import type { Ricerca, SchedaScelta } from './cartelli-nuovo.js';
import { scope } from './interventi.js';
import { aziendaFilterOf, aziendeOf, notFound } from './schede-shared.js';

/**
 * „Verbale di chiusura cantiere“: списък, страница, редакция на черновата. Новият — verbali-nuovo.ts;
 * подписът, потвърждението и двата PDF-а — verbali-firma.ts. Правата са тези на асистенцията
 * (`interventi:read` / `interventi:write`); обхватът е по фирма, чужд протокол — 404. Потвърденият не се
 * пише по никой път.
 */
export const verbaliRouter: Router = Router();

const read = requireCapability('interventi:read');
const write = requireCapability('interventi:write');

export const loadVerbale = (req: Request) =>
  getVerbale(scope(req, 'interventi:read'), String(req.params.id));

const puoScrivere = (req: Request, row: VerbaleFull) =>
  !row.confermatoAt && canIn(principalOf(req).user, 'interventi:write', row.aziendaId);

export interface VerbaleFormView {
  verbale: VerbaleFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  conflict?: boolean;
  scheda?: SchedaScelta | null;
  ricerca?: Ricerca | null;
  puoCercare?: boolean;
}

export function renderVerbaleForm(res: Response, status: number, view: VerbaleFormView): void {
  res.status(status).render('verbali/form', {
    titleKey: view.verbale ? 'verbali.modifica' : 'verbali.new',
    sezioni: SEZIONI_VERBALE,
    maxDi,
    maxIndirizzo: MAX_INDIRIZZO,
    maxBuono: MAX_BUONO,
    scheda: null,
    ricerca: null,
    puoCercare: false,
    ...view,
  });
}

/** Каквото листът като на хартия (`_foglio.ejs`) иска — и на страницата, и при подписа. */
export function vistaFoglio(row: VerbaleFull) {
  return { verbale: row, sezioni: SEZIONI_VERBALE, voci: valoriVerbale(row.voci) };
}

verbaliRouter.get('/verbali', read, async (req, res) => {
  const readScope = scope(req, 'interventi:read');
  const azienda = aziendaFilterOf(req, readScope);
  const [page, aziende] = await Promise.all([
    listVerbali({ scope: readScope, azienda, page: req.query.p }),
    aziendeOf(req, readScope),
  ]);
  res.render('verbali/list', {
    titleKey: 'verbali.list',
    page,
    aziende,
    aziendaFilter: azienda ?? '',
  });
});

verbaliRouter.get('/verbali/:id', read, async (req, res) => {
  const row = await loadVerbale(req);
  if (!row) return notFound(req, res);
  const tecnico = firmaSalvata(row.firmaTecnico);
  const supervisore = firmaSalvata(row.firmaSupervisore);
  // Потвърденият протокол навън — само с непокътнат печат: иначе без PDF-и (verbali-firma.ts).
  const sigillo = row.confermatoAt ? sigilloVerbaleIntatto(row) : null;
  res.render('verbali/show', {
    titleKey: 'verbali.titolo',
    ...vistaFoglio(row),
    firme: {
      tecnico: tecnico ? pathFirma(tecnico) : null,
      supervisore: supervisore ? pathFirma(supervisore) : null,
    },
    modifica: puoScrivere(req, row),
    sigillo,
    impronta: sigillo && row.impronta ? improntaLeggibile(row.impronta) : null,
    copie: COPIE,
  });
});

verbaliRouter.get('/verbali/:id/modifica', write, async (req, res) => {
  const row = await loadVerbale(req);
  if (!row || !canIn(principalOf(req).user, 'interventi:write', row.aziendaId))
    return notFound(req, res);
  if (row.confermatoAt) {
    setFlash(res, 'info', 'verbali.chiuso');
    res.redirect(303, `/verbali/${row.id}`);
    return;
  }
  renderVerbaleForm(res, 200, {
    verbale: row,
    values: formValuesFromVerbale(row),
    errors: {},
    base: row.updatedAt.toISOString(),
    aziende: [],
    azienda: row.aziendaId,
  });
});

verbaliRouter.post('/verbali/:id', write, requireCsrf, async (req, res) => {
  const row = await loadVerbale(req);
  if (!row || !canIn(principalOf(req).user, 'interventi:write', row.aziendaId))
    return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  if (row.confermatoAt) {
    setFlash(res, 'error', 'verbali.chiuso');
    res.redirect(303, `/verbali/${row.id}`);
    return;
  }
  const parsed = parseVerbale(body);
  const again = (status: number, errors: FieldErrors, conflict = false) =>
    renderVerbaleForm(res, status, {
      verbale: row,
      values: formValuesDalBody(body),
      errors,
      base: conflict ? row.updatedAt.toISOString() : base,
      aziende: [],
      azienda: row.aziendaId,
      conflict,
    });
  if (!parsed.ok) return again(422, parsed.errors);
  const esito = await updateVerbale(
    scope(req, 'interventi:write'),
    row.id,
    base,
    parsed.data,
    principalOf(req).user.id,
  );
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'chiuso') {
    setFlash(res, 'error', 'verbali.chiuso');
    res.redirect(303, `/verbali/${row.id}`);
    return;
  }
  // Написаното от човека остава във формата; `base` — записаното от другия.
  if (esito === 'conflict') return again(409, {}, true);
  setFlash(res, 'ok', 'verbali.flash.salvato');
  res.redirect(303, `/verbali/${row.id}`);
});
