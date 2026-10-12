// What the page, the print and the PDF show of a sheet; the sheet back in the shape of its form; its title; an empty
// form. Ported 1:1 from rilievi (src/schede/format.ts); the numbers and dates are fmt.ts (Italian).
import type { Scheda } from '@prisma/client';
import { dayFromDate } from './time';
import { fmt, toNumber } from './fmt';
import { activeFields, SECTIONS, type FieldDef, type SectionKey } from './fields';
import type { FormValues } from './field-parsers';
import { misureFromRows, misureTable, type MisuraRow, type TableView } from './misure';
import { slotOf, SLOTS } from './ordini/registry';
import { moduloFormValues, storedValori } from './ordini/valori';
import type { RilieviT } from './t';

/** The sheet with the rows of the measurements per stop — what the page, the print and the PDF show. */
export type SchedaShown = Scheda & { misureBottoniere: readonly MisuraRow[] };

/** A non-breaking space between a number and its unit ("630 kg" never splits over two lines). */
const NBSP = '\u00a0';

export interface OptionView {
  value: string;
  label: string;
  checked: boolean;
}

export interface DisplayField {
  key: string;
  label: string;
  /** Text ready to show; empty when the field is not filled in. */
  value: string;
  kind: FieldDef['kind'];
  wide: boolean;
  /** The ticks, the choice and Sì/No — for the print with boxes. */
  options?: OptionView[];
  /** The measurements of the old push-button panels per stop — a table under the field (with "Sì" and a number of stops). */
  table?: TableView;
  /** The supplier's module filled in — its own PDF (`/api/rilievi/<id>/<path>`), never in the sheet's PDF. */
  modulo?: { path: string; titolo: string; fornitore: string };
}

export interface DisplaySection {
  key: SectionKey;
  title: string;
  fields: DisplayField[];
}

type Values = Record<string, unknown>;

function optionLabels(field: FieldDef, t: RilieviT): Array<{ value: string; label: string }> {
  if (field.kind === 'checks' || field.kind === 'choice') {
    return field.options.map((value) => ({ value, label: t(`scheda.option.${field.key}.${value}`) }));
  }
  if (field.kind === 'yesno') {
    return [
      { value: 'si', label: t('common.yes') },
      { value: 'no', label: t('common.no') },
    ];
  }
  return [];
}

export function unitLabel(field: FieldDef, value: number, t: RilieviT): string {
  if (field.kind !== 'int' && field.kind !== 'decimal') return '';
  return field.unit ? t(`scheda.unit.${field.unit}`, { n: value }) : '';
}

function displayValue(field: FieldDef, raw: unknown, t: RilieviT): string {
  switch (field.kind) {
    case 'date':
      return raw instanceof Date ? fmt.day(raw) : '';
    case 'text':
    case 'textarea':
    case 'digits':
      return typeof raw === 'string' ? raw : '';
    case 'int':
    case 'decimal': {
      const n = toNumber(raw as number | { toString(): string } | null);
      if (n === null) return '';
      const unit = unitLabel(field, n, t);
      return unit ? `${fmt.num(n)}${NBSP}${unit}` : fmt.num(n);
    }
    case 'checks':
      return Array.isArray(raw)
        ? optionLabels(field, t)
            .filter((option) => raw.includes(option.value))
            .map((option) => option.label)
            .join(', ')
        : '';
    case 'choice':
      return optionLabels(field, t).find((option) => option.value === raw)?.label ?? '';
    case 'yesno':
      return raw === true ? t('common.yes') : raw === false ? t('common.no') : '';
  }
}

function optionsView(field: FieldDef, raw: unknown, t: RilieviT): OptionView[] | undefined {
  if (field.kind === 'checks') {
    const list = Array.isArray(raw) ? raw : [];
    return optionLabels(field, t).map((o) => ({ ...o, checked: list.includes(o.value) }));
  }
  if (field.kind === 'choice') return optionLabels(field, t).map((o) => ({ ...o, checked: o.value === raw }));
  if (field.kind === 'yesno') {
    return optionLabels(field, t).map((o) => ({ ...o, checked: (o.value === 'si' && raw === true) || (o.value === 'no' && raw === false) }));
  }
  return undefined;
}

