// Verdict panel of the prototype v12 (renderVerdict): proposal in one line, result of the new machine counting
// failures and warnings, key figures, sensitivity, existing machine.
import type { Check } from '@/calc/types';
import Icon, { type IconName } from '@/components/Icon';
import type { Analysis } from '@/lib/present/analysis';
import { verdictClass, verdictStatus, worstTraction, type Texts } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';
import { Pill } from './ui';

export default function Verdict({ P, X, a, badCount }: { P: Pres; X: Texts; a: Analysis; badCount: number }) {
  const { t, fmt } = P;
  const { res, old, sizing, sens } = a;
  const warns = res.checks.filter((c) => c.status === 'warn');
  const pills = (list: readonly Check[], status: 'fail' | 'warn') => list.map((c) => <Pill key={c.id} status={status}>{X.checkLabel(c.id)}</Pill>);
  const head = badCount ? t('verdict_invalid') : X.verdictText(res);
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
    <div className="verdict">
      <div className="propline">
        <div className="eyebrow">{t('v_prop')}</div>
        <div className="v">{sizing.pick ? X.proposalShort(sizing.pick) : X.noneText(sizing)}</div>
      </div>
      <div className="eyebrow">{t('g_new')} · {t('indicative')}</div>
      <div className={`big ${badCount ? 'warn' : verdictClass(res)}`}>{head}</div>
      {res.fails.length ? <div className="fails">{pills(res.fails, 'fail')}</div> : null}
      {warns.length ? <div className="fails"><span className="note">{t('k_warns')}:</span>{pills(warns, 'warn')}</div> : null}
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
