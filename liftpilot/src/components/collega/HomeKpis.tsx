import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { MAX_LINKED, type ImpiantiFigures } from '@/server/collega/home';

interface Tile {
  key: string;
  icon: IconName;
  tone?: 'ok' | 'warn' | 'fail';
  value: number;
  label: string;
  sub: string;
  href?: string;
}

/** The Rilievi home's figures (src/server/collega/home.ts says what each counts): the surveys not linked yet; with the
 *  installations in view, those whose survey and records disagree on site, and the calculations to update — each a link
 *  to its installations (/app/impianti?stato=…). */
export default async function HomeKpis({ counts, figures }: { counts: { totali: number; senzaImpianto: number }; figures: ImpiantiFigures | null }) {
  const t = await getTranslations('collega.home');
  const tiles: Tile[] = [
    { key: 'senza', icon: 'clipboard-list', tone: counts.senzaImpianto ? 'warn' : 'ok', value: counts.senzaImpianto, label: t('kpiSenza'),
      sub: t('kpiSenzaSub', { n: counts.totali }) },
    ...(figures ? [
      { key: 'diff', icon: figures.conDifferenze ? 'alert-triangle' : 'clipboard-check', tone: figures.conDifferenze ? 'fail' : 'ok', value: figures.conDifferenze,
        label: t('kpiDiff'), sub: figures.capped ? t('kpiDiffCapped', { n: MAX_LINKED }) : t('kpiDiffSub'), href: '/app/impianti?stato=differenze' } as Tile,
      { key: 'old', icon: 'refresh-cw', tone: figures.daAggiornare ? 'warn' : 'ok', value: figures.daAggiornare, label: t('kpiOld'),
        sub: t('kpiOldSub', { rilievo: figures.perRilievo, software: figures.perSoftware }), href: '/app/impianti?stato=aggiornare' } as Tile,
    ] : []),
  ];
  return (
    <section className="kpi-grid dash-kpis lk-kpis" aria-label={t('kpiLabel')}>
      {tiles.map((k) => {
        const body = (
          <>
            <div className="kpi-head">
              <span>{k.label}</span>
              <span className={k.tone ? `icon-tile sm ${k.tone}` : 'icon-tile sm'}><Icon name={k.icon} size={18} /></span>
            </div>
            <p className="kpi-value">{k.value}{k.key === 'diff' && figures?.capped ? '+' : ''}</p>
            <p className="kpi-label">{k.sub}</p>
          </>
        );
        const cls = `kpi dash-kpi-${k.key}${k.tone ? ` tone-${k.tone}` : ''}`;
        return k.href ? <Link key={k.key} href={k.href} className={`${cls} lk-kpi-link`}>{body}</Link> : <div key={k.key} className={cls}>{body}</div>;
      })}
      {figures ? null : <p className="note lk-kpis-note">{t('kpiOnlyRilievi')} <Link href="/app/rilievi">{t('all')}</Link></p>}
    </section>
  );
}
