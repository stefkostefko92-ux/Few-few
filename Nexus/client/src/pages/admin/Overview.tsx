import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { DataTable, PageHeader, StateView, Tag, useAdminT, useFmt, useLoad } from './ui';

interface OverviewData {
  counts: Record<string, number>;
  recentUsers: { id: number; username: string; email: string; created_at: number; is_admin: number }[];
  topChars: { id: number; name: string; class: string; level: number; arena_rating: number; gold: number }[];
}

export function Stat({ label, value, tone, to }: { label: string; value: React.ReactNode; tone?: 'alert' | 'ok'; to?: string }) {
  const body = (
    <>
      <span className="label">{label}</span>
      <span className="num">{value}</span>
    </>
  );
  return to
    ? <Link to={to} className={`admin-stat link${tone ? ` ${tone}` : ''}`}>{body}</Link>
    : <div className={`admin-stat${tone ? ` ${tone}` : ''}`}>{body}</div>;
}

export default function Overview(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const { data, error, loading, reload } = useLoad<OverviewData>(() => api.get('/admin/overview'), []);
  const c = data?.counts || {};
  return (
    <>
      <PageHeader title={t('overview.title')}>
        <button type="button" className="btn btn-sm" onClick={reload}>{t('common.refresh')}</button>
      </PageHeader>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data}>
        {c.open_notices > 0 && (
          <Link to="/admin/moderation" className="adm-banner">{t('overview.reviewReports', { count: c.open_notices })} →</Link>
        )}
        <div className="admin-stat-grid">
          <Stat label={t('overview.players')} value={fmt.num(c.characters)} to="/admin/users" />
          <Stat label={t('overview.users')} value={fmt.num(c.users)} />
          <Stat label={t('overview.admins')} value={fmt.num(c.admins)} />
          <Stat label={t('overview.banned')} value={fmt.num(c.banned)} to="/admin/moderation" />
          <Stat label={t('overview.openNotices')} value={fmt.num(c.open_notices)} tone={c.open_notices > 0 ? 'alert' : undefined} to="/admin/moderation" />
          <Stat label={t('overview.orders')} value={fmt.num(c.purchases_completed)} to="/admin/purchases" />
          <Stat label={t('overview.activeListings')} value={fmt.num(c.market_listings_active)} to="/admin/marketplace" />
          <Stat label={t('overview.guilds')} value={fmt.num(c.guilds)} to="/admin/guilds" />
          <Stat label={t('overview.items')} value={fmt.num(c.items)} to="/admin/items" />
          <Stat label={t('overview.monsters')} value={fmt.num(c.monsters)} to="/admin/monsters" />
          <Stat label={t('overview.quests')} value={fmt.num(c.quests)} to="/admin/quests" />
          <Stat label={t('overview.battles')} value={fmt.num(c.battles)} />
        </div>
        <div className="adm-two-col">
          <section>
            <h2 className="adm-h2">{t('overview.recentSignups')}</h2>
            <DataTable
              rows={data?.recentUsers || []}
              rowKey={(u) => u.id}
              cols={[
                { key: 'username', label: t('common.user'), primary: true, render: (u) => <strong>{u.username}</strong> },
                { key: 'email', label: t('common.email'), render: (u) => <span className="muted">{u.email}</span> },
                { key: 'created_at', label: t('overview.joined'), render: (u) => fmt.date(u.created_at) },
                { key: 'is_admin', label: t('overview.admin'), render: (u) => (u.is_admin ? <Tag tone="gold">{t('users.roleAdmin')}</Tag> : null) },
              ]}
            />
          </section>
          <section>
            <h2 className="adm-h2">{t('overview.topHeroes')}</h2>
            <DataTable
              rows={data?.topChars || []}
              rowKey={(c2) => c2.id}
              cols={[
                { key: 'name', label: t('common.name'), primary: true, render: (h) => <strong>{h.name}</strong> },
                { key: 'class', label: t('common.class'), render: (h) => <span className="cap">{h.class}</span> },
                { key: 'level', label: t('common.lv'), align: 'right', render: (h) => fmt.num(h.level) },
                { key: 'gold', label: t('common.gold'), align: 'right', render: (h) => <span className="gold">{fmt.num(h.gold)}</span> },
                { key: 'arena_rating', label: t('overview.elo'), align: 'right', render: (h) => fmt.num(h.arena_rating) },
              ]}
            />
          </section>
        </div>
      </StateView>
    </>
  );
}

export function Server(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const { data, error, loading, reload } = useLoad<{ node: string; uptime_sec: number; memory_mb: number; env: string; pid: number }>(() => api.get('/admin/server'), []);
  const up = data?.uptime_sec ?? 0;
  return (
    <>
      <PageHeader title={t('server.title')}>
        <button type="button" className="btn btn-sm" onClick={reload}>{t('common.refresh')}</button>
      </PageHeader>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data}>
        {data && (
          <div className="admin-stat-grid">
            <Stat label={t('server.node')} value={data.node} />
            <Stat label={t('server.uptime')} value={`${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h ${Math.floor((up % 3600) / 60)}m`} />
            <Stat label={t('server.memory')} value={fmt.num(data.memory_mb)} />
            <Stat label={t('server.env')} value={data.env} tone={data.env === 'production' ? 'ok' : undefined} />
            <Stat label={t('server.pid')} value={String(data.pid)} />
          </div>
        )}
      </StateView>
    </>
  );
}
