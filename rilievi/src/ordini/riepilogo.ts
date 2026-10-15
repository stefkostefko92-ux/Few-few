import type { Scheda } from '@prisma/client';
import { nomeModulo, type ModuloField } from './moduli.js';
import { COLONNE, sceltoNellaScheda, SLOTS, type ModuloSlot } from './registry.js';
import { storedValori } from './valori.js';

/**
 * Попълненото в модулите на доставчиците за печата и PDF-а на картата — на всеки модул, който картата
 * иска (`moduliStampati`, отметките във формата). По групите на модула, само отметнатото, избраното и
 * написаното; етикетите са дословно от модула. Самите модули си остават и като свои PDF-и.
 */

export interface RiepilogoGruppo {
  titolo: string;
  /** Отметнатите кутийки — етикетите им; и избраното в радио група без свой етикет („Anta SX“). */
  spunte: string[];
  /** Написаното и избраното в списък или в радио група с етикет — етикет и стойност. */
  testi: Array<{ label: string; value: string }>;
}

export interface RiepilogoModulo {
  /** „Modulo d'ordine quadri · Pelazza Peppino“; листът за аргано — само заглавието. */
  nome: string;
  gruppi: RiepilogoGruppo[];
}

/** Групите на кой да е от модулите (картите им се различават само по мястото на полетата). */
type Gruppo = {
  titolo: string;
  righe: ReadonlyArray<{ titolo?: string; campi: readonly ModuloField[] }>;
};

/**
 * Какво казва полето: отметката, опцията на радиото (етикетът ѝ) или текстът, или нищо. Текстът на
 * празния модул („-“ на MoviLift) не е написан от човека — не влиза.
 */
function letto(field: ModuloField, value: string | true | undefined): string | true | null {
  if (field.kind === 'check') return value === true ? true : null;
  if (typeof value !== 'string') return null;
  if (field.kind === 'radio') return field.opzioni.find((o) => o.valore === value)?.label ?? null;
  if ('predefinito' in field && value === field.predefinito) return null;
  return value;
}

// „N° Fermate:“ → „N° Fermate“: двоеточието го слага изгледът.
const etichetta = (field: ModuloField): string => field.label.replace(/\s*:\s*$/, '');

type SchedaModuli = Pick<
  Scheda,
  | 'riepilogoOrdini'
  | 'moduliStampati'
  | 'quadroMarca'
  | 'quadroModello'
  | 'quadroOrdine'
  | 'ordineQuadro'
  | 'arganoPreventivo'
  | 'preventivoArgano'
  | 'sospensioni'
  | 'ordineSospensioni'
>;

/**
 * Колоните на модулите, които картата иска в печата. Без общото „riepilogoOrdini“ — нито един; с него,
 * но без списък — и трите (карта отпреди отделния избор или записана от предишния код при откат).
 */
export function moduliStampatiDi(
  scheda: Pick<Scheda, 'riepilogoOrdini' | 'moduliStampati'>,
): ModuloSlot['column'][] {
  if (!scheda.riepilogoOrdini) return [];
  const scelti = COLONNE.filter((col) => scheda.moduliStampati.includes(col));
  return scelti.length > 0 ? scelti : [...COLONNE];
}

export function riepilogoModuli(scheda: SchedaModuli): RiepilogoModulo[] {
  const stampati = moduliStampatiDi(scheda);
  const out: RiepilogoModulo[] = [];
  for (const slot of SLOTS) {
    if (!stampati.includes(slot.column)) continue;
    if (scheda[slot.question] !== true) continue;
    if (!sceltoNellaScheda(slot, (key) => scheda[key as keyof SchedaModuli])) continue;
    const valori = storedValori(slot.modulo, scheda[slot.column]);
    if (!valori) continue;
    const groups: readonly Gruppo[] = slot.modulo.gruppi;
    const gruppi = groups
      .map((gruppo): RiepilogoGruppo => {
        const vista: RiepilogoGruppo = { titolo: gruppo.titolo, spunte: [], testi: [] };
        for (const riga of gruppo.righe) {
          // „Tensione Allarme: 12V“ — отметката сама („12V“) не казва за какво е.
          const conTitolo = (label: string) => (riga.titolo ? `${riga.titolo}: ${label}` : label);
          for (const campo of riga.campi) {
            const value = letto(campo, valori[campo.key]);
            if (value === null) continue;
            if (value === true) vista.spunte.push(conTitolo(campo.label));
            else if (campo.kind === 'radio' && campo.labelNascosta) vista.spunte.push(value);
            else vista.testi.push({ label: conTitolo(etichetta(campo)), value });
          }
        }
        return vista;
      })
      .filter((gruppo) => gruppo.spunte.length > 0 || gruppo.testi.length > 0);
    if (gruppi.length > 0) {
      out.push({ nome: nomeModulo(slot.modulo), gruppi });
    }
  }
  return out;
}
