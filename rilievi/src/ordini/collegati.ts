import { createHash } from 'node:crypto';
import type { Translator } from '../i18n.js';
import type { FormValues } from '../schede/field-parsers.js';
import { activeFields, fieldByKey } from '../schede/fields.js';
import { rispostaLabel } from '../schede/format.js';
import {
  COLLEGAMENTI,
  confrontato,
  moduloFields,
  type Luogo,
  type MembroNumero,
  type MembroScelta,
} from './collegamenti.js';
import type { ModuloField } from './moduli.js';
import { opzioneDi } from './opzioni.js';
import { slotAperto, SLOTS, type Prefisso } from './registry.js';
import { nameOf, type Valori } from './valori.js';

/**
 * Правилата върху свързаните данни (списъкът е в collegamenti-elenco.ts):
 * - попълването: празно поле на модул взема стойността от картата, иначе от другия модул;
 * - разминаванията: две попълнени места с различни стойности → списък в модулите и потвърждение при
 *   запис. Празното не е твърдение и не се сравнява; скритото (поле с условие, затворен модул) — също;
 *   връзка „само попълване“ (`confronto: false`) — никога.
 * Същото прави public/js/collegati.js, докато се пише — там и празното поле на картата следва
 * модулите (`collegatiPerBrowser` му дава списъка).
 */

type MembroModulo = Exclude<MembroNumero, { luogo: 'scheda' }>;

interface Attivi {
  scheda: Set<string>;
  moduli: Set<Prefisso>;
}

/** Кое се вижда: полетата на картата по условията им, модулите — при „Sì“ на въпроса си. */
function attiviDi(values: FormValues): Attivi {
  const scheda = activeFields((key) => values[key]);
  const moduli = new Set<Prefisso>(
    SLOTS.filter((s) => slotAperto(s, scheda, (key) => values[key])).map((s) => s.prefix),
  );
  return { scheda, moduli };
}

const testo = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** Какво пише на едно място, или null — празно или скрито. */
function leggiNumero(m: MembroNumero, values: FormValues, attivi: Attivi): string | null {
  if (m.luogo === 'scheda') {
    if (!attivi.scheda.has(m.campo)) return null;
    const raw = testo(values[m.campo]);
    // Само собствените ключове на превода: „constructor“ от формата не е отговор.
    const value = m.valori ? (Object.hasOwn(m.valori, raw) ? m.valori[raw] : '') : raw;
    return value || null;
  }
  if (!attivi.moduli.has(m.luogo)) return null;
  if ('campi' in m) {
    const [a, b] = m.campi;
    return coppiaDi(testo(values[nameOf(m.luogo, a)]), testo(values[nameOf(m.luogo, b)])) || null;
  }
  return testo(values[nameOf(m.luogo, m.campo)]) || null;
}

/** Избраното на едно място (ключовете от `voci`, по реда им), или null. */
function leggiScelta(m: MembroScelta, values: FormValues, attivi: Attivi): string[] | null {
  let ticked: string[];
  if (m.luogo === 'scheda') {
    if (!attivi.scheda.has(m.campo)) return null;
    // Отметките (`checks`) са списък, „Sì/No“ — един отговор.
    const value = values[m.campo];
    const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    ticked = Object.keys(m.voci).filter((v) => list.includes(v));
  } else {
    if (!attivi.moduli.has(m.luogo)) return null;
    const radio = m.campo === undefined ? null : values[nameOf(m.luogo, m.campo)];
    ticked = Object.keys(m.voci).filter((k) =>
      m.campo === undefined ? values[nameOf(m.luogo, k)] === 'si' : radio === k,
    );
  }
  return ticked.length ? ticked : null;
}

