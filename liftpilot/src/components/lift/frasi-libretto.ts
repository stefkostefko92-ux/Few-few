// The sentences of the logbook's speed and travel against the calculation's (round 46, DatiLibretto's live line):
// out of the component in round 47 (owner's decision D1), so that «Calcolo argano»'s parts say the same words beside a
// «No» from the documents — one text, one place; a speed within 5 % keeps the DPR's caveat (round 47 review). The key of the `lift` texts and its values; an increase against the
// reference (15.1), a decrease against the logbook's speed (15.16): the documents' comparisons. Pure.
import { variazioneCorsa, variazioneVelocita, type Libretto, type Norma10411 } from '@/lib/lift/modifica';
import type { Fmt } from '@/lib/present/tr';

/** A sentence: its key among the `lift` texts and its values; whether the change counts, and over 8 m (the travel). */
export interface Frase { key: string; values: Record<string, string>; variata: boolean; oltre8: boolean }

const pct = (fmt: Fmt, x: number): string => `${x < 0 ? '−' : '+'}${fmt(Math.abs(x) * 100, 1)} %`;

/** The speed's sentence: null without a documented speed or the calculation's (`v` null). */
export function fraseVelocita(norma: Norma10411, L: Libretto | undefined, v: number | null, fmt: Fmt): Frase | null {
  const xv = v !== null ? variazioneVelocita(norma, L, v) : null, [c0, c1] = xv?.confronti ?? [];
  if (!xv || !c0) return null;
  const uno = norma === '10411-1', p = (x: number): string => pct(fmt, x);
  const clausola = !uno ? 'UNI 10411-11, 15' : xv.aumento ? 'UNI 10411-1, 15.1' : 'UNI 10411-1, 15.16';
  const f = (key: string, values: Record<string, string> = {}): Frase => ({ key, values, variata: xv.variata, oltre8: false });
  return xv.variata ? f('lib_v_variata', { dv: p(c0.dv), rif: fmt(c0.rispetto, 2), clausola })
    : !uno || xv.uguale ? f('lib_v_uguale')
      : c1 ? f('lib_v_tra', { dv1: p(c0.dv), v1: fmt(c0.rispetto, 2), dv2: p(c1.dv), v2: fmt(c1.rispetto, 2) })
        // the one after 50 Hz alone: a reduction (15.16) is not measured, below it or over it (round 47 review)
        : !L?.v ? f('lib_v_sotto50', { dv: p(c0.dv), rif: fmt(c0.rispetto, 2) }) : f('lib_v_entro', { dv: p(c0.dv), rif: fmt(c0.rispetto, 2) });
}

/** The travel's sentence: null without a documented travel or the calculation's (`H` null). */
export function fraseCorsa(norma: Norma10411, L: Libretto | undefined, H: number | null, fmt: Fmt): Frase | null {
  const xh = H !== null ? variazioneCorsa(norma, L, H) : null;
  if (!xh || !L?.H) return null;
  const m = `${xh.dH < 0 ? '−' : '+'}${fmt(Math.abs(xh.dH), 2)} m`;
  return xh.variata
    ? { key: 'lib_H_variata', values: { dH: m, H: fmt(L.H, 2), clausola: norma === '10411-1' ? 'UNI 10411-1, 16' : 'UNI 10411-11, 16' }, variata: true, oltre8: xh.oltre8 }
    : { key: 'lib_H_uguale', values: {}, variata: false, oltre8: xh.oltre8 };
}
