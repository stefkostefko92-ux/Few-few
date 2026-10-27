// Verdict panel of the prototype v12 (renderVerdict): proposal in one line, result of the new machine counting
// failures and warnings, key figures, sensitivity, existing machine. A modernisation that keeps the machine (round 45,
// `resta`: its name) verifies it as it is: no proposal, the result under the kept machine's name. The result is the
// calculation's own (round 48, calc-verdict.ts): with the ratio of the loads changed, D.1 and D.2 (`extra`) are counted
// in it and named beside the engine's checks, each with its value against its limit (D.2's pressure in N/mm², the unit
// of the relazione's table — the check carries MPa, the same number). Round 52: under UNI 10411-1 the rope sheet's checks
// too, and S_f not counted where z of the sheet stands in for it (a note says so when S_f is not met).
import { useTranslations } from 'next-intl';
import type { Check } from '@/calc/types';
import Icon, { type IconName } from '@/components/Icon';
import { calcVerdict } from '@/lib/lift/calc-verdict';
import { senzaSostituite } from '@/lib/lift/sostituite';
import type { Analysis } from '@/lib/present/analysis';
import { verdictStatus, worstTraction, type Texts } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';
import { isUpperLimit, shownValue } from '@/shaft/checks';
import type { ShaftCheck } from '@/shaft/types';
import { Pill } from './ui';

const CLASS = { fail: 'ko', warn: 'warn', ok: 'ok' } as const;

/** An extra check's value against its limit, as the relazione prints them: «11,21 N/mm² > 8,25 N/mm²» (null without a
 *  value — D.1 with a slack side). */
function figure(c: ShaftCheck, fmt: (x: number, dec: number) => string): string | null {
  if (c.value === null || c.limit === null) return null;
  const unit = c.unit === 'MPa' ? '\u00a0N/mm²' : c.unit ? `\u00a0${c.unit}` : '';
  const met = c.status !== 'fail', sign = isUpperLimit(c.id) ? (met ? '≤' : '>') : (met ? '≥' : '<');
  return `${shownValue(c, fmt)}${unit} ${sign} ${fmt(c.limit, c.dec)}${unit}`;
}

/** `id`: the anchor of the checks it names (a saved calculation's: the result pill's panel leads there); `extra`: the
 *  checks beyond the engine's that the calculation counts (calcExtra: D.1 and D.2 with the ratio of the loads changed). */
export default function Verdict({ id, P, X, a, badCount, resta, extra = [] }: {
  id?: string; P: Pres; X: Texts; a: Analysis; badCount: number; resta?: string; extra?: readonly ShaftCheck[];
}) {
  const { t, fmt } = P, ts = useTranslations('shaft');
  const { res, old, sizing, sens } = a;
  const v = calcVerdict(res, extra);
  // compute()'s checks an extra one stands in for (S_f with z of the rope sheet, round 52) are not counted nor listed
  const fails = senzaSostituite(res.fails, extra), warns = senzaSostituite(res.checks, extra).filter((c) => c.status === 'warn');
  const sfz = v.sostituite.includes('r_sfa') && res.checks.some((c) => c.id === 'r_sfa' && c.status !== 'ok');
  const pills = (list: readonly Check[], status: 'fail' | 'warn') => list.map((c) => <Pill key={c.id} status={status}>{X.checkLabel(c.id)}</Pill>);
  // D.1 and D.2 under their names of the shaft's checks (messages shaft c_tr_d1, c_tr_d2), with their figures
  const more = (status: 'fail' | 'warn') => extra.filter((c) => c.status === status).map((c) => {
    const fig = figure(c, fmt);
    return <Pill key={c.id} status={status}>{ts(`c_${c.id}`)}{fig ? `: ${fig}` : null}</Pill>;
  });
  const extraFails = extra.some((c) => c.status === 'fail'), extraWarns = extra.some((c) => c.status === 'warn');
  const head = badCount ? t('verdict_invalid') : X.countsText(v.fails, v.warns);
  const moved = sens.some((s) => s.changed.length);
  // the template's KPI tile: name and icon tile on top, the figure, then what qualifies it
  const kpi = (icon: IconName, label: string, value: string, sub?: string) => (
    <div className="kpi">
      <div className="kpi-head"><span>{label}</span><span className="icon-tile sm"><Icon name={icon} size={18} /></span></div>
      <div className="v">{value}</div>
      {sub ? <div className="l">{sub}</div> : null}
    </div>
  );
  return (
    <div id={id} className="verdict">
      {resta ? null : (
        <div className="propline">
          <div className="eyebrow">{t('v_prop')}</div>
          <div className="v">{sizing.pick ? X.proposalShort(sizing.pick) : X.noneText(sizing)}</div>
        </div>
      )}
      <div className="eyebrow">{resta ?? t('g_new')} · {t('indicative')}</div>
      <div className={`big ${badCount ? 'warn' : CLASS[v.status]}`}>{head}</div>
      {fails.length || extraFails ? <div className="fails">{pills(fails, 'fail')}{more('fail')}</div> : null}
      {warns.length || extraWarns ? <div className="fails"><span className="note">{t('k_warns')}:</span>{pills(warns, 'warn')}{more('warn')}</div> : null}
      {sfz ? <div className="note">{t('v_sfz')}</div> : null}
      <div className="kpis">
        {kpi('gauge', t('k_speed'), `${fmt(res.kin.vReal, 3)} m/s`, `${fmt(res.kin.fRated, 2)} Hz`)}
        {kpi('rope', t('k_trac'), fmt(worstTraction(res), 3))}
        {kpi('zap', t('k_power'), `${fmt(res.drive.Pst / 1000, 2)} kW`, `${fmt(res.drive.powerUtil * 100, 0)}%`)}
        {kpi('weight', t('k_shaft'), `${fmt(res.shaft.testKg, 0)} kg ${res.shaft.up ? '↑' : '↓'}`)}
      </div>
      <div className="note">{moved ? <><span className="flag">⚠</span> </> : null}{X.sensLine(sens)}</div>
      {old ? (
        <div className="oldline">
          <div className="eyebrow">{t('g_old')}</div>
          <div className={`res ${verdictStatus(old)}`}>{X.verdictText(old)}</div>
          {old.fails.length ? <div className="fails">{pills(old.fails, 'fail')}</div> : null}
        </div>
      ) : null}
      {badCount ? <div className="note bad">{t('invalid')}</div> : null}
      <div className="note">{t('verdict_sub')}</div>
      <div className="sr-only" aria-live="polite">{head}</div>
    </div>
  );
}
