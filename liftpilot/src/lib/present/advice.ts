// The words of the advice (src/lib/lift/advice.ts) the screens and the documents share: the machine's name, the speed's
// deviation, the values of the reason the first machine comes before the second (messages advice.why_*), the models left
// out before the calculation. Pure.
import { ADVICE_BRANDS, ADVICE_MODELS, type MachineAdvice, type MachineCandidate } from '@/lib/lift/advice';

type Fmt = (x: number, dec?: number) => string;

export const machineName = (c: { brand: string; model: string }): string => `${c.brand} ${c.model}`;

/** A text of the advice with its values, without the message format (the documents' Italian has no plurals there). */
export const fillText = (s: string, v: Readonly<Record<string, string | number>>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => String(v[k] ?? m));

/** The car's speed at mains frequency against the rated one [%], signed: "+1,2", "−0,8". */
export const dvText = (dv: number, fmt: Fmt): string => `${dv >= 0 ? '+' : '−'}${fmt(Math.abs(dv) * 100, 1)}`;

/** The values the reasons take, for the first `a` and the second `b`. */
export function whyValues(a: MachineCandidate, b: MachineCandidate | undefined, fmt: Fmt): Record<string, string | number> {
  return {
    a: machineName(a), b: b ? machineName(b) : '', code: a.bedplate?.code ?? '', na: a.warns, nb: b?.warns ?? 0, fa: a.fails, fb: b?.fails ?? 0,
    sa: fmt(a.staticKg, 0), sb: b ? fmt(b.staticKg, 0) : '', test: fmt(a.testKg, 0), dva: dvText(a.dv, fmt), dvb: b ? dvText(b.dv, fmt) : '',
    ma: a.mass === null ? '—' : fmt(a.mass, 0), mb: b && b.mass !== null ? fmt(b.mass, 0) : '—',
  };
}

/** The models of the advice's makers whose catalogue does not take the installation (no candidate), by maker:
 *  "SICOR SV110, SH110B · Montanari M65"; empty when every model was verified. */
export function excludedText(A: MachineAdvice): string {
  const out = (m: { brand: string; model: string }): boolean => !A.candidates.some((c) => c.brand === m.brand && c.model === m.model);
  return ADVICE_BRANDS.flatMap((b) => {
    const models = ADVICE_MODELS.filter((m) => m.brand === b && out(m)).map((m) => m.model);
    return models.length ? [`${b} ${models.join(', ')}`] : [];
  }).join(' · ');
}
