// Technical tables of the prototype v12 (renderResults) as data: the screen renders them as cards, the report as
// PDF tables, so both show the same rows. Traction, drop spacing, levers, ropes, kinematics, drive, brake, rescue,
// shaft, sensitivity, comparison.
import { G } from '@/calc/math';
import { K, VOCI } from '@/calc/norme';
import type { BrakeCase, CheckId, CheckStatus, StallCase, TractionCase } from '@/calc/types';
import type { Analysis } from './analysis';
import { statusOf, type Texts } from './texts';
import type { Pres } from './tr';

export interface RichCell {
  text: string;
  /** second line under the text (which case governs) */
  sub?: string;
  /** utilisation shown as a bar on screen */
  bar?: number;
  /** status pill */
  status?: CheckStatus;
  /** ⚠ after the text: value still to be checked on the standard */
  flag?: boolean;
}
export type Cell = string | RichCell;
export interface Line { text: string; flag?: boolean }
export interface TableBlock {
  key: string;
  title: string;
  ref?: string;
  head: string[];
  rows: Cell[][];
  list?: Line[];
  notes: Line[];
}

export function techTables(P: Pres, X: Texts, a: Analysis): TableBlock[] {
  const { t, fmt } = P;
  const { ctx, res, old, sens, win: w } = a, { I, N } = ctx;
  const pill = (id: CheckId): Cell => { const s = statusOf(res, id); return s ? { text: X.st(s), status: s } : ''; };
  const trRow = (id: CheckId, c: TractionCase | BrakeCase): Cell[] => [{ text: t(id), sub: X.caseText(c) || undefined }, fmt(c.mu, 4), fmt(c.f, 4),
    fmt(c.efa, 3), fmt(c.T1, 0), fmt(c.T2, 0), fmt(c.ratio, 3), { text: fmt(c.util, 3), bar: c.util }, pill(id)];
  const withBar = (text: string, u: number | null): Cell => (u == null ? text : { text, bar: u });
  // the stalled cases, empty car at the top and at the bottom (UNI EN 81-50:2020, 5.11.2.2.3), each with its own result
  // a case not passed is a remark when an electric safety device replaces the check (compute.ts, tr_stall)
  const device = statusOf(res, 'tr_stall') === 'warn';
  const stRow = (s: StallCase): Cell[] => {
    const st: CheckStatus = s.ratio >= s.efa ? 'ok' : device ? 'warn' : 'fail';
    return [{ text: t(s.pos === 'b' ? 'st_car' : 'st_cw'), sub: `${t('cs_e')}, ${t(s.pos === 'b' ? 'at_b' : 'at_t')}` }, fmt(s.mu, 4), fmt(s.f, 4), fmt(s.efa, 3), fmt(s.T1, 0),
      fmt(s.T2, 0), fmt(s.ratio, 2), '≥ e^(f·α)', { text: X.st(st), status: st }];
  };
  const head4 = [t('col_item'), t('col_val'), t('col_lim'), t('col_res')];
  const out: TableBlock[] = [];

  out.push({
    key: 'trac', title: t('c_trac'), ref: `EN 81-50 §5.11${VOCI.some((v) => v.gruppo === 'trazione' && v.stato === 'da_verificare') ? ' ⚠' : ''}`,
    head: [t('col_case'), 'μ', 'f', 'e^(f·α)', 'T1 [N]', 'T2 [N]', 'T1/T2', t('col_util'), t('col_res')],
    rows: [trRow('tr_load', res.load), trRow('tr_dn', res.dn), trRow('tr_up', res.up), trRow('tr_real', res.real),
      ...(res.msr1 ? [trRow('tr_msr1', res.msr1)] : []), stRow(res.stall), stRow(res.stallLow)],
    notes: [{ text: `α = ${X.alphaText(res)} · k = ${fmt(res.k, 3)} · M_cw = ${fmt(res.Mcw, 0)} kg` }, { text: t('n_trac', { a: fmt(I.ae, 1), e: X.etaText(N) }) },
      ...(statusOf(res, 'tr_real') === 'warn' ? [{ text: t('n_real'), flag: true }] : []),
      ...(res.msr1 ? [{ text: t('n_msr1') }] : []), ...(device ? [{ text: t('n_stall_device'), flag: true }] : [])],
  });
  if (res.wa.dc != null && res.wa.dw != null) {
    out.push({
      key: 'drops', title: t('c_drops'), ref: t('ref_53'), head: [t('col_item'), t('col_val')],
      rows: [[t('dr_old'), `${fmt(I.drops, 0)} mm`], [t('dr_new'), `${fmt(N.D, 0)} mm`], [t('dr_shift'), `${fmt(res.wa.dc * 1000, 0)} · ${fmt(res.wa.dw * 1000, 0)} mm`],
        [t('dr_alpha'), `${fmt(res.wa.B, 1)}° (${t('pos_b')}) · ${fmt(res.wa.T, 1)}° (${t('pos_t')})`]],
      notes: [{ text: t('dr_note') }],
    });
  }
  if (res.levers) {
    const L = res.levers, items: Line[] = [{ text: `${t('l_need')} ${fmt(L.need, 4)}` }, { text: `${t('l_alpha')}: ${fmt(L.alphaMin, 1)}°` }];
    if (L.betaMin != null) items.push({ text: `${t('l_beta')}: ${fmt(L.betaMin, 1)}°` });
    if (L.gammaMax != null) items.push({ text: `${t('l_gamma')}: ${fmt(L.gammaMax, 1)}°` });
    if (L.betaMin == null && L.gammaMax == null) items.push({ text: t('l_none') });
    out.push({ key: 'levers', title: t('c_levers'), head: [], rows: [], list: items, notes: [{ text: t('l_note') }] });
  }
  const rp = res.ropes;
  out.push({
    key: 'ropes', title: t('c_ropes'), ref: 'EN 81-50 §5.12', head: head4,
    rows: [
      [t('r_nd'), `${N.n} × Ø${fmt(N.d, 1)} mm`, `≥ ${K.ropesMin} · ≥ ${K.ropeDiameterMin} mm`, pill('r_nd')],
      [t('r_dd'), fmt(rp.Dd, 1), `≥ ${K.ddMin}`, pill('r_dd')],
      ...(rp.DpD != null ? [[t('r_ddp'), fmt(rp.DpD, 1), `≥ ${K.ddMin}`, pill('r_ddp')]] : []),
      [t('g_geom'), X.grooveAngles(N.groove), X.grooveLimit(N.groove), pill('g_geom')],
      ...(rp.nps + rp.npr > 0 ? [[t('r_bends'), `${rp.nps} · ${rp.npr}`, '', '']] : []),
      [{ text: t('r_neqt'), flag: !rp.neqVerified }, fmt(rp.NeqT, 2), '', ''],
      [`${t('r_kp')} · ${t('r_neq')}`, `${fmt(rp.Kp, 3)} · ${fmt(rp.Neq, 3)}`, '', ''],
      [t('r_sfc'), fmt(rp.SfCalc, 2), `min ${rp.SfMin}`, ''],
      [t('r_tmax'), `${fmt(rp.Tmax, 0)} N`, '', ''],
      [t('r_sfa'), fmt(rp.SfAct, 2), `≥ ${fmt(rp.SfReq, 2)}`, pill('r_sfa')],
      ...(statusOf(res, 'r_two') ? [[t('r_two'), String(N.n), '', pill('r_two')]] : []),
      ...(statusOf(res, 'g_retain') ? [[t('g_retain'), `${fmt(Math.max(res.wa.B, res.wa.T), 1)}°`, `> ${K.retainWrap}°`, pill('g_retain')]] : []),
      ...(statusOf(res, 'v_comp') ? [[t('v_comp'), `${fmt(I.v, 2)} m/s`, `≤ ${fmt(K.vCompGuided, 2)} m/s`, pill('v_comp')]] : []),
    ],
    notes: [...(res.wa.reverse ? [{ text: t('g_bend_note') }] : []), ...(statusOf(res, 'r_two') ? [{ text: t('r_two_note') }] : []),
      ...(statusOf(res, 'g_retain') ? [{ text: t('g_retain_note', { w: K.retainWrap }) }] : []),
      ...(statusOf(res, 'v_comp') ? [{ text: t('v_comp_note', { g: fmt(K.vCompGuided, 2), r: fmt(K.vCompRopes, 1) }) }] : [])],
  });
  const k = res.kin;
  out.push({
    key: 'kin', title: t('c_kin'), head: [t('col_item'), t('col_val')],
    rows: [[t('kin_ns'), `${fmt(k.nS, 2)} 1/min`], [t('kin_ii'), fmt(k.iIdeal, 2)], [t('kin_v'), `${fmt(k.vReal, 3)} m/s`],
      [t('kin_dev'), `${fmt(k.dev * 100, 1)} %`], [t('kin_f'), `${fmt(k.fRated, 2)} Hz`],
      [`${t('kin_sync')} · ${t('kin_slip')}`, `${fmt(k.ns, 0)} 1/min · ${fmt(k.slip * 100, 1)} %`]],
    notes: [],
  });
  const d = res.drive;
  out.push({
    key: 'drive', title: t('c_drive'), head: head4,
    rows: [
      [{ text: t('d_df'), sub: t(d.empty ? 'd_case_e' : 'd_case_q') }, `${fmt(d.dF, 0)} N`, '', ''],
      [d.Peq > d.Pst ? { text: t('d_pst'), sub: t('d_pst_torque', { v: fmt(res.kin.vReal, 3) }) } : t('d_pst'), withBar(`${fmt(d.Peq / 1000, 2)} kW`, d.powerUtil), `${fmt(N.Pn, 1)} kW`, pill('d_pst')],
      [t('d_pbal'), `${fmt(d.Pbal / 1000, 2)} kW`, '', ''],
      [`${t('d_mn')} · ${t('d_mst')}`, `${fmt(d.Mn, 1)} · ${fmt(d.MmSt, 1)} N·m`, '', ''],
      [t('d_macc'), `${fmt(d.Macc, 1)} N·m`, '', ''],
      [t('d_ratio'), fmt(d.accRatio, 2), '', pill('d_ratio')],
      [t('d_mp'), withBar(`${fmt(d.MpMax, 0)} N·m`, N.MpCat > 0 ? d.MpMax / N.MpCat : null), N.MpCat > 0 ? `${fmt(N.MpCat, 0)} N·m` : '—', N.MpCat > 0 ? pill('d_mp') : ''],
    ],
    notes: [],
  });
  const b = res.brake;
  const brakeRows: Cell[][] = [[t('b_sets'), String(b.sets), '≥ 2', pill('b_sets')],
    [t('b_all'), withBar(`${fmt(b.all, 1)} N·m`, b.all / b.avail), `${fmt(b.avail, 0)} N·m`, pill('b_all')]];
  if (b.sets >= 2) {
    brakeRows.push([t('b_one'), withBar(`${fmt(b.one, 1)} N·m`, b.one / b.perSet), `${fmt(b.perSet, 0)} N·m`, pill('b_one')]);
    brakeRows.push([t('b_up'), withBar(`${fmt(b.up, 1)} N·m`, b.up / b.perSet), `${fmt(b.perSet, 0)} N·m`, pill('b_up')]);
  }
  brakeRows.push([{ text: t('b_amax'), sub: X.caseText(b.aMaxCase, false) || undefined }, `${fmt(b.aMax, 2)} m/s² (${fmt(b.aMax / G, 2)} g)`, `≤ ${fmt(K.brakeDecelMax / K.g, 0)} g`, pill('b_amax')]);
  brakeRows.push([t('b_min'), `${fmt(w.lo / w.sets, 1)} N·m`, '', '']);
  brakeRows.push([t('b_max'), w.hi == null ? t('b_none') : w.hi === Infinity ? '—' : `${fmt(w.hi / w.sets, 1)} N·m`, '', '']);
  brakeRows.push([t('etaI'), X.etaText(N), '', '']);
  out.push({ key: 'brake', title: t('c_brake'), ref: 'EN 81-20 §5.9.2.2.2.1', head: head4, rows: brakeRows, notes: [] });
  {
    // the 400 N of both standards, the 150 N to a landing and the gravity remark of UNI EN 81-20 (present only then)
    const rc = res.rescue, en20 = statusOf(res, 's_fa') != null;
    const rows: Cell[][] = [[t('s_force'), withBar(`${fmt(rc.F, 0)} N`, rc.F / K.rescueForceMax), `≤ ${K.rescueForceMax} N`, pill('s_force')]];
    if (en20) rows.push([t('s_fa'), withBar(`${fmt(rc.Fa, 0)} N`, rc.Fa / K.rescueForceMech), `≤ ${K.rescueForceMech} N`, pill('s_fa')]);
    if (statusOf(res, 's_gravity')) rows.push([t('s_gravity'), X.etaText(N), '', pill('s_gravity')]);
    const notes: Line[] = [];
    if (rc.F > K.rescueForceMax) notes.push({ text: t(en20 ? 's_need' : 's_need_old', { fmax: K.rescueForceMax, v: fmt(en20 ? K.rescueSpeed : K.rescueSpeedOld, 2) }) });
    if (en20) notes.push({ text: t('s_fa_note', { b: fmt(K.rescueLoadBand, 1) }) });
    if (en20 && rc.Fa > K.rescueForceMech) notes.push({ text: t('s_fa_need', { fmech: K.rescueForceMech, h: K.rescueHours, v: fmt(K.rescueSpeed, 2) }) });
    if (statusOf(res, 's_gravity')) notes.push({ text: t('s_gravity_note') });
    out.push({ key: 'rescue', title: t('c_rescue'), head: head4, rows, notes });
  }
  const sh = res.shaft;
  const shaftRows: Cell[][] = [[t('s_shaft'), withBar(`${fmt(sh.testKg, 0)} kg`, N.shaftMax > 0 ? sh.testKg / N.shaftMax : null),
    N.shaftMax > 0 ? `${fmt(N.shaftMax, 0)} kg` : '—', N.shaftMax > 0 ? pill('s_shaft') : ''], [t('s_dir'), sh.up ? t('s_up') : t('s_down'), '', '']];
  if (sh.up) shaftRows.push([t('s_uplift'), `${fmt(sh.uplift, 0)} kg`, '', pill('s_uplift')]);
  out.push({ key: 'shaft', title: t('c_shaft'), head: head4, rows: shaftRows, notes: sh.up ? [{ text: t('s_uplift_note') }] : [] });
  const sensRows = X.sensRows(res, sens).map((row, j): Cell[] => row.map((c, i): Cell => (i === 6
    ? { text: c, status: (j ? sens[j - 1]?.r ?? res : res).fails.length ? 'fail' : 'ok' } : c)));
  out.push({
    key: 'sens', title: X.sensTitle(sens), ref: t('ref_89'), head: X.sensHead(), rows: sensRows,
    list: X.sensChanges(sens).map((x) => ({ text: x, flag: true })),
    notes: [{ text: `${X.sensLine(sens)}${I.qeq > 0 ? ' ' + t('sens_note') : ''}` }],
  });
  if (old) out.push({ key: 'cmp', title: t('c_cmp'), head: [t('col_item'), t('col_old'), t('col_new')], rows: X.comparisonRows(res, old), notes: [] });
  return out;
}
