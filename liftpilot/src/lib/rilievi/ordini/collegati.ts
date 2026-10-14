// The rules on the linked data (the list is in collegamenti-elenco.ts):
// - the prefill: an empty field of a module takes the value from the sheet, otherwise from the other module;
// - the discrepancies: two filled places with different values → a list in the modules and a confirmation on save. The
//   empty is no statement and is not compared; the hidden (a field with a condition, a closed module) — neither; a
//   "prefill only" link (`confronto: false`) — never.
// The browser does the same while typing (collegati-client.ts) — there the sheet's empty field follows the modules too
// (collegati-browser.ts gives it the list). Ported 1:1 from rilievi (src/ordini/collegati.ts, commit ae6329cb6).
import { createHash } from 'node:crypto';
import type { FormValues } from '../field-parsers';
import { activeFields, fieldByKey } from '../fields';
import { rispostaLabel } from '../format';
import type { RilieviT } from '../t';
import { COLLEGAMENTI, confrontato, moduloFields, type Luogo, type MembroNumero, type MembroScelta } from './collegamenti';
import type { ModuloField } from './moduli';
import { coppiaDi, dividiCoppia, stessoValore } from './numeri';
import { opzioneDi } from './opzioni';
import { slotAperto, SLOTS, type Prefisso } from './registry';
import { nameOf, type Valori } from './valori';

export { coppiaDi, dividiCoppia, numeriDi, stessoValore } from './numeri';

type MembroModulo = Exclude<MembroNumero, { luogo: 'scheda' }>;

interface Attivi {
  scheda: Set<string>;
  moduli: Set<Prefisso>;
}

/** What is shown: the sheet's fields by their conditions, the modules — with «Sì» on their question. */
function attiviDi(values: FormValues): Attivi {
  const scheda = activeFields((key) => values[key]);
  const moduli = new Set<Prefisso>(SLOTS.filter((s) => slotAperto(s, scheda, (key) => values[key])).map((s) => s.prefix));
  return { scheda, moduli };
}

const testo = (value: string | string[] | undefined): string => (typeof value === 'string' ? value.trim() : '');

/** What one place says, or null — empty or hidden. */
function leggiNumero(m: MembroNumero, values: FormValues, attivi: Attivi): string | null {
  if (m.luogo === 'scheda') {
    if (!attivi.scheda.has(m.campo)) return null;
    const raw = testo(values[m.campo]);
    // only the translation's own keys: «constructor» from the form is no answer
    const value = m.valori ? (Object.hasOwn(m.valori, raw) ? (m.valori[raw] ?? '') : '') : raw;
    return value || null;
  }
  if (!attivi.moduli.has(m.luogo)) return null;
  if ('campi' in m) {
    const [a, b] = m.campi;
    return coppiaDi(testo(values[nameOf(m.luogo, a)]), testo(values[nameOf(m.luogo, b)])) || null;
  }
  return testo(values[nameOf(m.luogo, m.campo)]) || null;
}

/** What is chosen in one place (the keys of `voci`, in their order), or null. */
function leggiScelta(m: MembroScelta, values: FormValues, attivi: Attivi): string[] | null {
  let ticked: string[];
  if (m.luogo === 'scheda') {
    if (!attivi.scheda.has(m.campo)) return null;
    // the ticks (`checks`) are a list, «Sì/No» — one answer
    const value = values[m.campo];
    const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    ticked = Object.keys(m.voci).filter((v) => list.includes(v));
  } else {
    if (!attivi.moduli.has(m.luogo)) return null;
    const luogo = m.luogo;
    const radio = m.campo === undefined ? null : values[nameOf(luogo, m.campo)];
    ticked = Object.keys(m.voci).filter((k) => (m.campo === undefined ? values[nameOf(luogo, k)] === 'si' : radio === k));
  }
  return ticked.length ? ticked : null;
}

export interface VoceDiscrepanza {
  luogo: Luogo;
  valore: string;
}
export interface Discrepanza {
  key: string;
  voci: VoceDiscrepanza[];
}

function etichetta(m: MembroScelta, voce: string, t: RilieviT): string {
  if (m.luogo === 'scheda') {
    const field = fieldByKey(m.campo);
    if (field?.kind === 'yesno') return rispostaLabel(field, voce === 'si' ? 'si' : 'no', t);
    return t(`scheda.option.${m.campo}.${voce}`);
  }
  const field = moduloFields(m.luogo).find((f) => f.key === (m.campo ?? voce));
  if (field?.kind === 'radio') return field.opzioni.find((o) => o.valore === voce)?.label ?? voce;
  return field?.label ?? voce;
}