const NUMERO = /[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;
const MIGLIAIA = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;

/**
 * Числата в текста, по италиански: „1.000“ е хиляда, „1,6“ и „1.6“ са едно и също, мерните единици
 * не пречат („400 V“ = „400“). Същото е в public/js/collegati.js.
 */
export function numeriDi(text: string): number[] {
  return Array.from(text.matchAll(NUMERO), ([token]) =>
    Number(
      MIGLIAIA.test(token) ? token.replace(/\./g, '').replace(',', '.') : token.replace(',', '.'),
    ),
  );
}

/** Двата реда на едно нещо („LUCE PORTA: [800] x [2000]“) като една стойност; без широчина — нищо. */
export function coppiaDi(larghezza: string, altezza: string): string {
  if (!larghezza) return '';
  return altezza ? `${larghezza} x ${altezza}` : larghezza;
}

/** Обратното: числата на стойността в двата реда („800x2000 mm“ → 800 и 2000); повече от две — нищо. */
export function dividiCoppia(value: string): readonly [string, string] | null {
  const parti = value.match(NUMERO) ?? [];
  if (parti.length === 0 || parti.length > 2) return null;
  return [parti[0]!, parti[1] ?? ''];
}

const normale = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Една и съща стойност: същите числа в същия ред, а текст без числа — същият текст. */
export function stessoValore(a: string, b: string): boolean {
  const na = numeriDi(a);
  const nb = numeriDi(b);
  if (na.length > 0 || nb.length > 0) {
    return na.length === nb.length && na.every((n, i) => Math.abs(n - nb[i]!) < 1e-9);
  }
  return normale(a) === normale(b);
}

export interface VoceDiscrepanza {
  luogo: Luogo;
  valore: string;
}
export interface Discrepanza {
  key: string;
  voci: VoceDiscrepanza[];
}

function etichetta(m: MembroScelta, voce: string, t: Translator): string {
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
 * Разминаванията: връзките, в които поне две места казват различни неща. При числата — различни числа;
 * при отметките — нито една обща категория („2 Velocità“ срещу „VVVF“).
 */
export function discrepanzeDi(values: FormValues, t: Translator): Discrepanza[] {
  const attivi = attiviDi(values);
  const out: Discrepanza[] = [];
  for (const link of COLLEGAMENTI) {
    if (!confrontato(link)) continue;
    if (link.tipo === 'numero') {
      const voci = link.membri.flatMap((m): VoceDiscrepanza[] => {
        const valore = leggiNumero(m, values, attivi);
        return valore ? [{ luogo: m.luogo, valore }] : [];
      });
      if (voci.length > 1 && voci.some((v) => !stessoValore(v.valore, voci[0]!.valore))) {
        out.push({ key: link.key, voci });
      }
      continue;
    }
    const letture = link.membri.flatMap((m) => {
      const ticked = leggiScelta(m, values, attivi);
      return ticked ? [{ m, ticked, categorie: new Set(ticked.map((v) => m.voci[v]!)) }] : [];
    });
    const conflitto = letture.some((a, i) =>
      letture.slice(i + 1).some((b) => ![...a.categorie].some((c) => b.categorie.has(c))),
    );
    if (conflitto) {
      out.push({
        key: link.key,
        voci: letture.map(({ m, ticked }) => ({
          luogo: m.luogo,
          valore: ticked.map((v) => etichetta(m, v, t)).join(', '),
        })),
      });
    }
  }
  return out;
}

/**
 * Отпечатъкът на точно тези разминавания: потвърждението при запис важи само за тях — промяна след
 * него (ново разминаване, друга стойност) иска ново потвърждение.
 */
export function improntaDi(discrepanze: readonly Discrepanza[]): string {
  const canonical = JSON.stringify(
    discrepanze.map((d) => [d.key, ...d.voci.map((v) => `${v.luogo}=${v.valore}`)]),
  );
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * Стойността в полето на модула: ред — отрязана до дължината му; падащ списък — опцията ѝ (същата дума
 * или същите числа, иначе нищо); двата реда — числата ѝ.
 */
function scriviNumero(
  target: MembroModulo,
  value: string,
  fields: ReadonlyMap<string, ModuloField>,
): Valori {
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
 * Свързаните полета на модула `prefix`, попълнени от картата, иначе от другия модул — само от видимо и
 * попълнено. Отметка се слага само когато категорията има точно една отметка тук („VVVF“ от аргано не
 * избира сама между двата вида VVVF на таблото). Радио групата има един избор: само при една
 * категория отсреща — първата ѝ опция („Doppio Ingresso“, не „… Selezionato“).
 */
export function prefillCollegati(prefix: Prefisso, values: FormValues): Valori {
  const attivi = attiviDi(values);
  const fields = new Map(moduloFields(prefix).map((f) => [f.key, f]));
  const valori: Valori = {};
  for (const link of COLLEGAMENTI) {
    if (link.tipo === 'numero') {
      const target = link.membri.find((m): m is MembroModulo => m.luogo === prefix);
      if (!target) continue;
      const source = link.membri
        .filter((m) => m.luogo !== prefix)
        .map((m) => leggiNumero(m, values, attivi))
        .find((value): value is string => value !== null);
      if (source) Object.assign(valori, scriviNumero(target, source, fields));
      continue;
    }
    const target = link.membri.find((m) => m.luogo === prefix);
    if (!target) continue;
    for (const m of link.membri) {
      if (m.luogo === prefix) continue;
      const ticked = leggiScelta(m, values, attivi);
      if (!ticked) continue;
      const categorie = new Set(ticked.map((v) => m.voci[v]!));
      if (target.campo !== undefined) {
        const [categoria] = categorie;
        const voce = Object.keys(target.voci).find((k) => target.voci[k] === categoria);
        if (categorie.size === 1 && voce) valori[target.campo] = voce;
        break;
      }
      for (const categoria of categorie) {
        const voci = Object.keys(target.voci).filter((k) => target.voci[k] === categoria);
        if (voci.length === 1) valori[voci[0]!] = true;
      }
      break;
    }
  }
  return valori;
}
