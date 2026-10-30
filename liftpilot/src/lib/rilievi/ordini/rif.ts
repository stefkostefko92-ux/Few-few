// The lift's reference in the suppliers' modules ("N° 104552 — Matr. 0033871 — Via Verdi 14"), apart from the maps:
// the browser's prefill (prefill-client.ts) needs it without loading the modules' maps (moduli.ts). Ported 1:1 from
// rilievi (src/ordini/prefill.ts).
import type { FormValues } from '../field-parsers';

const text = (values: FormValues, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value.trim() : '';
};

/** "N° 104552 — Matr. 0033871 — Via Verdi 14": whichever of the three there is. */
export function rifImpianto(values: FormValues): string {
  const numero = text(values, 'numeroImpianto');
  const matricola = text(values, 'matricola');
  const indirizzo = text(values, 'indirizzo');
  return [numero && `N° ${numero}`, matricola && `Matr. ${matricola}`, indirizzo].filter(Boolean).join(' — ');
}
