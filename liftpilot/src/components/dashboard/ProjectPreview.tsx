import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import VerdictPill from '@/components/VerdictPill';
import ShapesSvg from '@/components/drawing/ShapesSvg';
import type { LatestPlan } from '@/server/dashboard';
import { latestOf, type ListedProject } from './ProjectList';

// The installation changed last, as it is: for a whole project the plan at the main floor of its saved shaft, drawn by
// the running engine on white paper (a sheet on the desk, never an illustration); for a replacement, or a project not
// saved yet, its data alone. Its module, plant number, latest result and machine line, and the way to it.
export default async function ProjectPreview({ project: p, plan }: { project: ListedProject; plan: LatestPlan | null }) {
  const [t, tf, ts] = await Promise.all([getTranslations('projects'), getTranslations('refresh'), getTranslations('shaft')]);
  const { last, old } = latestOf(p);
  const planLabel = plan ? ts('planLabel', { W: plan.W, D: plan.D, A: plan.A, B: plan.B }) : '';
  return (
    <aside className="panel dash-preview" aria-labelledby="dash-preview-title">
      <div className="panel-head">
        <div className="dash-panel-titles">
          <p className="eyebrow plain">{t('preview_eyebrow')}</p>
          <h2 id="dash-preview-title">{p.name}</h2>
        </div>
        {plan ? (
          <Link className="btn btn-sm btn-icon" href={`/app/shaft-designs/${plan.shaftDesignId}`} aria-label={t('preview_openPlan')} title={t('preview_openPlan')}>
            <Icon name="maximize" size={16} />
          </Link>
        ) : null}
      </div>
      {plan ? (
        <figure className="dash-stage blueprint even">
          <div className="dash-paper">
            <ShapesSvg className="dash-plan-svg" shapes={plan.plan.shapes} w={plan.plan.w} h={plan.plan.h} id={`dash-${plan.shaftDesignId}`} label={planLabel} />
          </div>
          <figcaption className="dash-tag">{t('preview_planTag', { n: plan.plan.scale })}</figcaption>
        </figure>
      ) : (
        // no plan to draw: the machine of the latest calculation as its figures, like a nameplate
        <div className="dash-stage dash-plate blueprint even">
          <span className="icon-tile lg"><Icon name={p.kind === 'REPLACEMENT' ? 'motor' : 'elevator'} size={28} /></span>
          {last ? <ul className="dash-plate-list" role="list">{last.summary.split(' · ').map((v, i) => <li key={`${i}${v}`}>{v}</li>)}</ul> : null}
          <p className="note">{t(`preview_noPlan_${p.kind}`)}</p>
        </div>
      )}
      <dl className="dash-specs">
        <div><dt>{t('col_kind')}</dt><dd>{t(`kind_${p.kind}`)}</dd></div>
        <div><dt>{t('col_plantNumber')}</dt><dd className="mono">{p.plantNumber ?? '—'}</dd></div>
        <div className="wide">
          <dt>{t('col_last')}</dt>
          <dd className="dash-pills">
            {last ? <VerdictPill verdict={last.verdict} fails={last.failCount} warns={last.warnCount} /> : t('noCalculations')}
            {old ? <span className="chip old">{tf('outdated')}</span> : null}
          </dd>
        </div>
      </dl>
      {plan && last ? <p className="dash-row-sum dash-preview-sum">{last.summary}</p> : null}
      <Link className="btn btn-block" href={`/app/projects/${p.id}`}>
        {t('open')}<Icon name="arrow-up-right" size={16} />
      </Link>
    </aside>
  );
}
