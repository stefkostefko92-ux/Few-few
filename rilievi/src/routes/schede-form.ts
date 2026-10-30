import type { Request, Response } from 'express';
import { allegatiDi } from '../allegati/service.js';
import { aziendeConSchizzi } from '../aziende/funzioni.js';
import { gruppiScelta, nelFoglioDi, sezioniFoto } from '../allegati/stampa.js';
import { principalOf } from '../auth/guards.js';
import { roleIn, spansAziende } from '../auth/scope.js';
import { collegatiDelGruppo } from '../ordini/collegamenti.js';
import { collegatiPerBrowser } from '../ordini/collegati-browser.js';
import { discrepanzeDi, improntaDi } from '../ordini/collegati.js';
import { moduliDopo, moduloFieldOf, withPrefill } from '../ordini/form.js';
import { COLONNE, SLOTS } from '../ordini/registry.js';
import { activeParts, SECTIONS } from '../schede/fields.js';
import { MAX_MISURE, misuraOf, misuraTemplateRow, misureFormRows } from '../schede/misure.js';
import { FISSE, ORDINABILI, sezioniOrdinate } from '../schede/ordine.js';
import { foglioDa, SCHIZZI_STAMPA_KEY, SCHIZZO_KEY, type Foglio } from '../schizzi/model.js';
import { fogliDi } from '../schizzi/service.js';
import type { SchedaFull } from '../schede/service.js';
import {
  formValuesFromBody,
  IDENTIFIERS_ERROR_KEY,
  type FieldErrors,
  type FormValues,
} from '../schede/validation.js';
import { scope, writableAziende } from './schede-shared.js';

/** Ключът на грешката „избери фирма“ във формата (MASTER или човек в няколко фирми). */
export const AZIENDA_ERROR_KEY = 'azienda';

export interface FormView {
  scheda: SchedaFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  conflict: boolean;
  /** При нова карта: фирмите за избор (MASTER или човек в няколко фирми) и избраната. */
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  /** Записът спря заради разминавания между картата и модулите — показва се списъкът им с „Salva comunque“. */
  conferma?: boolean;
  /** Редът на разделите на фирмата за нова карта (при редакция — този на картата, `scheda.azienda`). */
  ordineSezioni?: readonly string[];
}

export async function renderForm(
  req: Request,
  res: Response,
  status: number,
  view: FormView,
): Promise<void> {
  const user = principalOf(req).user;
  const t = res.locals.t;
  // Модулите на доставчиците: при първото отваряне — от огледа, от другия модул, от фирмата и от
  // човека, който пише (ролята му в ТАЗИ фирма).
  const aziendaId = view.scheda?.aziendaId || view.azienda || null;
  const role = roleIn(user, aziendaId);
  const contesto = {
    azienda:
      view.scheda?.azienda.name ??
      user.memberships.find((m) => m.aziendaId === aziendaId)?.aziendaName ??
      '',
    utente: user.name,
    ruolo: role ? res.locals.ruolo(role, aziendaId) : '',
    email: user.email,
  };
  const { values, auto, scritti } = withPrefill(view.values, {
    ...contesto,
    etichetta: (campo, valore) => t(`scheda.option.${campo}.${valore}`),
  });
  const discrepanze = discrepanzeDi(values, t);
  const shown = activeParts((key) => view.values[key]);
  const ordine = view.scheda?.azienda.ordineSezioni ?? view.ordineSezioni ?? [];
  // Снимките и клиповете по раздели — само на записана карта (формата я взима в обхвата за запис).
  const allegati = view.scheda ? await allegatiDi(view.scheda.id) : [];
  // Иконките за печата: показаните при изпращането — както са пратени (формата се връща); другите
  // (качени или станали готови междувременно) и при първото отваряне — записаното на снимките.
  const stampa = Array.isArray(values.stampa) ? values.stampa : [...ORDINABILI];
  const viste = new Set(Array.isArray(values.fotoMostrate) ? values.fotoMostrate : []);
  const pratese = new Set(Array.isArray(values.fotoStampa) ? values.fotoStampa : []);
  const fotoStampa = {
    gruppi: gruppiScelta(
      sezioniFoto(ordine, t),
      allegati,
      nelFoglioDi(
        shown.sections,
        ORDINABILI.filter((key) => !stampa.includes(key)),
      ),
    ),
    scelte: new Set(
      allegati.filter((a) => (viste.has(a.id) ? pratese.has(a.id) : a.inStampa)).map((a) => a.id),
    ),
  };
  res.status(status).render('schede/form', {
    ...view,
    showAzienda: spansAziende(scope(req, 'schede:read')),
    values,
    sections: sezioniOrdinate(SECTIONS, ordine),
    identifiersErrorKey: IDENTIFIERS_ERROR_KEY,
    aziendaErrorKey: AZIENDA_ERROR_KEY,
    // Кои полета и раздели с условие се виждат при отварянето (app.js ги следи после, докато се пише).
    active: shown.fields,
    activeSections: shown.sections,
    fisse: FISSE,
    // Модулите, които се избират поотделно за печата (таблото, листът за аргано, 2SG).
    moduliStampa: COLONNE,
    misureRows: misureFormRows(view.values, view.errors),
    misuraTemplate: misuraTemplateRow(),
    maxMisure: MAX_MISURE,
    misuraOf,
    moduli: SLOTS,
    moduliDopo,
    moduloFieldOf,
    collegati: {
      auto,
      scritti,
      discrepanze: new Map(discrepanze.map((d) => [d.key, d])),
      delGruppo: collegatiDelGruppo,
      json: collegatiPerBrowser(t, contesto),
    },
    conferma: view.conferma ? { discrepanze, impronta: improntaDi(discrepanze) } : null,
    allegati,
    fotoStampa,
    schizzi: await schizziDelForm(view, values),
    modifica: view.scheda !== null,
  });
}

