// The lines the components' pages share: a value «Etichetta  sym:  valore  unità» with its check's outcome, and the
// section of the checks LiftPilot adds to a page of the owner's model where the model stops short of the standard
// (each with its value, limit and clause). Pure.
import type { FBlock, FRiga } from '../../report/rt2/model';
import { fmt } from '../campi';
import type { EsitoVerificaRt2, VerificaRt2 } from '../types';

export const valore = (l: string, sym: string, v: string, u = '', esito?: EsitoVerificaRt2): FRiga =>
  ({ t: 'val', l, ...(sym ? { sym } : {}), v, ...(u ? { u } : {}), ...(esito && esito !== 'info' ? { esito } : {}) });

const SEGNO: Readonly<Record<VerificaRt2['confronto'], string>> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', tra: '' };

/** «≥ 12», «≤ 1,00», «2,5 … 4» — the limit of a check as a page writes it. */
export function limiteDi(v: VerificaRt2): string {
  if (v.limite === null) return '';
  if (v.confronto === 'tra') return `${fmt(v.limite, v.dec)} … ${fmt(v.limite2 ?? null, v.dec)}`;
  return `${SEGNO[v.confronto]} ${fmt(v.limite, v.dec)}`;
}

/** The section «Verifiche secondo la norma» of the checks given (none: no section). */
export function righeCorrezioni(vs: readonly VerificaRt2[]): FBlock[] {
  if (!vs.length) return [];
  const righe: FRiga[] = vs.flatMap((v): FRiga[] => [
    valore(v.testo, '', `${fmt(v.valore, v.dec)}${v.unita ? ` ${v.unita}` : ''}`, limiteDi(v), v.esito),
    { t: 'testo', s: v.rif },
  ]);
  return [{ t: 'sez', l: 'Verifiche secondo la norma:', righe }];
}
