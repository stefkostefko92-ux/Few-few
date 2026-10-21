// The traction cases of the relazione, each with its tensions (UNI EN 81-50:2020, 5.11): the loading, the emergency
// braking at the minimum deceleration and at the brake's real one (a warning; with the acceptance tests of UNI EN
// 81-20:2020, 6.3.3 a) — the empty car up at the top, among the eight — and b) — 1,25·Q down —, each row naming its own;
// round 48), the stalled car or counterweight; the stability against slipping of UNI
// 10411-1:2024 D.1 when a modification under it changes the ratio of the suspended loads (6.1, round 46: its two
// cases, and its sentence in the data's «Variazione dei carichi»; round 47, D2: its point at the brake test, d1Sito),
// with the specific pressure of its D.2 (round 48: met or not, its table and its sentence); and
// the limits of the calculation model stated before the checks. Pure.
import { deg } from '@/calc/math';
import { K, VOCI } from '@/calc/norme';
import type { BrakeCase, CheckStatus, FormValues, Machine, Plant, Results, TractionCase } from '@/calc/types';
import { ambitoOf, type Collaudo } from '../lift/collaudo';
import { D1_FORMULA, D1_NON_REGGE, D1_PROVA_FRENO } from '../lift/obblighi-variazioni';
import type { PuntoInSito } from '../lift/punti';
import { d1Di, d2Di } from '../lift/rapporto';
import type { Pres } from '../present/tr';
import type { BlockStatus, ReportBlock } from './model';

const CASE_W = [0.3, 0.07, 0.08, 0.08, 0.08, 0.1, 0.1, 0.09, 0.1];
// the stalled cases: the last column holds the condition with its result
const STALL_W = [0.27, 0.07, 0.08, 0.08, 0.08, 0.09, 0.08, 0.08, 0.17];

const utilStatus = (u: number, warnOnly = false): BlockStatus => (u > 1 && !warnOnly ? 'fail' : u > K.tractionWarn ? 'warn' : 'ok');

/** Every traction case of the calculation, in tables. */
export function casesBlocks(P: Pres, I: Plant, N: Machine, res: Results, caseText: (c: TractionCase | BrakeCase, test?: boolean) => string,
  st: (s: CheckStatus) => string): ReportBlock[] {
  const { t, fmt } = P, B: ReportBlock[] = [];
  const caseHead = ['Caso', 'α [°]', 'μ', 'f', 'e^(f·α)', 'T1 [N]', 'T2 [N]', 'T1/T2', 'Utilizzo'];
  const caseRow = (test: boolean) => (c: TractionCase | BrakeCase): string[] => [caseText(c, test), fmt(deg(c.alpha), 1), fmt(c.mu, 4), fmt(c.f, 4), fmt(c.efa, 3), fmt(c.T1, 0),
    fmt(c.T2, 0), fmt(c.ratio, 3), fmt(c.util, 3)];
  // `test`: the braking with the brake's real torque, whose rows name the acceptance test's sub-case they are (6.3.3 a), b))
  const cases = (title: string, list: readonly (TractionCase | BrakeCase)[], warnOnly = false, test = false): void => {
    B.push({ t: 'h3', text: title });
    B.push({ t: 'grid', head: caseHead, rows: list.map(caseRow(test)), status: list.map((c) => utilStatus(c.util, warnOnly)), widths: CASE_W });
  };
  cases(`${t('tr_load')} (UNI EN 81-50:2020, 5.11)`, res.loadCases);
  cases(`Frenatura di emergenza alla decelerazione minima di ${fmt(I.ae, 1)} m/s² (UNI EN 81-50:2020, 5.11.2.2.2)`, res.brk);
  cases(`${t('tr_real')}: decelerazione data dal freno (${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m), con le prove di aderenza della UNI EN 81-20:2020, 6.3.3 a) e b); solo avviso`,
    res.brkReal, true, true);
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
      + `calcolo (a_e), mai sotto ${fmt(d.c1Min, 2)} a ${fmt(d.v, 2)} m/s (il minimo della fascia, che equivale a una decelerazione di ${fmt(d.aMin, 2)} m/s²); C2 = ${fmt(d.C2, d.C2 % 1 ? 1 : 0)} (${gola}); μ = ${fmt(d.mu, 2)}. `
      + `La condizione (T1/T2)·C1·C2 ≤ e^(f·α) ${d1Ok(d.worst.util) ? `è soddisfatta in entrambi i casi con a = ${fmt(d.a, 2)} m/s²` : 'non è soddisfatta: il rapporto tra '
        + 'i carichi non può cambiare così'}. ${d.aLim !== null ? `Regge fino a C1 = ${fmt(d.c1Lim, 3)}, cioè fino a una decelerazione di frenatura della `
        + `cabina di ${fmt(d.aLim, 2)} m/s² (a = g·(C1 − 1)/(C1 + 1), nel caso più sfavorevole): il soggetto della verifica può confrontarla con quella `
        + 'misurata alla prova del freno.' : `Non regge nemmeno con il C1 minimo della fascia (il limite è C1 = ${fmt(d.c1Lim, 3)}): nessuna decelerazione la rispetta.`} `
      + 'Quale decelerazione di frenatura della cabina intenda la D.1 la norma non lo precisa: il software prende quella della verifica di frenatura '
      + 'del calcolo; la frenatura con la coppia reale del freno (nei casi dell’aderenza) decelera di più e darebbe un C1 maggiore. L’esito vale con la '
      + `a indicata: la decelerazione da usare la conferma il soggetto della verifica${d.aLim !== null ? ', e oltre quella limite la condizione non regge' : ''}. `
      + 'Con la D.1 servono la D.2 (pressione specifica nelle gole, verificata qui sotto) e gli ammortizzatori secondo la UNI EN 81-20, 5.8 (voci '
      + 'modifica.d1, rapporto.d1 e rapporto.d2 del registro).' },
    ...d2Blocks(P, C, V),
  ];
}

