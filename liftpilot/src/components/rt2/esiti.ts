// How the RT's screens write a check's outcome and its limit. Pure.
import { fmt } from '@/lib/rt2/campi';
import type { EsitoVerificaRt2, VerificaRt2 } from '@/lib/rt2/types';

export const ESITO_TESTO: Readonly<Record<EsitoVerificaRt2, string>> = { ok: 'OK', fail: 'Non verificata', warn: 'Attenzione', info: 'Informazione' };
const SEGNO = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', tra: '' } as const;

export function limiteTesto(v: VerificaRt2): string {
  if (v.limite === null) return '—';
  if (v.confronto === 'tra') return `${fmt(v.limite, v.dec)} … ${fmt(v.limite2 ?? null, v.dec)}`;
  return `${SEGNO[v.confronto]} ${fmt(v.limite, v.dec)}${v.unita ? ` ${v.unita}` : ''}`;
}