/**
 * The discrepancies: the links in which at least two places say different things. With the numbers — different numbers;
 * with the ticks — not one category in common («2 Velocità» against «VVVF»).
 */
export function discrepanzeDi(values: FormValues, t: RilieviT): Discrepanza[] {
  const attivi = attiviDi(values);
  const out: Discrepanza[] = [];
  for (const link of COLLEGAMENTI) {
    if (!confrontato(link)) continue;
    if (link.tipo === 'numero') {
      const voci = link.membri.flatMap((m): VoceDiscrepanza[] => {
        const valore = leggiNumero(m, values, attivi);
        return valore ? [{ luogo: m.luogo, valore }] : [];
      });
      const first = voci[0]?.valore ?? '';
      if (voci.length > 1 && voci.some((v) => !stessoValore(v.valore, first))) out.push({ key: link.key, voci });
      continue;
    }
    const letture = link.membri.flatMap((m) => {
      const ticked = leggiScelta(m, values, attivi);
      return ticked ? [{ m, ticked, categorie: new Set(ticked.map((v) => m.voci[v] ?? '')) }] : [];
    });
    const conflitto = letture.some((a, i) => letture.slice(i + 1).some((b) => ![...a.categorie].some((c) => b.categorie.has(c))));
    if (conflitto) {
      out.push({ key: link.key, voci: letture.map(({ m, ticked }) => ({ luogo: m.luogo, valore: ticked.map((v) => etichetta(m, v, t)).join(', ') })) });
    }
  }
  return out;
}

/**
 * The fingerprint of exactly these discrepancies: the confirmation on save holds only for them — a change after it (a new
 * discrepancy, another value) asks for a new confirmation.
 */
export function improntaDi(discrepanze: readonly Discrepanza[]): string {
  const canonical = JSON.stringify(discrepanze.map((d) => [d.key, ...d.voci.map((v) => `${v.luogo}=${v.valore}`)]));
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * The value in the module's field: a line — cut to its length; a drop-down list — its option (the same word or the same
 * numbers, otherwise nothing); the two lines — its numbers.
 */
function scriviNumero(target: MembroModulo, value: string, fields: ReadonlyMap<string, ModuloField>): Valori {
  const out: Valori = {};
  const keys = 'campi' in target ? target.campi : [target.campo];
  const parti = 'campi' in target ? dividiCoppia(value) : [value];
  keys.forEach((key, i) => {
    const field = fields.get(key);
    const part = parti?.[i] ?? '';
    if (!field || !part) return;
    if (field.kind === 'select') {
      const opzione = opzioneDi(field.opzioni, part);
      if (opzione) out[key] = opzione;
    } else if ('maxLength' in field) {
      out[key] = part.slice(0, field.maxLength);
    }
  });
  return out;
}

/**
 * The linked fields of the module `prefix`, filled from the sheet, otherwise from the other module — only from what is
 * shown and filled. A tick is set only when the category has exactly one tick here («VVVF» from the argano does not choose
 * on its own between the panel's two kinds of VVVF). A radio group has one choice: only with one category over there —
 * its first option («Doppio Ingresso», not «… Selezionato»).
 */
export function prefillCollegati(prefix: Prefisso, values: FormValues): Valori {
  const attivi = attiviDi(values);
  const fields = new Map(moduloFields(prefix).map((f) => [f.key, f]));
  const valori: Valori = {};
  for (const link of COLLEGAMENTI) {
    if (link.tipo === 'numero') {
      const target = link.membri.find((m): m is MembroModulo => m.luogo === prefix);
      if (!target) continue;
      const source = link.membri.filter((m) => m.luogo !== prefix).map((m) => leggiNumero(m, values, attivi)).find((value): value is string => value !== null);
      if (source) Object.assign(valori, scriviNumero(target, source, fields));
      continue;
    }
    const target = link.membri.find((m) => m.luogo === prefix);
    if (!target) continue;
    for (const m of link.membri) {
      if (m.luogo === prefix) continue;
      const ticked = leggiScelta(m, values, attivi);
      if (!ticked) continue;
      const categorie = new Set(ticked.map((v) => m.voci[v] ?? ''));
      if (target.campo !== undefined) {
        const [categoria] = categorie;
        const voce = Object.keys(target.voci).find((k) => target.voci[k] === categoria);
        if (categorie.size === 1 && voce) valori[target.campo] = voce;
        break;
      }
      for (const categoria of categorie) {
        const voci = Object.keys(target.voci).filter((k) => target.voci[k] === categoria);
        const [only] = voci;
        if (voci.length === 1 && only !== undefined) valori[only] = true;
      }
      break;
    }
  }
  return valori;
}
