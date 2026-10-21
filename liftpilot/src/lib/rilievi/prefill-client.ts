// The survey fields of the suppliers' modules in the browser (`prefill` in the module's map, ordini/prefill.ts): the date,
// the lift's reference, the company and the person writing, the sheet's ticks as words, a tick of the sheet («Pattino
// retrattile da cambiare: Sì» → MoviLift's «Elettr. Pattino»). Each follows the sheet in real time while nobody has typed
// in it — empty, or still holding what was put there for it (`auto`); fields of one kind follow the first one typed in
// when the sheet says nothing. The server fills them when a module first opens; one the person emptied in a module
// already filled in stays empty (`data-scritto` — ordini/form.ts withPrefill `scritti`, and `scrittiInviati` below for the
// form the browser brings back itself). The plant data that sit in more than one place (stops, address, speed…) are
// collegati-client.ts. Pure: rilievi's public/js/moduli.js (commit 988f3cf37) over the survey's values (FormValues —
// `valuesOfForm`) and an adapter of the modules' controls. Run it after the conditions are synced, before
// collegati-client's `settle`, on load and after every input or change (marking a module's control the person changed as
// touched first).
import type { FormValues } from './field-parsers';
import { activeFields } from './fields';
import type { Ctl } from './collegati-client';
import type { ContestoBrowser } from './ordini/collegati-browser';
import type { ModuloSpec } from './ordini/form';
import { rifImpianto } from './ordini/rif';
import { optionFor } from './valori-client';

/** What the survey side needs besides its values: who writes (collegati-browser.ts `contesto`) and the word of a tick of
 *  the sheet («tipoPorte», «MANUALI» → «Manuali»: `t('scheda.option.<campo>.<valore>')`, as its label reads). */
export interface SurveyContext {
  contesto: ContestoBrowser;
  etichetta: (campo: string, valore: string) => string;
}

const TICK_WORDS = ['tipoImpianto', 'tipoPorte', 'ubicazioneMacchina'];
const WHO = ['azienda', 'utente', 'ruolo', 'email'] as const;

/** What a token says from the survey on the screen (moduli.js `surveyText`): a hidden field of the sheet says nothing
 *  (the door operator with manual doors). The company has no select in LiftPilot (one company per user). */
export function surveyText(token: string, values: FormValues, ctx: SurveyContext, active: ReadonlySet<string> = activeFields((key) => values[key])): string {
  const value = (key: string): string => {
    const v = values[key];
    return active.has(key) && typeof v === 'string' ? v.trim() : '';
  };
  if (token === 'data') {
    const day = value('data');
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : '';
  }
  if (token === 'rif') return rifImpianto({ numeroImpianto: value('numeroImpianto'), matricola: value('matricola'), indirizzo: value('indirizzo') });
  const who = WHO.find((w) => w === token);
  if (who) return typeof ctx.contesto[who] === 'string' ? ctx.contesto[who] : '';
  if (TICK_WORDS.includes(token)) {
    const list = values[token];
    const ticks = active.has(token) ? (Array.isArray(list) ? list : typeof list === 'string' && list ? [list] : []) : [];
    return ticks.map((v) => ctx.etichetta(token, v)).join(', ');
  }
  return value(token);
}

/** A tick of the sheet holds (`pattinoRetrattile=si`): ticked and shown (moduli.js `surveyTick`). */
export function surveyTicked(token: string, values: FormValues, active: ReadonlySet<string> = activeFields((key) => values[key])): boolean {
  const [name = '', option = ''] = token.split('=');
  if (!active.has(name)) return false;
  const v = values[name];
  return Array.isArray(v) ? v.includes(option) : v === option;
}

/**
 * The survey's fields the person emptied in the modules the form already showed (`<prefix>-_` = '1'): a field with a
 * value from the survey that is empty — the browser does not fill it again (ordini/form.ts withPrefill `scritti`, the
 * same rule). For the form the browser brings back itself after a refusal, without the server's answer.
 */
