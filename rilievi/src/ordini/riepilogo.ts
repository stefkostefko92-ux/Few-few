import type { Scheda } from '@prisma/client';
import { nomeModulo, type ModuloField } from './moduli.js';
import { SLOTS } from './registry.js';
import { storedValori } from './valori.js';

/**
 * Попълненото в модулите на доставчиците за печата и PDF-а на картата — когато картата го иска
 * (`riepilogoOrdini`, отметка във формата). По групите на модула, само отметнатото, избраното и
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
type Gruppo = { titolo: string; righe: ReadonlyArray<{ campi: readonly ModuloField[] }> };

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
  | 'quadroMarca'
  | 'quadroOrdine'
  | 'ordineQuadro'
  | 'arganoPreventivo'
  | 'preventivoArgano'
  | 'sospensioni'
  | 'ordineSospensioni'
>;

export function riepilogoModuli(scheda: SchedaModuli): RiepilogoModulo[] {
  if (!scheda.riepilogoOrdini) return [];
  const out: RiepilogoModulo[] = [];
  for (const slot of SLOTS) {
    if (scheda[slot.question] !== true) continue;
    if (slot.marca && scheda[slot.marca.field] !== slot.marca.value) continue;
    const valori = storedValori(slot.modulo, scheda[slot.column]);
    if (!valori) continue;
    const groups: readonly Gruppo[] = slot.modulo.gruppi;
    const gruppi = groups
      .map((gruppo): RiepilogoGruppo => {
        const vista: RiepilogoGruppo = { titolo: gruppo.titolo, spunte: [], testi: [] };
        for (const campo of gruppo.righe.flatMap((riga) => riga.campi)) {
          const value = letto(campo, valori[campo.key]);
          if (value === null) continue;
          if (value === true) vista.spunte.push(campo.label);
          else if (campo.kind === 'radio' && campo.labelNascosta) vista.spunte.push(value);
          else vista.testi.push({ label: etichetta(campo), value });
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
