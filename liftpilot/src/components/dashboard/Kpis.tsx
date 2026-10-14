import { getTranslations } from 'next-intl/server';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import type { ProjectStats } from '@/lib/dashboard';
import type { RecordCounts } from '@/server/dashboard';

interface Tile {
  key: string;
  icon: IconName;
  tone?: 'ok' | 'warn' | 'fail';
  value: number;
  label: string;
  sub: string;
}

/** The dashboard's four figures, all from the company's records: the active installations by module; those to review
 *  (latest result not passing, no result yet, or made by engines since changed); the drawing sets issued and their
 *  revisions; the calculations saved and the installations created in the last 30 days — of the active installations,
 *  every one of them (server/dashboard.ts). */
export default async function Kpis({ stats, counts }: { stats: ProjectStats; counts: RecordCounts }) {
  const t = await getTranslations('projects');
  const tiles: Tile[] = [
    { key: 'active', icon: 'building', value: stats.active, label: t('kpi_active'), sub: t('kpi_active_sub', { r: stats.replacement, f: stats.full }) },
    {
      key: 'review', icon: stats.fail ? 'alert-triangle' : 'clipboard-check', tone: stats.fail ? 'fail' : stats.review ? 'warn' : 'ok', value: stats.review,
      label: t('kpi_review'), sub: t('kpi_review_sub', { fail: stats.fail, none: stats.noResult, old: stats.outdated }),
    },
    { key: 'sets', icon: 'file-stack', value: counts.sets, label: t('kpi_sets'), sub: t('kpi_sets_sub', { n: counts.revisions }) },
    { key: 'recent', icon: 'activity', value: counts.recentCalcs, label: t('kpi_recent'), sub: t('kpi_recent_sub', { n: counts.recentProjects }) },
  ];
  return (
    <section className="kpi-grid dash-kpis" aria-label={t('kpiLabel')}>
      {tiles.map((k) => (
        <div key={k.key} className={`kpi dash-kpi-${k.key}${k.tone ? ` tone-${k.tone}` : ''}`}>
          <div className="kpi-head">
            <span>{k.label}</span>
            <span className={k.tone ? `icon-tile sm ${k.tone}` : 'icon-tile sm'}><Icon name={k.icon} size={18} /></span>
          </div>
          <p className="kpi-value">{k.value}</p>
          <p className="kpi-label">{k.sub}</p>
        </div>
      ))}
    </section>
  );
}
