/**
 * Полетата на схемата — ЕДИНСТВЕНИЯТ източник: формата, проверката, страницата, печатът и PDF-ът се
 * строят оттук. Редът е дословно от заданието на клиента; разделите само групират, без да разместват.
 * Етикетите са в речника: `scheda.field.<key>`, `scheda.section.<key>`, `scheda.option.<key>.<СТОЙНОСТ>`.
 */

export type FieldKind =
  | 'date' // днешната дата по подразбиране
  | 'text' // кратък текст
  | 'textarea' // бележки
  | 'digits' // идентификатор само от цифри (водещата нула се пази — низ)
  | 'int' // цяло число
  | 'decimal' // до 2 знака след запетаята („6,5“ или „6.5“)
  | 'checks' // отметки (повече от една може)
  | 'yesno'; // Sì / No / неотбелязано

export type Unit = 'kg' | 'persone' | 'mm' | 'm';

export type SectionKey =
  'impianto' | 'targa' | 'ubicazione' | 'tipologia' | 'funi' | 'limitatore' | 'cavi' | 'note';

export const UBICAZIONE_MACCHINA = ['ALTO', 'BASSO'] as const;
export const TIPO_IMPIANTO = ['ELETTRICO', 'IDRAULICO', 'GEARLESS'] as const;
export const TIPO_PORTE = ['AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI'] as const;

interface BaseField {
  key: string;
  kind: FieldKind;
  /** На цял ред във формата и в PDF-а (адрес, бележки). */
  wide?: boolean;
  /** Има смисъл само при „Serrature: Sì“. */
  whenSerrature?: boolean;
}

export interface TextField extends BaseField {
  kind: 'text' | 'textarea' | 'digits';
  maxLength: number;
}

export interface NumberField extends BaseField {
  kind: 'int' | 'decimal';
  min: number;
  max: number;
  unit?: Unit;
}

export interface ChecksField extends BaseField {
  kind: 'checks';
  options: readonly string[];
}

export interface PlainField extends BaseField {
  kind: 'date' | 'yesno';
}

export type FieldDef = TextField | NumberField | ChecksField | PlainField;

export interface SectionDef {
  key: SectionKey;
  fields: readonly FieldDef[];
}

export const SECTIONS = [
  {
    key: 'impianto',
    fields: [
      { key: 'data', kind: 'date' },
      { key: 'indirizzo', kind: 'text', maxLength: 200, wide: true },
      { key: 'marca', kind: 'text', maxLength: 120 },
      { key: 'matricola', kind: 'digits', maxLength: 20 },
      { key: 'numeroImpianto', kind: 'digits', maxLength: 20 },
    ],
  },
  {
    key: 'targa',
    fields: [
      { key: 'portataKg', kind: 'int', min: 0, max: 100_000, unit: 'kg' },
      { key: 'capienzaPersone', kind: 'int', min: 0, max: 1_000, unit: 'persone' },
      { key: 'fermate', kind: 'int', min: 0, max: 300 },
    ],
  },
  {
    key: 'ubicazione',
    fields: [
      { key: 'ubicazioneMacchina', kind: 'checks', options: UBICAZIONE_MACCHINA },
      // Етаж или номер на кутийката — цяло число, и отрицателно (сутерен: -1).
      { key: 'ubicazioneCassettina', kind: 'int', min: -99, max: 999 },
      { key: 'parcheggio', kind: 'text', maxLength: 300, wide: true },
    ],
  },
  {
    key: 'tipologia',
    fields: [
      { key: 'tipoImpianto', kind: 'checks', options: TIPO_IMPIANTO },
      { key: 'tipoPorte', kind: 'checks', options: TIPO_PORTE },
      { key: 'serrature', kind: 'yesno' },
      { key: 'serratureNumero', kind: 'int', min: 0, max: 999, whenSerrature: true },
      { key: 'serratureTipo', kind: 'text', maxLength: 120, whenSerrature: true },
    ],
  },
  {
    key: 'funi',
    fields: [
      { key: 'funiDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funiTrefoli', kind: 'int', min: 0, max: 100 },
      { key: 'funiNumero', kind: 'int', min: 0, max: 100 },
      { key: 'funiLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
    ],
  },
  {
    key: 'limitatore',
    fields: [
      { key: 'limitatoreTipo', kind: 'text', maxLength: 120 },
      { key: 'funicellaDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funicellaLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
      { key: 'tenditore', kind: 'text', maxLength: 120 },
    ],
  },
  {
    key: 'cavi',
    fields: [
      { key: 'caviNumero', kind: 'int', min: 0, max: 100 },
      { key: 'caviConduttori', kind: 'int', min: 0, max: 1_000 },
      { key: 'caviLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
    ],
  },
  {
    key: 'note',
    fields: [
      { key: 'noteQuadretto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteImpianto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteBottoniere', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'lavoriExtra', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
] as const satisfies readonly SectionDef[];

export type SchedaFieldKey = (typeof SECTIONS)[number]['fields'][number]['key'];

/** Всички полета в реда от заданието. */
export const FIELDS: readonly FieldDef[] = SECTIONS.flatMap(
  (section): readonly FieldDef[] => section.fields,
);

/** Поне едно от тези трябва да е попълнено — иначе схемата не може да се намери после. */
export const IDENTIFIERS = ['indirizzo', 'matricola', 'numeroImpianto'] as const;

/** Текстовите полета, по които търси лентата за търсене (числата-идентификатори първи). */
export const SEARCHABLE = [
  'numeroImpianto',
  'matricola',
  'indirizzo',
  'marca',
  'parcheggio',
  'serratureTipo',
  'limitatoreTipo',
  'tenditore',
  'noteQuadretto',
  'noteImpianto',
  'noteBottoniere',
  'lavoriExtra',
] as const satisfies readonly SchedaFieldKey[];

export function fieldByKey(key: string): FieldDef | undefined {
  return FIELDS.find((field) => field.key === key);
}

export function isTextField(field: FieldDef): field is TextField {
  return field.kind === 'text' || field.kind === 'textarea' || field.kind === 'digits';
}

export function isNumberField(field: FieldDef): field is NumberField {
  return field.kind === 'int' || field.kind === 'decimal';
}

export function isChecksField(field: FieldDef): field is ChecksField {
  return field.kind === 'checks';
}
