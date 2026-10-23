// What is filled in the suppliers' modules, for the sheet's print and PDF — of every module the sheet asks for
// (`moduliStampati`, the ticks in the form). By the module's groups, only what is ticked, chosen and written; the labels
// verbatim from the module. The modules themselves stay their own PDFs too. Ported 1:1 from rilievi
// (src/ordini/riepilogo.ts, commit 988f3cf37).
import type { Scheda } from '@prisma/client';
import { nomeModulo, type ModuloField } from './moduli';
import { COLONNE, sceltoNellaScheda, SLOTS, type ModuloSlot } from './registry';
import { storedValori } from './valori';

export interface RiepilogoGruppo {
  titolo: string;
  /** The ticked boxes — their labels; and the choice of a radio group without a label of its own («Anta SX»). */
  spunte: string[];
  /** The written and the chosen in a list or in a radio group with a label — label and value. */
  testi: Array<{ label: string; value: string }>;
}

export interface RiepilogoModulo {
  /** «Modulo d'ordine quadri · Pelazza Peppino»; the argano sheet — its title alone. */
  nome: string;
  gruppi: RiepilogoGruppo[];
}

/** The groups of any of the modules (their maps differ only by where the fields are). */
type Gruppo = { titolo: string; righe: ReadonlyArray<{ titolo?: string; campi: readonly ModuloField[] }> };

/**
 * What the field says: the tick, the radio's option (its label) or the text, or nothing. The blank module's text («-» of
 * MoviLift) was not written by the person — it does not come in.
 */
function letto(field: ModuloField, value: string | true | undefined): string | true | null {
  if (field.kind === 'check') return value === true ? true : null;
  if (typeof value !== 'string') return null;
  if (field.kind === 'radio') return field.opzioni.find((o) => o.valore === value)?.label ?? null;
  if ('predefinito' in field && value === field.predefinito) return null;
  return value;
}

// «N° Fermate:» → «N° Fermate»: the view puts the colon
const etichetta = (field: ModuloField): string => field.label.replace(/\s*:\s*$/, '');

export type SchedaModuli = Pick<
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
 * The modules' columns the sheet wants in its print. Without the common `riepilogoOrdini` — none; with it but without a
 * list — all three (a sheet from before the choice one by one, or saved by the previous code after a rollback).
 */
export function moduliStampatiDi(scheda: Pick<Scheda, 'riepilogoOrdini' | 'moduliStampati'>): ModuloSlot['column'][] {
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
          // «Tensione Allarme: 12V» — the tick alone («12V») does not say what it is for.
          const conTitolo = (label: string): string => (riga.titolo ? `${riga.titolo}: ${label}` : label);
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
    if (gruppi.length > 0) out.push({ nome: nomeModulo(slot.modulo), gruppi });
  }
  return out;
}
