// The traction cases of the relazione, each with its tensions (UNI EN 81-50:2020, 5.11): the loading, the emergency
// braking at the minimum deceleration and at the brake's real one (a warning), the stalled car or counterweight; and the
// limits of the calculation model stated before the checks. Pure.
import { deg } from '@/calc/math';
import { K, VOCI } from '@/calc/norme';
import type { BrakeCase, CheckStatus, Machine, Plant, Results, TractionCase } from '@/calc/types';
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
  cases(`${t('tr_real')}: decelerazione data dal freno (${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m), solo avviso`, res.brkReal, true);
  B.push({ t: 'h3', text: `${t('tr_stall')} (UNI EN 81-50:2020, 5.11.2.2.3): cabina vuota nella posizione più alta e in quella più bassa` });
  const stalls = [res.stall, res.stallLow], stallStatus = stalls.map((s) => (s.ratio >= s.efa ? 'ok' : 'fail'));
  B.push({ t: 'grid', head: [...caseHead.slice(0, 8), 'Condizione'], rows: stalls.map((s, k) => [`${t(s.pos === 'b' ? 'st_car' : 'st_cw')}: ${t('cs_e')}, ${t(s.pos === 'b' ? 'at_b' : 'at_t')}`,
    fmt(deg(s.alpha), 1), fmt(s.mu, 4), fmt(s.f, 4), fmt(s.efa, 3), fmt(s.T1, 0), fmt(s.T2, 0), fmt(s.ratio, 2), `≥ e^(f·α): ${st(stallStatus[k])}`]),
  status: stallStatus, widths: STALL_W });
  return B;
}

/** Registry entries with no check of their own that bound where the calculation holds: the compensation and the
 *  travelling cable kept inside P, the tolerance of the real speed on the rated one (registry, group modello). */
export const LIMITI_MODELLO: readonly string[] = ['modello.compensazione', 'azionamento.tolleranza.velocita'];

/** The limits of the calculation model, stated before the checks: what the engineer who signs must know holds. */
export function limitiBlocks(): ReportBlock[] {
  const voci = VOCI.filter((v) => LIMITI_MODELLO.includes(v.id));
  return [{ t: 'list', items: voci.map((v) => `⚠ ${v.titolo}: ${v.valore}${v.nota ? `. ${v.nota}` : ''} (${v.riferimento})`) }];
}
