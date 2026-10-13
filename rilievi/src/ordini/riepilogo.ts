import type { Scheda } from '@prisma/client';
import type { ModuloField } from './moduli.js';
import { SLOTS } from './registry.js';
import { storedValori } from './valori.js';

/**
 * Попълненото в модулите на доставчиците за печата и PDF-а на картата — когато картата го иска
 * (`riepilogoOrdini`, отметка във формата). По групите на модула, само отметнатото и написаното;
 * етикетите са дословно от модула. Самите модули си остават и като свои PDF-и.
 */

export interface RiepilogoGruppo {
  titolo: string;
  /** Отметнатите кутийки — етикетите им. */
  spunte: string[];
  /** Написаното — етикет и стойност. */
  testi: Array<{ label: string; value: string }>;
}

export interface RiepilogoModulo {
  titolo: string;
  fornitore: string;
  gruppi: RiepilogoGruppo[];
}

/** Групите на кой да е от двата модула (картите им се различават само по координатите). */
type Gruppo = { titolo: string; righe: ReadonlyArray<{ campi: readonly ModuloField[] }> };

type SchedaModuli = Pick<
  Scheda,
  'riepilogoOrdini' | 'quadroOrdine' | 'ordineQuadro' | 'arganoPreventivo' | 'preventivoArgano'
>;

export function riepilogoModuli(scheda: SchedaModuli): RiepilogoModulo[] {
  if (!scheda.riepilogoOrdini) return [];
  const out: RiepilogoModulo[] = [];
  for (const slot of SLOTS) {
    if (scheda[slot.question] !== true) continue;
    const valori = storedValori(slot.modulo, scheda[slot.column]);
    if (!valori) continue;
    const groups: readonly Gruppo[] = slot.modulo.gruppi;
    const gruppi = groups
      .map((gruppo): RiepilogoGruppo => {
        const campi = gruppo.righe.flatMap((riga) => riga.campi);
        return {
          titolo: gruppo.titolo,
          spunte: campi
            .filter((c) => c.kind === 'check' && valori[c.key] === true)
            .map((c) => c.label),
          testi: campi.flatMap((c) => {
            const value = valori[c.key];
            // „N° Fermate:“ → „N° Fermate“: двоеточието го слага изгледът.
            return c.kind !== 'check' && typeof value === 'string'
              ? [{ label: c.label.replace(/\s*:\s*$/, ''), value }]
              : [];
          }),
        };
      })
      .filter((gruppo) => gruppo.spunte.length > 0 || gruppo.testi.length > 0);
    if (gruppi.length > 0) {
      out.push({ titolo: slot.modulo.titolo, fornitore: slot.modulo.fornitore, gruppi });
    }
  }
  return out;
}
