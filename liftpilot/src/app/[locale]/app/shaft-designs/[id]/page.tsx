import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { shaftInputsReadSchema, shaftSourceSchema } from '@/lib/shaft-input';
import { verifyShaftStored } from '@/lib/shaft-hash';
import { SHAFT_ENGINE_VERSION } from '@/shaft';
import { getShaftDesign } from '@/server/queries';
import { visiblePrices } from '@/server/prices';
import VerdictPill from '@/components/VerdictPill';
import Crumbs from '@/components/Crumbs';
import ShaftViews from '@/components/shaft/ShaftViews';
import ShaftResults from '@/components/shaft/ShaftResults';
import PanevBom from '@/components/shaft/PanevBom';
import { pitchesOf } from '@/lib/plant';
import { withPitches } from '@/shaft/brackets';

export async function generateMetadata() {
  const t = await getTranslations('shaft');
  return { title: t('title') };
}

export default async function ShaftDesignPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const d = await getShaftDesign(user, id);
  const inputs = d ? shaftInputsReadSchema.safeParse(d.inputs) : null;
  if (!d || !inputs?.success) notFound();
  const source = d.source ? shaftSourceSchema.safeParse(d.source) : null;
  const { layout: stored, same } = verifyShaftStored(inputs.data, d.sha256);
  // the bracket pitches of the installation's data: the plan's codes and the list count with them, as sheet 1
  const L = withPitches(stored, pitchesOf(d.project.plant));
  const [t, tc, tp] = await Promise.all([getTranslations('shaft'), getTranslations('calculations'), getTranslations('projects')]);
  const fd = dateFormat(locale), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const open = !d.project.archivedAt && can(user, 'calc:create');
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${d.projectId}`, label: d.project.name }, { label: t('title') }]} />
      <div className="page-head">
        <div className="titles"><h1>{t('title')}{d.label ? ` · ${d.label}` : ''}</h1></div>
        <div className="actions">
          {same && can(user, 'report:download') ? <a className="btn btn-primary" href={`/api/shaft-designs/${d.id}/dxf`}>{t('downloadDxf')}</a> : null}
          {d.liftDesign ? <Link className="btn" href={`/app/lift-designs/${d.liftDesign.id}`}>{t('openLift')}</Link>
            : open ? <Link className="btn" href={`/app/projects/${d.projectId}/progetto`}>{t('openForm')}</Link> : null}
        </div>
      </div>
      {same ? null : <p className="alert alert-warn">{t('engineChangedLift', { stored: d.engineVersion, current: SHAFT_ENGINE_VERSION })}</p>}
      <dl className="cartiglio">
        <div><dt>{tc('col_result')}</dt><dd><VerdictPill verdict={d.verdict} fails={d.failCount} warns={d.warnCount} /></dd></div>
        <div><dt>{tc('col_date')}</dt><dd>{fd.dateTime(d.createdAt)}</dd></div>
        <div><dt>{tc('col_author')}</dt><dd>{d.user?.name ?? '—'}</dd></div>
        <div><dt>{t('source')}</dt><dd>{source?.success ? t('sourceCad', { file: source.data.file, format: source.data.format.toUpperCase() }) : t('sourceHand')}</dd></div>
        <div><dt>{tc('engine')}</dt><dd className="num">{d.engineVersion} · {d.profileId}</dd></div>
        <div><dt>{t('col_design')}</dt><dd className="num">{d.summary}</dd></div>
        <div className="wide"><dt>{tc('col_hash')}</dt><dd className="hash">{d.sha256}{same ? ` · ${tc('hashOk')}` : ''}</dd></div>
        <div className="wide"><dt>{tc('title')}</dt><dd>{t('calcCount', { n: d._count.calculations })}</dd></div>
      </dl>
      <section className="panel shaft-output">
        <ShaftViews L={L} id={d.id} planLabel={t('planLabel', { W: L.inputs.W, D: L.inputs.D, A: L.A, B: L.B })} sectionLabel={t('sectionLabel')} scaleText={(n) => t('scale', { n })} />
        <ShaftResults L={L} texts={{ t: (k, v) => t(k, v), fmt }} />
        <p className="note">{t('limits')}</p>
      </section>
      <PanevBom L={L} prices={await visiblePrices(user)} />
    </main>
  );
}