/** D.2 beside D.1 (round 48): the specific pressure with the car at the lowest landing loaded with the rated load against
 *  its limit, met or not; none when not asked. */
function d2Blocks(P: Pres, C: Collaudo, V: FormValues): ReportBlock[] {
  const d = d2Di(C, V), { fmt } = P;
  if (!d) return [];
  const ok = d.p <= d.limit;
  return [
    { t: 'h3', text: 'Pressione specifica delle funi nelle gole con il rapporto tra i carichi cambiato (UNI 10411-1:2024, 6.1 e D.2)' },
    { t: 'grid', head: ['Caso', 'T [N]', 'p [N/mm²]', 'Limite [N/mm²]', 'Esito'], widths: [0.4, 0.14, 0.14, 0.16, 0.16], align: ['l', 'r', 'r', 'r', 'l'],
      rows: [['Cabina al piano più basso con la portata Q', fmt(d.T, 0), fmt(d.p, 2), `≤ ${fmt(d.limit, 2)}`, ok ? 'Soddisfatta' : 'Non soddisfatta']],
      status: [ok ? 'ok' : 'fail'], statusCol: 4 },
    { t: 'p', style: 'note', text: `Limite (${fmt(K.pressBase, 1)} + ${fmt(K.pressSpeed, 0)}·v_c)/(1 + v_c) con v_c la velocità delle funi alla velocità nominale; p con la `
      + `formula della D.2 per la gola della macchina (voce gole.pressione)${d.gola === 'VN' ? '; gola a V con sottosquadro: la D.2 non ha una formula; il '
        + 'maggiore dei due valori è una scelta del software (voce gole.pressione), da confermare con il soggetto della verifica' : ''}. ${ok ? 'La D.2 è '
        + 'soddisfatta.' : 'La D.2 non è soddisfatta: il rapporto tra i carichi non può cambiare così.'} Fuori da questa modifica la pressione resta un valore `
      + 'da dichiarare (verifiche dell’argano).' },
  ];
}

/** D.1 in one sentence (opened by a space) for the data's «Variazione dei carichi» (report/collaudo.ts), with D.2 in
 *  one more (round 48); '' when not asked. */
