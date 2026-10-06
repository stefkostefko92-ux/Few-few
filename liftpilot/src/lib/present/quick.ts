// "Esito in breve": one line per area in plain words for the technician (prototype v12, quickRows); the numbers
// behind each line are in the technical tables.
import { brakeWindow } from '@/calc/compute';
import { K } from '@/calc/norme';
import type { CheckId, CheckStatus, Machine, Results, SensitivityVariant } from '@/calc/types';
import type { CalcKey, Pres } from './tr';
import { statusOf, worstTraction, type Texts } from './texts';

export interface QuickRow {
  key: CalcKey;
  status: CheckStatus;
  text: string;
}

export function quickRows(P: Pres, X: Texts, N: Machine, res: Results, sens: readonly SensitivityVariant[]): QuickRow[] {
  const { t, fmt } = P;
  const worstOf = (ids: readonly CheckId[]): CheckStatus => {
    const cs = res.checks.filter((c) => ids.includes(c.id));
    return cs.some((c) => c.status === 'fail') ? 'fail' : cs.some((c) => c.status === 'warn') ? 'warn' : 'ok';
  };
  const failed = (ids: readonly CheckId[]): string => res.checks.filter((c) => ids.includes(c.id) && c.status === 'fail').map((c) => t(c.id)).join('; ');
  const rows: QuickRow[] = [];
  {
    const ids: CheckId[] = ['tr_load', 'tr_dn', 'tr_up', 'tr_stall', 'tr_msr1'], s = worstOf(ids), L = res.levers;
    const u = fmt(worstTraction(res), 2);
    let text = s === 'fail'
      ? t('q_trac_fail', { what: failed(ids) }) + (L && L.betaMin != null ? ' ' + t('q_trac_beta', { b: fmt(L.betaMin, 1) })
        : L && L.gammaMax != null ? ' ' + t('q_trac_gamma', { g: fmt(L.gammaMax, 1) }) : '')
      : t(s === 'warn' ? 'q_trac_warn' : 'q_trac_ok', { u });
    const real = statusOf(res, 'tr_real') === 'warn';
    if (real) text += ' ' + t('q_trac_real', { a: fmt(res.real.aEff, 1) });
    if (statusOf(res, 'tr_stall') === 'warn') text += ' ' + t('q_stall_device');
    if (res.msr1 && statusOf(res, 'tr_msr1') === 'warn') text += ' ' + t('q_msr1', { u: fmt(res.msr1.util, 3) });
    rows.push({ key: 'c_trac', status: s === 'ok' && real ? 'warn' : s, text });
  }
  {
    const ids: CheckId[] = ['r_dd', 'r_ddp', 'r_nd', 'g_geom', 'r_sfa', 'v_comp'], s = worstOf(ids), rp = res.ropes;
    // the groove's remarks (compute.ts g_geom): an undercut over the recommended one, a round groove's γ under the advised one
    const g = N.groove, undercut = (g.type === 'UU' || g.type === 'VN') && g.beta > K.betaRecommended;
    const lowGamma = (g.type === 'U' || g.type === 'UU') && g.gamma < K.gammaMinU;
    const geom = statusOf(res, 'g_geom') === 'warn'
      ? [...(undercut ? [t('q_geom_warn', { br: K.betaRecommended })] : []), ...(lowGamma ? [t('q_geom_gamma', { g: K.gammaMinU })] : [])].map((x) => ' ' + x).join('') : '';
    // the reminders: two ropes, ropes retained along the wrap, the speed and the compensation
    const more = [...(statusOf(res, 'r_two') ? [t('q_two')] : []), ...(statusOf(res, 'g_retain') ? [t('q_retain')] : []),
      ...(statusOf(res, 'v_comp') === 'warn' ? [t('q_vcomp', { v: fmt(res.checks.find((c) => c.id === 'v_comp')?.value ?? 0, 2) })] : [])].map((x) => ' ' + x).join('');
    const text = (s === 'fail' ? t('q_fail', { what: failed(ids) }) : t('q_ropes_ok', { sa: fmt(rp.SfAct, 2), sr: fmt(rp.SfReq, 2) }) + geom) + more;
    rows.push({ key: 'c_ropes', status: s, text });
  }
  {
    const ids: CheckId[] = ['d_pst', 'd_ratio', 'd_mp'], s = worstOf(ids), d = res.drive;
    const need = { p: fmt(d.Pst / 1000, 1), pn: fmt(N.Pn, 1), pct: fmt(d.powerUtil * 100, 0) };
    const text = s === 'fail' ? `${t('q_fail', { what: failed(ids) })} ${t('q_motor_need', need)}`
      : t('q_motor_ok', need) + (statusOf(res, 'd_ratio') === 'warn' ? ' ' + t('q_motor_acc') : '');
    rows.push({ key: 'c_drive', status: s, text });
  }
  {
    const ids: CheckId[] = ['b_sets', 'b_all', 'b_one', 'b_up', 'b_amax'], s = worstOf(ids), w = brakeWindow(res);
    const text = s === 'fail' ? t('q_fail', { what: failed(ids) })
      : `${t('q_brake_ok', { lo: fmt(Math.ceil(w.lo / w.sets), 0) })}${w.hi == null ? ' ' + t('q_brake_nohi') : w.hi === Infinity ? '' : ' ' + t('q_brake_hi', { hi: fmt(Math.floor(w.hi / w.sets), 0) })}`;
    rows.push({ key: 'c_brake', status: s, text });
  }
  {
    const s = worstOf(['s_shaft', 's_uplift']), sh = res.shaft;
    let text = `${t('q_shaft', { kg: fmt(sh.testKg, 0) })} ${N.shaftMax > 0 ? t('q_shaft_max', { max: fmt(N.shaftMax, 0) }) : t('q_shaft_nomax')}`;
    if (sh.up) text += ' ' + t('q_uplift', { u: fmt(sh.uplift, 0) });
    rows.push({ key: 'c_shaft', status: s, text });
  }
  {
    // with a machine to UNI EN 81-20 also the 150 N to a landing (s_fa) and the gravity remark; to UNI EN 81-1 the 400 N
    const rc = res.rescue, en20 = statusOf(res, 's_fa') != null;
    const v = { f: fmt(rc.F, 0), fmax: K.rescueForceMax, fa: fmt(rc.Fa, 0), fmech: K.rescueForceMech, v: fmt(en20 ? K.rescueSpeed : K.rescueSpeedOld, 2) };
    const parts = [rc.F > K.rescueForceMax ? t('q_rescue_el', v) : !en20 ? t('q_rescue_ok', v) : rc.Fa > K.rescueForceMech ? '' : t('q_rescue_ok20', v)];
    if (en20 && rc.Fa > K.rescueForceMech) parts.push(t('q_rescue_mech', v));
    if (statusOf(res, 's_gravity')) parts.push(t('q_gravity'));
    rows.push({ key: 'c_rescue', status: worstOf(['s_force', 's_fa']), text: parts.filter(Boolean).join(' ') });
  }
  rows.push({ key: 'q_sens', status: sens.some((x) => x.changed.length) ? 'warn' : 'ok', text: X.sensLine(sens) });
  return rows;
}
