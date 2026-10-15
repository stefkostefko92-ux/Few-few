// The traction cases of the relazione, each with its tensions (UNI EN 81-50:2020, 5.11): the loading, the emergency
// braking at the minimum deceleration and at the brake's real one (a warning; with the acceptance test of UNI EN
// 81-20:2020, 6.3.3 b) among its cases), the stalled car or counterweight; the stability against slipping of UNI
// 10411-1:2024 D.1 when a modification under it changes the ratio of the suspended loads (6.1, round 46: its two
// cases, and its sentence in the data's «Variazione dei carichi»); and the limits of the calculation model stated
// before the checks. Pure.
import { deg } from '@/calc/math';
import { K, VOCI } from '@/calc/norme';
import type { BrakeCase, CheckStatus, FormValues, Machine, Plant, Results, TractionCase } from '@/calc/types';
import type { Collaudo } from '../lift/collaudo';
import { d1Di } from '../lift/rapporto';
import type { Pres } from '../present/tr';
import type { BlockStatus, ReportBlock } from './model';

const CASE_W = [0.3, 0.07, 0.08, 0.08, 0.08, 0.1, 0.1, 0.09, 0.1];
// the stalled cases: the last column holds the condition with its result
const STALL_W = [0.27, 0.07, 0.08, 0.08, 0.08, 0.09, 0.08, 0.08, 0.17];

const utilStatus = (u: number, warnOnly = false): BlockStatus => (u > 1 && !warnOnly ? 'fail' : u > K.tractionWarn ? 'warn' : 'ok');

/** Every traction case of the calculation, in tables. */
export function casesBlocks(P: Pres, I: Plant, N: Machine, res: Results, caseText: (c: TractionCase | BrakeCase) => string, st: (s: CheckStatus) => string): ReportBlock[] {
  const { t, fmt } = P, B: ReportBlock[] = [];
  const caseHead = ['Caso', 'α [°]', 'μ', 'f', 'e^(f·α)', 'T1 [N]', 'T2 [N]', 'T1/T2', 'Utilizzo'];
  const caseRow = (c: TractionCase | BrakeCase): string[] => [caseText(c), fmt(deg(c.alpha), 1), fmt(c.mu, 4), fmt(c.f, 4), fmt(c.efa, 3), fmt(c.T1, 0), fmt(c.T2, 0), fmt(c.ratio, 3), fmt(c.util, 3)];
  const cases = (title: string, list: readonly (TractionCase | BrakeCase)[], warnOnly = false): void => {
    B.push({ t: 'h3', text: title });
    B.push({ t: 'grid', head: caseHead, rows: list.map(caseRow), status: list.map((c) => utilStatus(c.util, warnOnly)), widths: CASE_W });
  };
  cases(`${t('tr_load')} (UNI EN 81-50:2020, 5.11)`, res.loadCases);
  cases(`Frenatura di emergenza alla decelerazione minima di ${fmt(I.ae, 1)} m/s² (UNI EN 81-50:2020, 5.11.2.2.2)`, res.brk);
  cases(`${t('tr_real')}: decelerazione data dal freno (${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m), con la prova di aderenza della UNI EN 81-20:2020, 6.3.3 b); solo avviso`, res.brkReal, true);
  B.push({ t: 'h3', text: `${t('tr_stall')} (UNI EN 81-50:2020, 5.11.2.2.3): cabina vuota nella posizione più alta e in quella più bassa` });
  const stalls = [res.stall, res.stallLow], stallStatus = stalls.map((s) => (s.ratio >= s.efa ? 'ok' : 'fail'));
  B.push({ t: 'grid', head: [...caseHead.slice(0, 8), 'Condizione'], rows: stalls.map((s, k) => [`${t(s.pos === 'b' ? 'st_car' : 'st_cw')}: ${t('cs_e')}, ${t(s.pos === 'b' ? 'at_b' : 'at_t')}`,
    fmt(deg(s.alpha), 1), fmt(s.mu, 4), fmt(s.f, 4), fmt(s.efa, 3), fmt(s.T1, 0), fmt(s.T2, 0), fmt(s.ratio, 2), `≥ e^(f·α): ${st(stallStatus[k])}`]),
  status: stallStatus, widths: STALL_W });
  return B;
}

const d1Ok = (u: number): boolean => u <= 1 + 1e-9;

