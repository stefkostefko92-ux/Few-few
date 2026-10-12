import type { Scheda } from '@prisma/client';
import type { Translator } from '../i18n.js';
import { toNumber, type ViewHelpers } from '../http/view.js';
import { dayFromDate } from '../time.js';
import { SECTIONS, type FieldDef, type SectionKey } from './fields.js';
import type { FormValues } from './validation.js';

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
  /** Отметките и Sì/No — за печата с квадратчета. */
  options?: OptionView[];
}

export interface DisplaySection {
  key: SectionKey;
  title: string;
  fields: DisplayField[];
}

type Values = Record<string, unknown>;

function optionLabels(field: FieldDef, t: Translator): Array<{ value: string; label: string }> {
  if (field.kind === 'checks') {
    return field.options.map((value) => ({
      value,
      label: t(`scheda.option.${field.key}.${value}`),
    }));
  }
  if (field.kind === 'yesno') {
    return [
      { value: 'si', label: t('common.yes') },
      { value: 'no', label: t('common.no') },
    ];
  }
  return [];
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
    case 'yesno':
      return raw === true ? t('common.yes') : raw === false ? t('common.no') : '';
  }
}

function optionsView(field: FieldDef, raw: unknown, t: Translator): OptionView[] | undefined {
  if (field.kind === 'checks') {
    const list = Array.isArray(raw) ? raw : [];
    return optionLabels(field, t).map((o) => ({ ...o, checked: list.includes(o.value) }));
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
 * Разделите със стойностите за страницата, печата и PDF-а. Бройката и видът на ключалките се
 * показват само при „Serrature: Sì“ — иначе не съществуват.
 */
export function displaySections(scheda: Scheda, t: Translator, fmt: ViewHelpers): DisplaySection[] {
  const values = scheda as unknown as Values;
  return SECTIONS.map((section) => ({
    key: section.key,
    title: t(`scheda.section.${section.key}`),
    fields: section.fields
      .filter((field) => !('whenSerrature' in field && field.whenSerrature) || scheda.serrature)
      .map((field) => {
        const view: DisplayField = {
          key: field.key,
          label: t(`scheda.field.${field.key}`),
          value: displayValue(field, values[field.key], t, fmt),
          kind: field.kind,
          wide: 'wide' in field && field.wide === true,
        };
        const options = optionsView(field, values[field.key], t);
        if (options) view.options = options;
        return view;
      }),
  }));
}

/** Стойностите на запазена схема във вида на формата (за „Modifica“). */
export function formValuesFromScheda(scheda: Scheda, fmt: ViewHelpers): FormValues {
  const values = scheda as unknown as Values;
  const out: FormValues = {};
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
  const out: FormValues = {};
  for (const section of SECTIONS) {
    for (const field of section.fields as readonly FieldDef[]) {
      out[field.key] = field.kind === 'checks' ? [] : field.kind === 'date' ? today : '';
    }
  }
  return out;
}
