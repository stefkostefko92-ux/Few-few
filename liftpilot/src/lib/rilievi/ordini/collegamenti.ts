// The linked data: the kinds of places, their fields in the form and the check at the start. The list is in
// collegamenti-elenco.ts; the rules on it (prefill, discrepancies) — in collegati.ts; the same list reaches the browser as
// plain data (collegati-browser.ts) and collegati-client.ts does the same while typing. Ported 1:1 from rilievi
// (src/ordini/collegamenti.ts, commit ae6329cb6).
import { fieldByKey } from '../fields';
import { COLLEGAMENTI } from './collegamenti-elenco';
import { fieldsOf, type ModuloField } from './moduli';
import { SLOTS, type Prefisso } from './registry';
import { nameOf } from './valori';

export { COLLEGAMENTI };

export type Luogo = 'scheda' | Prefisso;

/**
 * A value — a number or a text («1,0», «400 V», «Via Roma 1»). In the sheet — a field with text, digits or a number
 * (`valori` translates a Sì/No answer of the sheet: «si» → «2»); in the module — a line, a drop-down list or two lines for
 * one thing (`campi`: «LUCE PORTA: [800] x [2000]»).
 */
export type MembroNumero =
  | { luogo: 'scheda'; campo: string; valori?: Readonly<Record<string, string>> }
  | { luogo: Prefisso; campo: string }
  | { luogo: Prefisso; campi: readonly [string, string] };

/**
 * A choice: which value is which category. In the sheet — the ticks of a field (`checks`) or «Sì/No» (`yesno`); in the
 * module — its ticks (their keys) or the options of a radio group (`campo`, the keys are `valore`).
 */
export type MembroScelta =
  | { luogo: 'scheda'; campo: string; voci: Readonly<Record<string, string>> }
  | { luogo: Prefisso; campo?: string; voci: Readonly<Record<string, string>> };

/**
 * A link: a value (`numero`) or a choice (`scelta`). `confronto: false` — prefill only, never in the list of
 * discrepancies: its places lawfully write the same thing differently («Selcom» and «Selcom Midi Supra»).
 */
export type Collegamento =
  | { key: string; tipo: 'numero'; confronto?: false; membri: readonly MembroNumero[] }
  | { key: string; tipo: 'scelta'; membri: readonly MembroScelta[] };

/** Whether the link is compared (the list of discrepancies, the confirmation on save). */
export const confrontato = (link: Collegamento): boolean => link.tipo === 'scelta' || link.confronto !== false;

export function moduloFields(prefix: Prefisso): ModuloField[] {
  const slot = SLOTS.find((s) => s.prefix === prefix);
  if (!slot) throw new Error(`collegati: no module with the prefix ${prefix}`);
  return fieldsOf(slot.modulo);
}

/** The module's fields a place takes: its field, its two lines, otherwise its ticks. */
export function campiDi(m: MembroNumero | MembroScelta): string[] {
  if ('campi' in m) return [...m.campi];
  if ('campo' in m && m.campo !== undefined) return [m.campo];
  return 'voci' in m ? Object.keys(m.voci) : [];
}

/** The module's fields that are in some link — they carry no `prefill` of their own in the module's map. */
export function campiCollegati(prefix: Prefisso): Set<string> {
  const out = new Set<string>();
  for (const link of COLLEGAMENTI) {
    for (const m of link.membri) if (m.luogo === prefix) for (const key of campiDi(m)) out.add(key);
  }
  return out;
}

const NUMERO_SCHEDA: readonly string[] = ['int', 'decimal', 'text', 'digits'];
const NUMERO_MODULO: readonly string[] = ['text', 'select'];

/** The check at loading: every place exists and is of the right kind — otherwise nothing starts. */
function verifica(): void {
  const seen = new Set<string>();
  for (const link of COLLEGAMENTI) {
    const luoghi = new Set<Luogo>();
    for (const m of link.membri) {
      // one place per sheet or module in a link: the prefill and the list look it up by the place
      if (luoghi.has(m.luogo)) throw new Error(`collegati ${link.key}: ${m.luogo} twice`);
      luoghi.add(m.luogo);
      if (m.luogo === 'scheda') {
        const field = fieldByKey(m.campo);
        const opzioni: readonly string[] = field?.kind === 'checks' ? field.options : field?.kind === 'yesno' ? ['si', 'no'] : [];
        const ok = link.tipo === 'scelta'
          ? 'voci' in m && opzioni.length > 0 && Object.keys(m.voci).every((v) => opzioni.includes(v))
          : field !== undefined && (NUMERO_SCHEDA.includes(field.kind) || (field.kind === 'yesno' && 'valori' in m && m.valori !== undefined));
        if (!ok) throw new Error(`collegati ${link.key}: the sheet's field ${m.campo} does not fit`);
        continue;
      }
      const fields = new Map(moduloFields(m.luogo).map((f) => [f.key, f]));
      for (const key of campiDi(m)) {
        const field = fields.get(key);
        // a value — a line or a drop-down list (the two lines — lines only); a choice — ticks, or a radio group with
        // every one of `voci` among its options
        const radio = 'voci' in m && m.campo !== undefined ? m.voci : null;
        const ok = link.tipo === 'numero'
          ? field !== undefined && ('campi' in m ? field.kind === 'text' : NUMERO_MODULO.includes(field.kind))
          : radio
            ? field?.kind === 'radio' && Object.keys(radio).every((v) => field.opzioni.some((o) => o.valore === v))
            : field?.kind === 'check';
        if (!field || !ok) throw new Error(`collegati ${link.key}: ${m.luogo}-${key} does not fit`);
        if ('prefill' in field && field.prefill) throw new Error(`collegati ${link.key}: ${m.luogo}-${key} has a prefill too`);
        if (seen.has(`${m.luogo}-${key}`)) throw new Error(`collegati: ${m.luogo}-${key} is in two links`);
        seen.add(`${m.luogo}-${key}`);
      }
    }
  }
}
verifica();

/**
 * The fields that still follow their source travel with the save under this key (collegati-client.ts): when the form
 * comes back (an error, the confirmation), they are `auto` again. (In auto-key.ts, so that the browser's form can name it
 * without this module.)
 */
export { AUTO_KEY } from './auto-key';

/**
 * The names of the form that may be `auto` — anything else is ignored: the linked fields of the sheet and of the modules
 * and the modules' fields with a prefilled value from the survey (`prefill`).
 */
export const NOMI_SEGUACI: ReadonlySet<string> = new Set([
  ...COLLEGAMENTI.flatMap((link) => link.membri.flatMap((m) => (m.luogo === 'scheda' ? [m.campo] : []))),
  ...SLOTS.flatMap((slot) => [
    ...[...campiCollegati(slot.prefix)].map((key) => nameOf(slot.prefix, key)),
    ...fieldsOf(slot.modulo).filter((field) => 'prefill' in field && field.prefill).map((field) => nameOf(slot.prefix, field.key)),
  ]),
]);

/** The compared links with a field in this group of the module — for the list of discrepancies under it. */
export function collegatiDelGruppo(prefix: Prefisso, campi: readonly string[]): string[] {
  const own = new Set(campi);
  return COLLEGAMENTI.filter((link) => confrontato(link) && link.membri.some((m) => m.luogo === prefix && campiDi(m).some((key) => own.has(key))))
    .map((link) => link.key);
}
