/**
 * Видовете полета на схемата и проверките им — общото за fields.ts (списъка), формата и PDF-а.
 */

export type FieldKind =
  | 'date' // днешната дата по подразбиране
  | 'text' // кратък текст
  | 'textarea' // бележки
  | 'digits' // идентификатор само от цифри (водещата нула се пази — низ)
  | 'int' // цяло число
  | 'decimal' // до 2 знака след запетаята („6,5“ или „6.5“)
  | 'checks' // отметки (повече от една може)
  | 'choice' // един избор от няколко (или неотбелязано)
  | 'yesno'; // Sì / No / неотбелязано

/** `lmin` — l/min, `kw` — kW, `ms` — m/s (централата на хидравличния асансьор). */
export type Unit = 'kg' | 'persone' | 'mm' | 'm' | 'bar' | 'lmin' | 'kw' | 'ms';

export type SectionKey =
  | 'impianto'
  | 'ubicazione'
  | 'tipologia'
  | 'funi'
  | 'limitatore'
  | 'cavi'
  | 'serrature'
  | 'allarme'
  | 'note'
  | 'quadro'
  | 'argano'
  | 'centralina';

/**
 * Кога полето (или разделът) има смисъл: по-ранно поле от формата има една от `values` — при Sì/No
 * това е 'si' или 'no', при отметките стига една от изброените. `not` — обратното: полето няма нито
 * една от тях (и празното, и скритото). Иначе полето не се показва и не се пази (null).
 */
export interface Condition {
  field: string;
  values: readonly string[];
  not?: true;
}

interface BaseField {
  key: string;
  kind: FieldKind;
  /** На цял ред във формата и в PDF-а (адрес, бележки). */
  wide?: boolean;
  when?: Condition;
  /** Във формата етикетът е въпрос (`scheda.question.<key>`); на листа — `scheda.field.<key>`. */
  question?: boolean;
  /** При „Sì“ носи таблицата с мерките на старите бутониери — ред за всяка спирка (misure.ts). */
  misure?: boolean;
  /** При „Sì“ отваря модула на доставчика (src/ordini/) — свой PDF, отделно от картата. */
  modulo?: 'ordineQuadro' | 'preventivoArgano' | 'ordineSospensioni';
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

export interface OptionsField extends BaseField {
  kind: 'checks' | 'choice';
  options: readonly string[];
}

export interface PlainField extends BaseField {
  kind: 'date' | 'yesno';
  /**
   * Sì/No със свои думи и в този ред (`scheda.option.<key>.no|si`): „Accessi: 1 / 2“ е „Doppio accesso:
   * No / Sì“. Записът и свързаните данни остават Sì/No.
   */
  risposte?: readonly ['no', 'si'];
}

export type FieldDef = TextField | NumberField | OptionsField | PlainField;

export interface SectionDef {
  key: SectionKey;
  /** Целият раздел има смисъл само при това условие („Argano“ — не при хидравлична уредба). */
  when?: Condition;
  fields: readonly FieldDef[];
}

export function isTextField(field: FieldDef): field is TextField {
  return field.kind === 'text' || field.kind === 'textarea' || field.kind === 'digits';
}

export function isNumberField(field: FieldDef): field is NumberField {
  return field.kind === 'int' || field.kind === 'decimal';
}

export function isOptionsField(field: FieldDef): field is OptionsField {
  return field.kind === 'checks' || field.kind === 'choice';
}
