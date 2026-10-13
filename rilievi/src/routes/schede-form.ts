import type { Request, Response } from 'express';
import { principalOf } from '../auth/guards.js';
import { roleIn, spansAziende } from '../auth/scope.js';
import { collegatiDelGruppo } from '../ordini/collegamenti.js';
import { collegatiPerBrowser, discrepanzeDi, improntaDi } from '../ordini/collegati.js';
import { moduloFieldOf, withPrefill } from '../ordini/form.js';
import { SLOTS } from '../ordini/registry.js';
import { activeFields, SECTIONS } from '../schede/fields.js';
import { MAX_MISURE, misuraOf, misuraTemplateRow, misureFormRows } from '../schede/misure.js';
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
}

export function renderForm(req: Request, res: Response, status: number, view: FormView): void {
  const user = principalOf(req).user;
  const t = res.locals.t;
  // Модулите на доставчиците: при първото отваряне — от огледа, от другия модул, от фирмата и от
  // човека, който пише (ролята му в ТАЗИ фирма).
  const aziendaId = view.scheda?.aziendaId || view.azienda || null;
  const role = roleIn(user, aziendaId);
  const { values, auto } = withPrefill(view.values, {
    azienda:
      view.scheda?.azienda.name ??
      user.memberships.find((m) => m.aziendaId === aziendaId)?.aziendaName ??
      '',
    utente: user.name,
    ruolo: role ? t(`role.${role}`) : '',
    email: user.email,
  });
  const discrepanze = discrepanzeDi(values, t);
  res.status(status).render('schede/form', {
    ...view,
    showAzienda: spansAziende(scope(req, 'schede:read')),
    values,
    sections: SECTIONS,
    identifiersErrorKey: IDENTIFIERS_ERROR_KEY,
    aziendaErrorKey: AZIENDA_ERROR_KEY,
    // Кои полета с условие се виждат при отварянето (app.js ги следи после, докато се пише).
    active: activeFields((key) => view.values[key]),
    misureRows: misureFormRows(view.values, view.errors),
    misuraTemplate: misuraTemplateRow(),
    maxMisure: MAX_MISURE,
    misuraOf,
    moduli: SLOTS,
    moduloFieldOf,
    collegati: {
      auto,
      discrepanze: new Map(discrepanze.map((d) => [d.key, d])),
      delGruppo: collegatiDelGruppo,
      json: collegatiPerBrowser(t),
    },
    conferma: view.conferma ? { discrepanze, impronta: improntaDi(discrepanze) } : null,
  });
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