/** D.1 (lift/rapporto.ts d1Di) in tables: its two cases with the static pulls, then C1, C2 and f; none when not asked. */
export function d1Blocks(P: Pres, C: Collaudo, V: FormValues): ReportBlock[] {
  const d = d1Di(C, V), { fmt } = P;
  if (!d) return [];
  const util = (u: number): string => (Number.isFinite(u) ? fmt(u, 3) : '—'), gola = d.C2 === K.c2Wedge ? 'gola a cuneo' : 'gola semicircolare';
  return [
    { t: 'h3', text: 'Stabilità allo scorrimento con il rapporto tra i carichi cambiato (UNI 10411-1:2024, 6.1 e D.1)' },
    { t: 'grid', head: ['Caso', 'α [°]', 'f', 'e^(f·α)', 'T1 [N]', 'T2 [N]', 'T1/T2', '(T1/T2)·C1·C2', 'Utilizzo'], widths: CASE_W,
      rows: d.cases.map((c) => [c.pos === 'b' ? `Cabina al piano più basso con ${fmt(K.loadTestFactor, 2)}·Q` : 'Cabina vuota al piano più alto', fmt(deg(c.alpha), 1),
        fmt(d.f, 4), fmt(c.efa, 3), fmt(c.T1, 0), fmt(c.T2, 0), Number.isFinite(c.ratio) ? fmt(c.ratio, 3) : '—', util(c.lhs), util(c.util)]),
      status: d.cases.map((c) => (d1Ok(c.util) ? 'ok' : 'fail')) },
    { t: 'p', style: 'note', text: `C1 = ${fmt(d.C1, 3)}: (g + a)/(g − a) con a = ${fmt(d.a, 2)} m/s², la decelerazione della verifica di frenatura del `
      + `calcolo (a_e), mai sotto ${fmt(d.c1Min, 2)} a ${fmt(d.v, 2)} m/s; C2 = ${fmt(d.C2, d.C2 % 1 ? 1 : 0)} (${gola}); μ = ${fmt(d.mu, 2)}. La condizione (T1/T2)·C1·C2 ≤ `
      + `e^(f·α) ${d1Ok(d.worst.util) ? `è soddisfatta in entrambi i casi con a = ${fmt(d.a, 2)} m/s²` : 'non è soddisfatta: il rapporto tra i carichi non può cambiare così'}. `
      + 'Quale decelerazione di frenatura della cabina intenda la D.1 la norma non lo precisa: il software prende quella della verifica di frenatura '
      + 'del calcolo; la frenatura con la coppia reale del freno (nei casi dell’aderenza) decelera di più e darebbe un C1 maggiore. L’esito vale con la '
      + 'a indicata: la decelerazione da usare la conferma il soggetto della verifica, e con una maggiore il tecnico ripete la verifica. Con la D.1 '
      + 'servono la D.2 (pressione specifica nelle gole) e gli ammortizzatori secondo la UNI EN 81-20, 5.8 (voci modifica.d1 e rapporto.d1 del registro).' },
  ];
}

/** D.1 in one sentence (opened by a space) for the data's «Variazione dei carichi» (report/collaudo.ts); '' when not
 *  asked. */
export function d1Frase(C: Collaudo, V: FormValues | undefined): string {
  const d = V ? d1Di(C, V) : null, u = d?.worst.util;
  if (u === undefined) return '';
  const n = Number.isFinite(u) ? new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(u) : '—';
  const a = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(d?.a ?? 0);
  return ` Stabilità allo scorrimento (D.1): utilizzo ${n} nel caso più sfavorevole con a = ${a} m/s², ${d1Ok(u) ? 'verificata con questa decelerazione, da '
    + 'confermare con il soggetto della verifica' : '⚠ non verificata'}.`;
}

/** Registry entries with no check of their own that bound where the calculation holds: the compensation and the
 *  travelling cable kept inside P, the tolerance of the real speed on the rated one (registry, group modello). */
export const LIMITI_MODELLO: readonly string[] = ['modello.compensazione', 'azionamento.tolleranza.velocita'];

/** The limits of the calculation model, stated before the checks: what the engineer who signs must know holds. */
export function limitiBlocks(): ReportBlock[] {
  const voci = VOCI.filter((v) => LIMITI_MODELLO.includes(v.id));
  return [{ t: 'list', items: voci.map((v) => `⚠ ${v.titolo}: ${v.valore}${v.nota ? `. ${v.nota}` : ''} (${v.riferimento})`) }];
}
