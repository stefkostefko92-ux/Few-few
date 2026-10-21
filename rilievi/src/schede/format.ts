import type { MisuraBottoniera, Scheda } from '@prisma/client';
import type { Translator } from '../i18n.js';
import { toNumber, type ViewHelpers } from '../http/view.js';
import { dayFromDate } from '../time.js';
import { activeParts, SECTIONS, type FieldDef, type SectionKey } from './fields.js';
import type { FormValues } from './field-parsers.js';
import { misureFromRows, misureTable, type TableView } from './misure.js';
import { ORDINABILI, sezioniOrdinate } from './ordine.js';
import { nomeModulo } from '../ordini/moduli.js';
import { slotAperto, SLOTS } from '../ordini/registry.js';
import { moduliStampatiDi } from '../ordini/riepilogo.js';
import { moduloFormValues, storedValori } from '../ordini/valori.js';

/** Картата с редовете на мерките по спирки — каквото показват страницата, печатът и PDF-ът. */
export type SchedaShown = Scheda & { misureBottoniere: MisuraBottoniera[] };

/** Неразделим интервал между число и мерна единица („630 kg“ не се къса на два реда). */
const NBSP = ' ';

export interface OptionView {
  value: string;
  label: string;
  checked: boolean;
}

export interface DisplayField {
  key: string;
  label: string;
  /** Готов за показ текст; празен, ако полето не е попълнено. */
  value: string;
  kind: FieldDef['kind'];
  wide: boolean;
  /** Отметките, изборът и Sì/No — за печата с квадратчета. */
  options?: OptionView[];
  /** Мерките на старите бутониери по спирки — таблица под полето (при „Sì“ и брой спирки). */
  table?: TableView;
  /** Попълненият модул на доставчика — свой PDF (`/schede/:id/<path>`), никога в PDF-а на картата. */
  modulo?: { path: string; nome: string };
}

export interface DisplaySection {
  key: SectionKey;
  title: string;
  fields: DisplayField[];
}

type Values = Record<string, unknown>;

function optionLabels(field: FieldDef, t: Translator): Array<{ value: string; label: string }> {
  if (field.kind === 'checks' || field.kind === 'choice') {
    return field.options.map((value) => ({
      value,
      label: t(`scheda.option.${field.key}.${value}`),
    }));
  }
  if (field.kind === 'yesno') {
    return (field.risposte ?? (['si', 'no'] as const)).map((value) => ({
      value,
      label: rispostaLabel(field, value, t),
    }));
  }
  return [];
}

/** Думата за отговор Sì/No: своята на полето (`risposte`, „Accessi: 2“), иначе Sì / No. */
export function rispostaLabel(field: FieldDef, value: 'si' | 'no', t: Translator): string {
  if (field.kind === 'yesno' && field.risposte) return t(`scheda.option.${field.key}.${value}`);
  return t(value === 'si' ? 'common.yes' : 'common.no');
}

export function unitLabel(field: FieldDef, value: number, t: Translator): string {
  if (field.kind !== 'int' && field.kind !== 'decimal') return '';
  return field.unit ? t(`scheda.unit.${field.unit}`, { n: value }) : '';
}

function displayValue(field: FieldDef, raw: unknown, t: Translator, fmt: ViewHelpers): string {
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
      return raw === true
        ? rispostaLabel(field, 'si', t)
        : raw === false
          ? rispostaLabel(field, 'no', t)
          : '';
  }
}

function optionsView(field: FieldDef, raw: unknown, t: Translator): OptionView[] | undefined {
  if (field.kind === 'checks') {
    const list = Array.isArray(raw) ? raw : [];
    return optionLabels(field, t).map((o) => ({ ...o, checked: list.includes(o.value) }));
  }
  if (field.kind === 'choice') {
    return optionLabels(field, t).map((o) => ({ ...o, checked: o.value === raw }));
  }
  if (field.kind === 'yesno') {
    return optionLabels(field, t).map((o) => ({
      ...o,
      checked: (o.value === 'si' && raw === true) || (o.value === 'no' && raw === false),
    }));
  }
  return undefined;
}

/**
 * Разделите със стойностите за страницата, печата и PDF-а — в реда на фирмата (`ordine`, настройките;
 * празно — по подразбиране). Полетата и разделите с условие (fields.ts, `when`) се показват само когато
 * то е изпълнено — „Numero serrature“ при „Serrature: No“ и „Argano“ при хидравлична уредба не
 * съществуват.
 */
export function displaySections(
  scheda: SchedaShown,
  t: Translator,
  fmt: ViewHelpers,
  ordine: readonly string[] = [],
): DisplaySection[] {
  const values = scheda as unknown as Values;
  const { fields: active, sections: attive } = activeParts((key) => values[key]);
  return sezioniOrdinate(SECTIONS, ordine)
    .filter((section) => attive.has(section.key))
    .map((section) => ({
      key: section.key,
      title: t(`scheda.section.${section.key}`),
      fields: (section.fields as readonly FieldDef[])
        .filter((field) => active.has(field.key))
        .map((field) => {
          const view: DisplayField = {
            key: field.key,
            label: t(`scheda.field.${field.key}`),
            value: displayValue(field, values[field.key], t, fmt),
            kind: field.kind,
            wide: field.wide === true,
          };
          const options = optionsView(field, values[field.key], t);
          if (options) view.options = options;
          const slot = SLOTS.find(
            (s) =>
              s.column === field.modulo &&
              slotAperto(s, active, (key) => values[key]) &&
              storedValori(s.modulo, values[s.column]),
          );
          if (slot) view.modulo = { path: slot.path, nome: nomeModulo(slot.modulo) };
          if (field.misure && values[field.key] === true) {
            const table = misureTable(scheda.fermate, scheda.misureBottoniere, t, fmt);
            if (table) view.table = table;
          }
          return view;
        }),
    }));
}

/** Стойностите на запазена схема във вида на формата (за „Modifica“), с редовете на мерките. */
export function formValuesFromScheda(scheda: SchedaShown, fmt: ViewHelpers): FormValues {
  const values = scheda as unknown as Values;
  const out: FormValues = misureFromRows(scheda.misureBottoniere, fmt);
  for (const slot of SLOTS) {
    const valori = storedValori(slot.modulo, values[slot.column]);
    if (valori) Object.assign(out, moduloFormValues(slot.modulo, slot.prefix, valori));
  }
  out.riepilogoOrdini = moduliStampatiDi(scheda);
  out.stampa = ORDINABILI.filter((key) => !scheda.sezioniEscluse.includes(key));
  out.stampaFoto = scheda.fotoStampate ? 'si' : '';
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

/** Името на схемата за заглавия: номерът, иначе матрикулата, иначе адресът. */
export function schedaTitle(
  scheda: Pick<Scheda, 'numeroImpianto' | 'matricola' | 'indirizzo'>,
  t: Translator,
): string {
  if (scheda.numeroImpianto) return t('scheda.titleImpianto', { n: scheda.numeroImpianto });
  if (scheda.matricola) return t('scheda.titleMatricola', { n: scheda.matricola });
  return scheda.indirizzo ?? t('scheda.title');
}

/** Празна форма: днешната дата по Рим, всичко друго празно. */
export function emptyFormValues(today: string): FormValues {
  const out: FormValues = { riepilogoOrdini: [], stampa: [...ORDINABILI], stampaFoto: '' };
  for (const section of SECTIONS) {
    for (const field of section.fields as readonly FieldDef[]) {
      out[field.key] = field.kind === 'checks' ? [] : field.kind === 'date' ? today : '';
    }
  }
  return out;
}