/**
 * Скицникът във формата — при фирма, която го има; на нова карта с избор на фирма — фирмите с него,
 * а блокът следва избраната (schizzi.js). Листовете — пратените (формата се връща), иначе записаните;
 * отметката за печата се вижда и при изключен скицник, ако картата има листове (те остават в печата).
 */
async function schizziDelForm(view: FormView, values: FormValues) {
  const scelta = !view.scheda && view.aziende.length > 0;
  const candidate = view.scheda
    ? [view.scheda.aziendaId]
    : scelta
      ? view.aziende.map((a) => a.id)
      : view.azienda
        ? [view.azienda]
        : [];
  const per = view.scheda
    ? view.scheda.azienda.schizzi
      ? candidate
      : []
    : [...(await aziendeConSchizzi(candidate))];
  const pratesi = values[SCHIZZO_KEY];
  const fogli: Foglio[] = Array.isArray(pratesi)
    ? pratesi.flatMap((json) => {
        const foglio = foglioDa(json);
        return foglio ? [foglio] : [];
      })
    : view.scheda
      ? await fogliDi(view.scheda.id)
      : [];
  const stampati = values[SCHIZZI_STAMPA_KEY];
  return {
    attivo: per.length > 0,
    per: scelta ? per.join(' ') : '',
    nascosto: scelta && !per.includes(view.azienda),
    fogli: fogli.map((foglio) => ({ foglio, json: JSON.stringify(foglio) })),
    stampati:
      typeof stampati === 'string' ? stampati === '1' : (view.scheda?.schizziStampati ?? true),
  };
}

/**
 * Разминаванията при запис (src/ordini/collegati.ts): отпечатъкът им (null — няма) и дали още чакат
 * потвърждение. Потвърдени са, когато пратеното `conferma` или потвърденото при последния запис на
 * картата (`confermate`) е точно този отпечатък — нови или променени разлики се питат пак.
 */
export function controlloDiscrepanze(
  res: Response,
  body: Record<string, unknown>,
  confermate: string | null,
): { impronta: string | null; manca: boolean } {
  const discrepanze = discrepanzeDi(formValuesFromBody(body), res.locals.t);
  if (discrepanze.length === 0) return { impronta: null, manca: false };
  const impronta = improntaDi(discrepanze);
  return { impronta, manca: body.conferma !== impronta && confermate !== impronta };
}

/**
 * Фирмите за нова карта: MASTER избира всяка активна; човек с право на запис в една фирма пише винаги
 * в нея (без избор); в няколко — избира.
 */
export async function aziendeForNew(req: Request) {
  const choices = await writableAziende(req);
  const only = !principalOf(req).user.master && choices.length === 1 ? choices[0]! : null;
  return { choices: only ? [] : choices, only };
}
