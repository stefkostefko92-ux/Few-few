import { createHash } from 'node:crypto';
import type { Translator } from '../i18n.js';
import type { FormValues } from '../schede/field-parsers.js';
import { activeFields } from '../schede/fields.js';
import {
  COLLEGAMENTI,
  moduloFields,
  type Luogo,
  type MembroNumero,
  type MembroScelta,
} from './collegamenti.js';
import { SLOTS, type Prefisso } from './registry.js';
import { nameOf, type Valori } from './valori.js';

/**
 * Правилата върху свързаните данни (списъкът е в collegamenti.ts):
 * - попълването: празно поле на модул взема стойността от картата, иначе от другия модул;
 * - разминаванията: две попълнени места с различни стойности → списък в модулите и потвърждение при
 *   запис. Празното не е твърдение и не се сравнява; скритото (поле с условие, затворен модул) — също.
 * Същото прави public/js/collegati.js, докато се пише (`collegatiPerBrowser` му дава списъка).
 */

interface Attivi {
  scheda: Set<string>;
  moduli: Set<Prefisso>;
}

/** Кое се вижда: полетата на картата по условията им, модулите — при „Sì“ на въпроса си. */
function attiviDi(values: FormValues): Attivi {
  const scheda = activeFields((key) => values[key]);
  const moduli = new Set<Prefisso>(
    SLOTS.filter((s) => scheda.has(s.question) && values[s.question] === 'si').map((s) => s.prefix),
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
  return testo(values[nameOf(m.luogo, m.campo)]) || null;
}

/** Отметнатите на едно място (ключовете им по реда на `voci`), или null. */
function leggiScelta(m: MembroScelta, values: FormValues, attivi: Attivi): string[] | null {
  let ticked: string[];
  if (m.luogo === 'scheda') {
    if (!attivi.scheda.has(m.campo)) return null;
    const list = values[m.campo];
    ticked = Object.keys(m.voci).filter((v) => Array.isArray(list) && list.includes(v));
  } else {
    if (!attivi.moduli.has(m.luogo)) return null;
    ticked = Object.keys(m.voci).filter((k) => values[nameOf(m.luogo, k)] === 'si');
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
  if (m.luogo === 'scheda') return t(`scheda.option.${m.campo}.${voce}`);
  return moduloFields(m.luogo).find((f) => f.key === voce)?.label ?? voce;
}

/**
 * Разминаванията: връзките, в които поне две места казват различни неща. При числата — различни числа;
 * при отметките — нито една обща категория („2 Velocità“ срещу „VVVF“).
 */
export function discrepanzeDi(values: FormValues, t: Translator): Discrepanza[] {
  const attivi = attiviDi(values);
  const out: Discrepanza[] = [];
  for (const link of COLLEGAMENTI) {
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
 * Свързаните полета на модула `prefix`, попълнени от картата, иначе от другия модул — само от видимо и
 * попълнено. Отметка се слага само когато категорията има точно една отметка тук („VVVF“ от аргано не
 * избира сама между двата вида VVVF на таблото).
 */
export function prefillCollegati(prefix: Prefisso, values: FormValues): Valori {
  const attivi = attiviDi(values);
  const lengths = new Map(
    moduloFields(prefix).map((f) => [f.key, f.kind === 'check' ? 0 : f.maxLength]),
  );
  const valori: Valori = {};
  for (const link of COLLEGAMENTI) {
    if (link.tipo === 'numero') {
      const target = link.membri.find((m) => m.luogo === prefix);
      if (!target) continue;
      const source = link.membri
        .filter((m) => m.luogo !== prefix)
        .map((m) => leggiNumero(m, values, attivi))
        .find((value): value is string => value !== null);
      if (source) valori[target.campo] = source.slice(0, lengths.get(target.campo));
      continue;
    }
    const target = link.membri.find((m) => m.luogo === prefix);
    if (!target) continue;
    for (const m of link.membri) {
      if (m.luogo === prefix) continue;
      const ticked = leggiScelta(m, values, attivi);
      if (!ticked) continue;
      for (const categoria of new Set(ticked.map((v) => m.voci[v]!))) {
        const voci = Object.keys(target.voci).filter((k) => target.voci[k] === categoria);
        if (voci.length === 1) valori[voci[0]!] = true;
      }
      break;
    }
  }
  return valori;
}

/** Връзките за браузъра (public/js/collegati.js) — с имената им и на местата, без нищо от данните. */
export function collegatiPerBrowser(t: Translator): string {
  const data = {
    luoghi: {
      scheda: t('collegati.luogo.scheda'),
      oq: t('collegati.luogo.oq'),
      pa: t('collegati.luogo.pa'),
    },
    gruppi: COLLEGAMENTI.map((link) => ({ ...link, nome: t(`collegati.${link.key}`) })),
  };
  // В <script type="application/json">: „<“ не бива да затвори елемента.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