export function d1Frase(C: Collaudo, V: FormValues | undefined): string {
  const d = V ? d1Di(C, V) : null, u = d?.worst.util;
  if (!d || u === undefined) return '';
  const f2 = (x: number): string => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
  const n = Number.isFinite(u) ? f2(u) : '—', a = f2(d.a);
  // the band minimum as a deceleration, and the limit deceleration for the soggetto della verifica (round 46 final check)
  const lim = d.aLim !== null ? `; regge fino a una decelerazione di frenatura di ${f2(d.aLim)} m/s², da confrontare con quella misurata alla prova del `
    + 'freno' : '; non regge nemmeno con il C1 minimo della fascia';
  // D.2 with it (round 48): the specific pressure against its limit, met or not
  const p = V ? d2Di(C, V) : null;
  const d2 = p ? ` Pressione specifica nelle gole (D.2): ${f2(p.p)} N/mm² con il limite di ${f2(p.limit)} N/mm², ${p.p <= p.limit ? 'verificata' : '⚠ non verificata'}.` : '';
  return ` Stabilità allo scorrimento (D.1): utilizzo ${n} nel caso più sfavorevole con a = ${a} m/s² (il C1 minimo della fascia, ${f2(d.c1Min)}, equivale a una decelerazione di ${f2(d.aMin)} m/s²), `
    + `${d1Ok(u) ? 'verificata con questa decelerazione' : '⚠ non verificata'}${lim}; da confermare con il soggetto della verifica.${d2}`;
}

/** D.1 at the brake test (round 47, owner's decision D2): the point to verify on site whenever tr_d1 applies — the
 *  measured braking deceleration against a_lim, its value, C1lim and the C1 the verdict used spliced in (round 47
 *  review: at the band's minimum it is that minimum, not the calculation's a, which is printed beside it), with the
 *  verdict's outcome in words (round 47 recheck: when the calculation's own a is already over a_lim the point says D.1
 *  is not met, never words that read as a pass; with a_lim given, a C1 over the band's minimum fails exactly when a is
 *  over a_lim); the variant when not even C1's band minimum meets D.1. Null when D.1 is not asked. The verdict is round
 *  46's (information only). */
export function d1Sito(C: Collaudo, V: FormValues): PuntoInSito | null {
  const d = d1Di(C, V);
  if (!d || ambitoOf(C, 'tr_d1') !== 'applies') return null;
  if (d.aLim === null) return { ...D1_NON_REGGE, testo: D1_NON_REGGE.testo.replace('fascia di velocità', `fascia di velocità (C1lim = ${f(d.c1Lim, 3)}, sotto ${f(d.c1Min, 2)})`) };
  const minimo = d.C1 <= d.c1Min + 1e-12, a = `a = ${f(d.a, 2)} m/s²`;
  const usato = minimo ? `C1 = ${f(d.C1, 3)}, il minimo della fascia, che equivale a ${f(d.aMin, 2)} m/s² (con ${a} sarebbe minore)` : `C1 = ${f(d.C1, 3)} (${a})`;
  const esito = d1Ok(d.worst.util) ? `nel calcolo è soddisfatta con ${usato}` : `nel calcolo, con ${usato}, non è soddisfatta: a supera già a_lim`;
  return { ...D1_PROVA_FRENO, testo: D1_PROVA_FRENO.testo.replace(D1_FORMULA, `(a_lim = g·(C1lim − 1)/(C1lim + 1) = ${f(d.aLim, 2)} m/s² con C1lim = `
    + `${f(d.c1Lim, 3)}; ${esito})`) };
}
const f = (x: number, n: number): string => new Intl.NumberFormat('it-IT', { minimumFractionDigits: n, maximumFractionDigits: n }).format(x);

/** Registry entries with no check of their own that bound where the calculation holds: the compensation and the
 *  travelling cable kept inside P, the tolerance of the real speed on the rated one (registry, group modello). */
export const LIMITI_MODELLO: readonly string[] = ['modello.compensazione', 'azionamento.tolleranza.velocita'];

/** The limits of the calculation model, stated before the checks: what the engineer who signs must know holds. */
export function limitiBlocks(): ReportBlock[] {
  const voci = VOCI.filter((v) => LIMITI_MODELLO.includes(v.id));
  return [{ t: 'list', items: voci.map((v) => `⚠ ${v.titolo}: ${v.valore}${v.nota ? `. ${v.nota}` : ''} (${v.riferimento})`) }];
}