/**
 * The sections with their values for the page, the print and the PDF. The fields with a condition (fields.ts, `when`)
 * are shown only when it holds — "Numero serrature" with "Serrature: No" does not exist.
 */
export function displaySections(scheda: SchedaShown, t: RilieviT): DisplaySection[] {
  const values = scheda as unknown as Values;
  const active = activeFields((key) => values[key]);
  return SECTIONS.map((section) => ({
    key: section.key,
    title: t(`scheda.section.${section.key}`),
    fields: (section.fields as readonly FieldDef[])
      .filter((field) => active.has(field.key))
      .map((field) => {
        const view: DisplayField = {
          key: field.key,
          label: t(`scheda.field.${field.key}`),
          value: displayValue(field, values[field.key], t),
          kind: field.kind,
          wide: field.wide === true,
        };
        const options = optionsView(field, values[field.key], t);
        if (options) view.options = options;
        const slot = slotOf(field.modulo);
        if (slot && values[field.key] === true && storedValori(slot.modulo, values[slot.column])) {
          const { titolo, fornitore } = slot.modulo;
          view.modulo = { path: slot.path, titolo, fornitore };
        }
        if (field.misure && values[field.key] === true) {
          const table = misureTable(scheda.fermate, scheda.misureBottoniere, t);
          if (table) view.table = table;
        }
        return view;
      }),
  }));
}

/** The values of a stored sheet in the shape of the form (for "Modifica"), with the rows of the measurements. */
export function formValuesFromScheda(scheda: SchedaShown): FormValues {
  const values = scheda as unknown as Values;
  const out: FormValues = misureFromRows(scheda.misureBottoniere);
  for (const slot of SLOTS) {
    const valori = storedValori(slot.modulo, values[slot.column]);
    if (valori) Object.assign(out, moduloFormValues(slot.modulo, slot.prefix, valori));
  }
  for (const section of SECTIONS) {
    for (const field of section.fields as readonly FieldDef[]) {
      const raw = values[field.key];
      switch (field.kind) {
        case 'date':
          out[field.key] = raw instanceof Date ? dayFromDate(raw) : '';
          break;
        case 'checks':
          out[field.key] = Array.isArray(raw) ? raw.map(String) : [];
          break;
        case 'yesno':
          out[field.key] = raw === true ? 'si' : raw === false ? 'no' : '';
          break;
        case 'choice':
          out[field.key] = typeof raw === 'string' ? raw : '';
          break;
        case 'int':
          out[field.key] = typeof raw === 'number' ? String(raw) : '';
          break;
        case 'decimal':
          out[field.key] = fmt.inputNum(raw as { toString(): string } | null);
          break;
        default:
          out[field.key] = typeof raw === 'string' ? raw : '';
      }
    }
  }
  return out;
}

/** The sheet's name for headings: the number, otherwise the matricola, otherwise the address. */
export function schedaTitle(scheda: Pick<Scheda, 'numeroImpianto' | 'matricola' | 'indirizzo'>, t: RilieviT): string {
  if (scheda.numeroImpianto) return t('scheda.titleImpianto', { n: scheda.numeroImpianto });
  if (scheda.matricola) return t('scheda.titleMatricola', { n: scheda.matricola });
  return scheda.indirizzo ?? t('scheda.title');
}

/** A sheet's identity as a browser tab's title (rilievi's show and print pages): cut at 40 characters, then «…». */
export const tabTitle = (ident: string): string => (ident.length > 40 ? `${ident.slice(0, 39)}…` : ident);

/** An empty form: today in Rome, everything else empty. */
export function emptyFormValues(today: string): FormValues {
  const out: FormValues = {};
  for (const section of SECTIONS) {
    for (const field of section.fields as readonly FieldDef[]) out[field.key] = field.kind === 'checks' ? [] : field.kind === 'date' ? today : '';
  }
  return out;
}
