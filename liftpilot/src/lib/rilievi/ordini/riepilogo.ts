// What is filled in the suppliers' modules, for the sheet's print and PDF — when the sheet asks for it (`riepilogoOrdini`,
// a tick in the form). By the module's groups, only what is ticked, chosen and written; the labels verbatim from the
// module. The modules themselves stay their own PDFs too. Ported 1:1 from rilievi (src/ordini/riepilogo.ts, commit
// ae6329cb6).
import type { Scheda } from '@prisma/client';
import { nomeModulo, type ModuloField } from './moduli';
import { SLOTS } from './registry';
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
type Gruppo = { titolo: string; righe: ReadonlyArray<{ campi: readonly ModuloField[] }> };

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

export type SchedaModuli = Pick<Scheda, 'riepilogoOrdini' | 'quadroMarca' | 'quadroOrdine' | 'ordineQuadro' | 'arganoPreventivo' | 'preventivoArgano' | 'sospensioni' | 'ordineSospensioni'>;

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
    if (gruppi.length > 0) out.push({ nome: nomeModulo(slot.modulo), gruppi });
  }
  return out;
}
