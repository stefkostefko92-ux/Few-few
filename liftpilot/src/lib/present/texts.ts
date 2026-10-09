// Text builders of the prototype v12 (rendering section), ported one to one: screen, copied summary and report
// share them, so a number reads the same everywhere. Pure: no DOM, no React.
import { brakeWindow } from '@/calc/compute';
import { ceilTo, G } from '@/calc/math';
import { K } from '@/calc/norme';
import { ropeFamily } from '@/calc/sizing';
import { decimalsShown } from '@/shaft/checks';
import type { SheaveHold } from '@/lib/lift/direct';
import type {
  BrakeCase, BrakeWindow, Check, CheckId, CheckStatus, Groove, Machine, Plant, Results, SensitivityVariant, Sizing, SizingOption, TractionCase,
} from '@/calc/types';
import type { CalcKey, Pres } from './tr';

export type Verdict = 'ok' | 'warn' | 'fail';
export type Row2 = [string, string];
export type Row3 = [string, string, string];

export const statusOf = (res: Results, id: CheckId): CheckStatus | undefined => res.checks.find((c) => c.id === id)?.status;
export const verdictStatus = (r: Results): Verdict => (r.fails.length ? 'fail' : r.checks.some((c) => c.status === 'warn') ? 'warn' : 'ok');
export const verdictClass = (r: Results): 'ko' | 'warn' | 'ok' => ({ fail: 'ko', warn: 'warn', ok: 'ok' } as const)[verdictStatus(r)];
export const worstTraction = (r: Results): number => Math.max(r.load.util, r.dn.util, r.up.util);
export const sensMeasured = (sens: readonly SensitivityVariant[]): boolean => !sens.some((s) => s.key === 'k');
const isBrakeCase = (c: TractionCase | BrakeCase): c is BrakeCase => 'dir' in c;

/** The sense of a check's limit: the value at most (≤) or at least (≥) the limit. */
const AT_LEAST: ReadonlySet<CheckId> = new Set<CheckId>(['tr_stall', 'r_dd', 'r_ddp', 'r_nd', 'r_sfa', 'b_sets']);

/** The unit of a check's value and limit; none for a ratio, a utilisation, a safety factor or a count. */
export const CHECK_UNIT: Readonly<Partial<Record<CheckId, string>>> = {
  g_geom: '°', d_pst: 'kW', d_mp: 'N·m', s_shaft: 'kg', b_all: 'N·m', b_one: 'N·m', b_up: 'N·m', b_amax: 'm/s²', s_force: 'N', s_uplift: 'kg',
  s_fa: 'N', v_comp: 'm/s', g_retain: '°', g_press: 'N/mm²',
};

/** The ropes are the software's estimate of the family of registry funi.stima (8×19 Seale, fibre core, 1570 N/mm²):
 *  their strength and mass are the family's for the diameter. */
export const ropesEstimated = (N: Machine): boolean => { const f = ropeFamily(N.d); return f.Fmin === N.Fmin && f.qf === N.qf; };