export function scrittiInviati(specs: readonly ModuloSpec[], values: FormValues, ctx: SurveyContext): string[] {
  const active = activeFields((key) => values[key]);
  const fromSurvey = (f: ModuloSpec['gruppi'][number]['righe'][number]['campi'][number], token: string): boolean => {
    if (token.includes('=')) return surveyTicked(token, values, active);
    const text = surveyText(token, values, ctx, active);
    return f.kind === 'select' ? optionFor((f.opzioni ?? []).map((o) => o.valore), text) !== '' : text !== '';
  };
  return specs.flatMap((spec) =>
    values[spec.shownName] !== '1'
      ? []
      : spec.gruppi.flatMap((g) =>
          g.righe.flatMap((r) =>
            r.campi.filter((f) => f.prefill !== null && fromSurvey(f, f.prefill) && (values[f.name] ?? '') === '').map((f) => f.name),
          ),
        ),
  );
}

/** What the engine asks the form about the modules' survey controls. */
export interface PrefillHost<E extends Ctl> {
  /** every control of a module with a `prefill` token, in page order (rilievi: `[data-modulo] [data-prefill]`) */
  controls(): E[];
  /** its token (`data`, `rif`, `tipoPorte`, `pattinoRetrattile=si`…) */
  tokenOf(el: E): string;
  /** shown: not inside anything hidden (its module closed or of another make) */
  shown(el: E): boolean;
  /** a select's option values, or null when the control is not a select */
  optionsOf(el: E): readonly string[] | null;
}

/** Typed in by the person, or a survey field they emptied in a module already filled in (moduli.js `touched`). */
const touched = (el: Ctl): boolean => el.dataset.touched === '1' || 'scritto' in el.dataset;
const follows = (el: Ctl): boolean =>
  !touched(el) && (el.type === 'checkbox' ? el.checked !== true || el.dataset.auto === 'si' : el.value === '' || el.value === el.dataset.auto);

/**
 * One round (moduli.js `fill`): fields of one kind, in page order — the sheet speaks first; with nothing there, the first
 * field of the kind someone typed in that is on screen. Every field still following takes that value. Returns the
 * controls that changed.
 */
export function prefillFill<E extends Ctl>(host: PrefillHost<E>, values: FormValues, ctx: SurveyContext): E[] {
  const active = activeFields((key) => values[key]);
  const kinds = new Map<string, E[]>();
  for (const el of host.controls()) {
    const token = host.tokenOf(el);
    kinds.set(token, [...(kinds.get(token) ?? []), el]);
  }
  const changed: E[] = [];
  const put = (el: E, value: string): void => {
    const before = el.type === 'checkbox' ? String(el.checked === true) : el.value;
    if (el.type === 'checkbox') {
      el.checked = value === 'si';
      el.dataset.auto = value;
    } else {
      const options = host.optionsOf(el);
      const text = options ? optionFor(options, value) : value;
      el.value = el.maxLength !== undefined && el.maxLength > 0 ? text.slice(0, el.maxLength) : text;
      el.dataset.auto = el.value;
    }
    if ((el.type === 'checkbox' ? String(el.checked === true) : el.value) !== before) changed.push(el);
  };
  kinds.forEach((list, token) => {
    let value: string;
    if (token.includes('=')) {
      value = surveyTicked(token, values, active) ? 'si' : '';
    } else {
      const typed = list.find((el) => !follows(el) && host.shown(el) && el.value.trim());
      value = surveyText(token, values, ctx, active) || (typed ? typed.value.trim() : '');
    }
    list.filter(follows).forEach((el) => put(el, value));
  });
  return changed;
}

/** The survey's values of a form element as FormValues (a repeated name — the ticks — as a list), for the rules above
 *  and for activeFields (fields.ts) while typing. */
export function valuesOfForm(form: HTMLFormElement): FormValues {
  const out: FormValues = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value !== 'string') continue;
    const before = out[key];
    out[key] = before === undefined ? value : Array.isArray(before) ? [...before, value] : [before, value];
  }
  return out;
}

/** The rows of the measurements the form shows for what is typed in «Fermate» (app.js: 1..300, otherwise none; rows
 *  above the number are hidden, never removed, and are not read by the server). */
export function misureRowsFor(fermate: string, max = 300): number {
  const raw = fermate.trim();
  const n = /^\d{1,3}$/.test(raw) ? Number(raw) : 0;
  return n >= 1 && n <= max ? n : 0;
}
