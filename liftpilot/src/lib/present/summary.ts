// Plain-text summary for copying (prototype v12, summaryText).
import { isUpperLimit, shownValue } from '@/shaft/checks';
import type { ShaftCheck } from '@/shaft/types';
import type { Analysis } from './analysis';
import { quickRows } from './quick';
import { worstTraction, type Texts } from './texts';
import type { CalcKey, Pres } from './tr';
import { calcVerdict } from '../lift/calc-verdict';
import type { Collaudo } from '../lift/collaudo';
import type { TipoIntervento } from '../lift/intervento';
import { contestoKey } from '../report/intervento-text';

const LEGAL: readonly CalcKey[] = ['lg_1', 'lg_2', 'lg_3', 'lg_4', 'lg_5', 'lg_6'];

/** A check beyond the engine's that the calculation counts (calc-verdict.ts calcExtra), with its Italian name. */
export type NamedCheck = ShaftCheck & { label: string };

/** `rifacimento`: the lift renewed keeping its existing sling (the acceptance test's mark); `intervento`: the type
 *  chosen or declared with the calculation (round 45), which names the work instead; `extra`: D.1 and D.2 with the
 *  ratio of the loads changed, counted in the machine's result (round 48) and listed with its checks. */
export function summaryText(P: Pres, X: Texts, a: Analysis, opts: {
  badVisible: number; brand?: string; rifacimento?: boolean; intervento?: { tipo: TipoIntervento; collaudo: Collaudo } | null; extra?: readonly NamedCheck[];
}): string {
  const { t, fmt } = P;
  const { ctx, res, old, sizing, sens } = a, { I, N } = ctx;
  const L: string[] = [];
  if (opts.brand) L.push(opts.brand);
  L.push(t('sum_head'));
  if (opts.badVisible) L.push(t('invalid'));
  const it = opts.intervento, ctxKey: CalcKey = it ? contestoKey(it.tipo, it.collaudo) : I.context !== 'repl' ? 'ctx_new' : opts.rifacimento ? 'ctx_rif' : 'ctx_repl';
  L.push(`${t('title')} — ${t(`lay_${I.layout}`)} — ${t(ctxKey)}`);
  L.push(`Q ${fmt(I.Q, 0)} kg · P ${fmt(I.P, 0)} kg · k ${fmt(res.k, 3)} · M_cw ${fmt(res.Mcw, 0)} kg · v ${fmt(I.v, 2)} m/s · ${I.r}:1 · H ${fmt(I.H, 1)} m · α ${fmt(res.alphaDeg, 1)}°`);
  L.push(`D ${fmt(N.D, 0)} mm · ${X.grooveText(N.groove)} · ${N.n}×Ø${fmt(N.d, 1)} · i ${fmt(N.i, 1)} · ${fmt(N.Pn, 1)} kW · ${N.poles} ${t('poles_short')} · ${fmt(N.nm, 0)} 1/min`);
  L.push(`${t('v_prop')}: ${sizing.pick ? X.proposalShort(sizing.pick) : X.noneText(sizing)}`);
  if (sizing.pick) for (const [k, v] of X.proposalRows(sizing.pick, N, a.hold, !!sizing.keep)) L.push(`  ${k}: ${v}`);
  const extra = opts.extra ?? [], v = calcVerdict(res, extra);
  const failed = [...res.fails.map((c) => X.checkLabel(c.id)), ...extra.filter((c) => c.status === 'fail').map((c) => c.label)];
  L.push(`${t('g_new')}: ${X.countsText(v.fails, v.warns)}${failed.length ? ': ' + failed.join('; ') : ''}`);
  for (const q of quickRows(P, X, N, res, sens)) L.push(`  ${t(q.key)} — ${X.st(q.status)}: ${q.text}`);
  for (const c of res.checks) {
    const val = c.value == null ? '' : ` (${X.checkValue(c, N)}${c.limit != null ? ' / ' + X.checkLimit(c, N) : ''})`;
    L.push(`- ${X.checkText(c)}: ${X.st(c.status)}${val}`);
  }
  for (const c of extra) {
    const unit = c.unit ? ` ${c.unit}` : '', val = c.value == null ? '' : ` (${shownValue(c, fmt)}${unit}${c.limit != null ? ` / ${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}` : ''})`;
    L.push(`- ${c.label}: ${X.st(c.status)}${val}`);
  }
  L.push(X.sensLine(sens), ...X.sensChanges(sens).map((x) => `  ${x}`));
  if (old) L.push(`${t('col_old')}: v ${fmt(old.kin.vReal, 3)} m/s · ${t('k_trac')} ${fmt(worstTraction(old), 3)} · ${fmt(old.drive.Peq / 1000, 2)} kW`);
  L.push('', t('lg_title'), t('lg_short'), ...LEGAL.map((k, j) => `${j + 1}. ${t(k)}`), '', t('disclaimer'), 'Created and Designed by Carbon Stealth VCC · https://carbonstealth.eu');
  return L.join('\n');
}