export function textsFor(P: Pres) {
  const { t, fmt } = P;
  const st = (s: CheckStatus): string => t(`st_${s}`);

  const alphaText = (res: Results): string => (Math.abs(res.wa.B - res.wa.T) < 0.05 ? `${fmt(res.wa.B, 1)}°`
    : `${fmt(res.wa.B, 1)}° (${t('pos_b')}) · ${fmt(res.wa.T, 1)}° (${t('pos_t')})`);
  const grooveAngles = (g: Groove): string => (g.type === 'U' || g.type === 'VH' ? `γ ${fmt(g.gamma, 1)}°` : `β ${fmt(g.beta, 1)}° · γ ${fmt(g.gamma, 1)}°`);
  const grooveText = (g: Groove): string => `${t(`gr_${g.type}`)}${g.type === 'U' ? '' : ', ' + grooveAngles(g)}`;
  // UNI EN 81-50:2020, 5.11.2.3.1: β ≤ 105° (Montanari advises 90°), γ ≥ 35° on V grooves, γ ≥ 25° advised on the round ones
  const grooveLimit = (g: Groove): string => (g.type === 'U' ? `γ ≥ ${K.gammaMinU}°` : g.type === 'UU' ? `β ≤ ${K.betaMax}° (${K.betaRecommended}°) · γ ≥ ${K.gammaMinU}°`
    : g.type === 'VH' ? `γ ≥ ${K.gammaMin}°` : `β ≤ ${K.betaMax}° · γ ≥ ${K.gammaMin}°`);
  const grooveShort = (g: Groove): string => (g.type === 'U' ? 'U' : g.type === 'VH' ? `V γ ${fmt(g.gamma, 1)}°` : `U β ${fmt(g.beta, 1)}°`);
  const proposalShort = (o: SizingOption): string =>
    `D ${fmt(o.D, 0)} · ${o.n} × Ø${o.d} · ${grooveShort(o.groove)} · 1:${o.i} · ${fmt(o.Pn, 1)} kW · ${t('p_brake')} 2 × ${fmt(o.brakeSet, 0)} N·m`;
  const dText = (d: number): string => fmt(d, Number.isInteger(d) ? 0 : 1);
  // the machine the calculation verifies, in the proposal's words (the one form's machine proposed: the grid's or a
  // catalogue's, as it stands)
  const machineShort = (N: Machine): string => `D ${fmt(N.D, 0)} · ${N.n} × Ø${dText(N.d)} · ${grooveShort(N.groove)} · 1:${fmt(N.i, Number.isInteger(N.i) ? 0 : 1)} · `
    + `${fmt(N.Pn, 1)} kW · ${t('p_brake')} ${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m`;
  const noneText = (s: Sizing | null): string => (s && s.keep ? t('p_none_keep', { n: s.keep.n, d: dText(s.keep.d) }) : t('p_none'));
  const critText = (s: Sizing | null): string => t(s && s.keep ? 'p_crit_keep' : 'p_crit');
  const altText = (s: Sizing | null): string => t(s && s.keep ? 'p_alt_keep' : 'p_alt');

  // the rescue in a proposal's row: the 400 N to raise the car with Q and, with a machine to UNI EN 81-20 (the s_fa check
  // is there), the 150 N to a landing (compute.ts)
  const rescueText = (r: Results): string => {
    const f = { f: fmt(r.rescue.F, 0), fmax: K.rescueForceMax, fa: fmt(r.rescue.Fa, 0), fmech: K.rescueForceMech }, en20 = statusOf(r, 's_fa') != null;
    if (r.rescue.F > K.rescueForceMax) return t('p_electric', f);
    return en20 ? (r.rescue.Fa > K.rescueForceMech ? t('p_mech', f) : t('p_manual20', f)) : t('p_manual', f);
  };

  // `hold`: the sheave the sizing kept (the existing machine's, a direct pull's plan's drop: analysis.ts)
  function proposalRows(o: SizingOption, N: Machine, hold: SheaveHold, kept = false): Row2[] {
    const r = o.res, worst = worstTraction(r), w = brakeWindow(r);
    return [
      [t('p_sheave'), `${fmt(o.D, 0)} mm · D/d ${fmt(o.D / o.d, 1)}${hold ? ` · ${t(hold === 'drop' ? 'p_drop' : 'p_fixed')}` : ''}`],
      [t('p_groove'), `${grooveText(o.groove)}${o.groove.type !== 'VH' && o.groove.beta > K.betaRecommended ? ` · ${t('p_beta_hi', { br: K.betaRecommended })}` : ''}${o.tight ? ` · ${t('p_tight')}` : ''}${o.real ? '' : ` · ${t('p_real_no')}`}`],
      [t('p_ropes'), `${o.n} × Ø${dText(o.d)} mm · F_min ≥ ${fmt(o.rope.Fmin, 1)} kN · ${fmt(o.rope.qf, 3)} kg/m${kept ? ` · ${t('p_kept')}` : ''}`],
      [t('p_ratio'), `1:${o.i} (${t('p_ideal', { x: fmt(o.iIdeal, 2) })}) · ${t('p_speed', { v: fmt(r.kin.vReal, 3), fn: fmt(N.fn, 0), f: fmt(r.kin.fRated, 2) })}`],
      [t('p_motor'), `${fmt(o.Pn, 1)} kW · ${N.poles} ${t('poles_short')} · ${fmt(N.nm, 0)} 1/min · ${t('p_req', { x: fmt(o.Preq, 2) })}`],
      [t('p_torque'), `≥ ${fmt(ceilTo(r.drive.MpMax, 10), 0)} N·m`],
      [t('p_shaft'), `≥ ${fmt(o.M.shaftMax, 0)} kg (1,25·Q: ${fmt(r.shaft.testKg, 0)} kg${r.shaft.up ? ` · ${t('p_upwards')}` : ''})`],
      [t('p_brake'), t('p_brake_sets', { x: fmt(o.brakeSet, 0), lo: fmt(w.lo / w.sets, 1),
        hi: w.hi == null ? t('p_hi_none') : w.hi === Infinity ? '—' : t('p_hi', { y: fmt(w.hi / w.sets, 1) }) })],
      [t('p_rescue'), rescueText(r)],
      [t('p_margins'), t('p_util', { u: fmt(worst, 3), ur: fmt(r.real.util, 3), sa: fmt(r.ropes.SfAct, 2), sr: fmt(r.ropes.SfReq, 2) })],
    ];
  }
  const proposalCells = (o: SizingOption, pick: SizingOption | null): string[] => [`${o === pick ? '★ ' : ''}${fmt(o.D, 0)} mm`, `${o.n} × Ø${o.d}`, grooveShort(o.groove),
    `1:${o.i}`, `${fmt(o.Pn, 1)} kW`, `${fmt(o.brakeSet, 0)} N·m`, `${fmt(o.M.shaftMax, 0)} kg`];
  const proposalHead = (): string[] => [t('col_sheave'), t('col_ropes'), t('col_groove'), t('col_ratio'), t('col_motor'), t('col_brake'), t('col_shaftk')];

  function comparisonRows(res: Results, old: Results): Row3[] {
    const rows: Row3[] = [
      [t('kin_v'), `${fmt(old.kin.vReal, 3)} m/s`, `${fmt(res.kin.vReal, 3)} m/s`],
      [t('r_dd'), fmt(old.ropes.Dd, 1), fmt(res.ropes.Dd, 1)],
      [`${t('r_sfr')} · ${t('r_sfa')}`, `${fmt(old.ropes.SfReq, 2)} · ${fmt(old.ropes.SfAct, 2)}`, `${fmt(res.ropes.SfReq, 2)} · ${fmt(res.ropes.SfAct, 2)}`],
      [t('k_trac'), fmt(worstTraction(old), 3), fmt(worstTraction(res), 3)],
      [t('tr_real'), `${fmt(old.real.util, 3)} (a ${fmt(old.real.aEff, 2)} m/s²)`, `${fmt(res.real.util, 3)} (a ${fmt(res.real.aEff, 2)} m/s²)`],
      [t('d_pst'), `${fmt(old.drive.Peq / 1000, 2)} kW (${fmt(old.drive.powerUtil * 100, 0)}%)`, `${fmt(res.drive.Peq / 1000, 2)} kW (${fmt(res.drive.powerUtil * 100, 0)}%)`],
      [t('d_ratio'), fmt(old.drive.accRatio, 2), fmt(res.drive.accRatio, 2)],
      [t('b_sets'), String(old.brake.sets), String(res.brake.sets)],
      [t('b_amax'), `${fmt(old.brake.aMax / G, 2)} g`, `${fmt(res.brake.aMax / G, 2)} g`],
      [t('s_force'), `${fmt(old.rescue.F, 0)} N`, `${fmt(res.rescue.F, 0)} N`],
      [t('s_shaft'), `${fmt(old.shaft.testKg, 0)} kg`, `${fmt(res.shaft.testKg, 0)} kg`],
    ];
    if (res.shaft.up) rows.push([t('s_uplift'), `${fmt(old.shaft.uplift, 0)} kg`, `${fmt(res.shaft.uplift, 0)} kg`]);
    rows.push([t('d_mp'), `${fmt(old.drive.MpMax, 0)} N·m`, `${fmt(res.drive.MpMax, 0)} N·m`]);
    return rows;
  }

  // what the engineer still checks: the points the standards leave open or that depend on the installation (the values read
  // on the standards are in the registry, not here)
  const verifyList = (I: Plant, N: Machine, res: Results): string[] => [t('v_real'), ...(N.etaIest ? [t('v_etaI', { x: fmt(N.etaI, 2) })] : []),
    ...(I.buffers ? [t('v_ae', { a: fmt(I.ae, 1) })] : []), ...(N.groove.type === 'VN' ? [t('v_neq_vn', { val: fmt(res.ropes.NeqT, 2) })] : []),
    ...(I.r === 2 ? [t('v_r2')] : []), t('v_geom', { b: K.betaMax, g: K.gammaMin, gu: K.gammaMinU, br: K.betaRecommended }),
    t('v_rescue', { f: K.rescueForceMech, fmax: K.rescueForceMax }), t('v_eta'), t('v_inertia')];

  // which case a row is: "cabina vuota in salita, in alto, a 0,50 m/s² (minimo della norma)"
  function caseText(c: TractionCase | BrakeCase | null | undefined, withA = true): string {
    if (!c || !c.pos) return '';
    const parts: string[] = [];
    if (isBrakeCase(c)) parts.push(`${t(c.load === 'q' ? 'cs_q' : 'cs_e')} ${t(c.dir === 'dn' ? 'dir_dn' : 'dir_up')}`);
    parts.push(t(c.pos === 'b' ? 'at_b' : 'at_t'));
    if (withA && isBrakeCase(c)) parts.push(`a ${fmt(c.aEff, 2)} m/s² (${t(c.fromBrake ? 'src_brake' : 'src_std')})`);
    return parts.join(', ');
  }
  const etaText = (M: Machine): string => `${fmt(M.etaI, 2)}${M.etaIest ? ` (${t('est')})` : ''}`;
  const windowText = (w: BrakeWindow): string =>
    `${fmt(w.lo / w.sets, 1)} N·m · ${w.hi == null ? t('b_win_none') : w.hi === Infinity ? '—' : `${fmt(w.hi / w.sets, 1)} N·m`}`;
  // `old`: the existing machine (its ropes are the existing ones); the inertias and the mass, which the brake, the
  // decelerations and the uplift depend on, so that the calculation can be repeated
  const machineRows = (N: Machine, res: Results, old = false): Row2[] => [
    [t('D'), `${fmt(N.D, 0)} mm`], [t('groove'), grooveText(N.groove)], [t('i'), fmt(N.i, 1)],
    [t('Pn'), `${fmt(N.Pn, 1)} kW · ${N.poles} ${t('poles_short')} · ${fmt(N.nm, 0)} 1/min · ${fmt(N.fn, 0)} Hz`],
    [`${t('etaD')} · ${t('etaI')}`, `${fmt(N.etaD, 2)} · ${etaText(N)}`],
    [`${t('Jm')} · ${t('Js')}`, `${fmt(N.Jm, 3)} · ${fmt(N.Js, 2)} kg·m²`], [t('mass'), `${fmt(N.mass, 0)} kg`],
    [`${t('brakeSets')} × ${t('brakeNm')}`, `${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m`],
    [t('b_win'), windowText(brakeWindow(res))],
    [t(old ? 'oldRopes' : 'g_ropes'), `${N.n} × Ø${fmt(N.d, 1)} mm · ${fmt(N.Fmin, 1)} kN · ${fmt(N.qf, 3)} kg/m · ${t(ropesEstimated(N) ? 'rope_est' : 'rope_std')}`],
    [t('shaftMax'), N.shaftMax > 0 ? `${fmt(N.shaftMax, 0)} kg` : '—'],
    [t('MpCat'), N.MpCat > 0 ? `${fmt(N.MpCat, 0)} N·m` : '—'],
  ];

  function checkLabel(id: CheckId): string {
    const grp: CalcKey = id.startsWith('tr_') ? 'c_trac' : id.startsWith('r_') || id.startsWith('g_') || id === 'v_comp' ? 'c_ropes' : id.startsWith('d_') ? 'c_drive'
      : id.startsWith('b_') ? 'c_brake' : id === 's_force' || id === 's_fa' || id === 's_gravity' ? 'c_rescue' : 'c_shaft';
    return `${t(grp)} · ${t(id)}`;
  }
  const checkText = (c: Check): string => `${checkLabel(c.id)}${c.cs ? ` — ${caseText(c.cs, c.id !== 'b_amax')}` : ''}`;
  // a check's value and limit with their unit; the ropes as number × diameter (machine N), both are checked
  const unitOf = (id: CheckId): string => (CHECK_UNIT[id] ? `\u00a0${CHECK_UNIT[id]}` : '');
  // a value that does not meet its limit never reads as meeting it: more decimals when it would round onto it
  const checkValue = (c: Check, N: Machine): string => {
    if (c.value == null) return '—';
    if (c.id === 'r_nd') return `${N.n} × Ø${dText(N.d)}\u00a0mm`;
    const dec = c.limit == null || c.id === 'g_geom' ? c.dec : decimalsShown(c.value, c.limit, !AT_LEAST.has(c.id), c.status === 'ok', c.dec) ?? c.dec;
    return `${fmt(c.value, dec)}${unitOf(c.id)}`;
  };
  const checkLimit = (c: Check, N: Machine): string => {
    if (c.id === 'g_geom') return grooveLimit(N.groove);
    // the retainer is a condition, not a limit the wrap must stay under
    if (c.id === 'g_retain') return t('g_retain_lim', { below: fmt(K.retainBelow, 0), wrap: fmt(K.retainWrap, 0) });
    if (c.limit == null) return '';
    const sense = AT_LEAST.has(c.id) ? '≥' : '≤';
    return c.id === 'r_nd' ? `≥ ${K.ropesMin} × Ø${dText(K.ropeDiameterMin)}\u00a0mm` : `${sense} ${fmt(c.limit, c.dec)}${unitOf(c.id)}`;
  };
  const verdictText = (r: Results): string => {
    const n = r.fails.length, w = r.checks.filter((c) => c.status === 'warn').length;
    return n ? (n === 1 ? t('verdict_ko1') : t('verdict_ko', { n })) : w ? (w === 1 ? t('verdict_warn1') : t('verdict_warn', { w })) : t('verdict_ok');
  };

  const sensLabel = (s: SensitivityVariant): string => (s.key === 'P' ? `P ${s.d > 0 ? '+' : '−'}10%` : `k ${s.d > 0 ? '+' : '−'}${fmt(Math.abs(s.d), 2)}`);
  // rows [variant, traction, real traction, S_f, power, shaft, result] for the data entered and each variant
  const sensRows = (res: Results, sens: readonly SensitivityVariant[]): string[][] =>
    ([[t('sens_nom'), res], ...sens.map((s) => [sensLabel(s), s.r])] as [string, Results][]).map(([name, r]) => [name, fmt(worstTraction(r), 3), fmt(r.real.util, 3),
      `${fmt(r.ropes.SfAct, 2)} / ${fmt(r.ropes.SfReq, 2)}`, `${fmt(r.drive.Peq / 1000, 2)} kW`, `${fmt(r.shaft.testKg, 0)} kg`,
      r.fails.length ? `${t('st_fail')}\u00a0(${r.fails.length})` : t('st_ok')]);
  const sensHead = (): string[] => [t('sens_var'), t('sens_trac'), t('sens_real'), t('sens_sf'), t('sens_p'), t('col_shaftk'), t('col_res')];
  const sensTitle = (sens: readonly SensitivityVariant[]): string => t(sensMeasured(sens) ? 'c_sens_q' : 'c_sens');
  const sensLine = (sens: readonly SensitivityVariant[]): string => {
    const moved = sens.filter((s) => s.changed.length), q = sensMeasured(sens);
    return moved.length ? t(q ? 'sens_changes_q' : 'sens_changes', { list: moved.map(sensLabel).join(', ') }) : t(q ? 'sens_stable_q' : 'sens_stable');
  };
  // "P −10%: Aderenza · Frenatura di emergenza, cabina in salita → Non soddisfatta"
  const sensChanges = (sens: readonly SensitivityVariant[]): string[] => sens.filter((s) => s.changed.length)
    .map((s) => `${sensLabel(s)}: ${s.changed.map((c) => `${checkLabel(c.id)} → ${st(c.status)}`).join('; ')}`);

  return {
    st, alphaText, grooveAngles, grooveText, grooveLimit, grooveShort, proposalShort, machineShort, dText, noneText, critText, altText, proposalRows, proposalCells,
    proposalHead, comparisonRows, verifyList, caseText, etaText, windowText, machineRows, checkLabel, checkText, checkValue, checkLimit, verdictText, sensLabel, sensRows,
    sensHead, sensTitle, sensLine, sensChanges,
  };
}

export type Texts = ReturnType<typeof textsFor>;
