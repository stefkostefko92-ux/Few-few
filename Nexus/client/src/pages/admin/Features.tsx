/** Кула, награди за глава, боен пропуск, Trial Cache — поддръжка на функции. */
import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import { DataTable, PageHeader, StateView, Tag, Toolbar, errMsg, useAdminT, useConfirm, useFmt, useLoad } from './ui';

function useAction() {
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  return async (o: { title: string; body: string; label: string; run: () => Promise<unknown>; done: string; reload: () => unknown; danger?: boolean }) => {
    if (!(await confirm({ title: o.title, body: o.body, confirmLabel: o.label, danger: o.danger }))) return;
    try { await o.run(); toast(o.done, 'success'); await o.reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
}

export function Tower(): React.ReactElement {
  const { t } = useAdminT();
  const act = useAction();
  const { data, error, loading, reload } = useLoad<any[]>(async () => (await api.get('/admin/tower')).climbers, []);
  return (
    <>
      <PageHeader title={t('tower.title')} count={data?.length ?? null} />
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.length}>
        <DataTable
          rows={data || []}
          rowKey={(c) => c.id}
          cols={[
            { key: 'name', label: t('common.hero'), primary: true, render: (c) => <strong>{c.name}</strong> },
            { key: 'class', label: t('common.class'), render: (c) => <span className="cap">{c.class}</span> },
            { key: 'level', label: t('common.lv'), align: 'right' },
            { key: 'best', label: t('tower.best'), align: 'right', render: (c) => <span className="gold mono">F{c.tower_best_floor}</span> },
            { key: 'cur', label: t('tower.current'), align: 'right', render: (c) => `F${c.tower_current_floor}` },
            { key: 'trial_tokens', label: t('tower.tokens'), align: 'right' },
            { key: 'forge_guarantees', label: t('tower.wards'), align: 'right' },
          ]}
          actions={(c) => (
            <button
              type="button" className="btn btn-sm" disabled={!c.tower_current_floor}
              onClick={() => act({ title: t('tower.resetTitle', { name: c.name }), body: t('tower.resetBody'), label: t('tower.reset'), run: () => api.post(`/admin/tower/reset/${c.id}`), done: t('tower.done'), reload })}
            >{t('tower.reset')}</button>
          )}
        />
      </StateView>
    </>
  );
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function Bounties(): React.ReactElement {
  const { t } = useAdminT();
  const act = useAction();
  const { data, error, loading, reload } = useLoad<any[]>(async () => (await api.get('/admin/bounties')).rows, []);
  return (
    <>
      <PageHeader title={t('bounties.title')} count={data?.length ?? null} />
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.length}>
        <DataTable
          rows={data || []}
          rowKey={(r) => `${r.character_id}-${r.day_index}`}
          cols={[
            { key: 'hero', label: t('common.hero'), primary: true, render: (r) => <strong>{r.character_name}</strong> },
            { key: 'day', label: t('bounties.day'), mono: true, render: (r) => (Number.isFinite(r.day_index) ? new Date(r.day_index * 86_400_000).toISOString().slice(0, 10) : null) },
            {
              key: 'board', label: t('bounties.board'),
              render: (r) => (
                <span className="adm-tags">
                  {parseJson<any[]>(r.bounties_json, []).map((b, i) => (
                    <Tag key={i} tone={b.claimed ? 'emerald' : undefined}>{b.tier}: {b.monster_slug} {b.count_done}/{b.count_required}{b.claimed ? ' ✓' : ''}</Tag>
                  ))}
                </span>
              ),
            },
          ]}
          actions={(r) => (
            <button
              type="button" className="btn btn-sm"
              onClick={() => act({ title: t('bounties.clearTitle', { name: r.character_name }), body: t('bounties.clearBody'), label: t('bounties.clear'), run: () => api.post(`/admin/bounties/clear/${r.character_id}`), done: t('bounties.done'), reload })}
            >{t('bounties.clear')}</button>
          )}
        />
      </StateView>
    </>
  );
}

export function BattlePass(): React.ReactElement {
  const { t } = useAdminT();
  const act = useAction();
  const [month, setMonth] = useState('');
  const valid = month === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const { data, error, loading, reload } = useLoad<any[]>(
    async () => (valid ? (await api.get(`/admin/battlepass${month ? `?month=${month}` : ''}`)).rows : []),
    [month, valid],
  );
  return (
    <>
      <PageHeader title={t('battlepass.title')} count={data?.length ?? null} />
      <Toolbar>
        <label className="adm-select">
          <span className="sr-only">{t('battlepass.monthHint')}</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('battlepass.monthHint')} aria-invalid={!valid} />
        </label>
        {month && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMonth('')}>{t('common.all')}</button>}
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.length}>
        <DataTable
          rows={data || []}
          rowKey={(r) => `${r.character_id}-${r.month_key}`}
          cols={[
            { key: 'hero', label: t('common.hero'), primary: true, render: (r) => <strong>{r.character_name}</strong> },
            { key: 'month', label: t('common.month'), mono: true, render: (r) => r.month_key },
            { key: 'premium', label: t('battlepass.premium'), render: (r) => (r.premium_unlocked ? <Tag tone="gold">★ {t('battlepass.premium')}</Tag> : <Tag>{t('battlepass.free')}</Tag>) },
            { key: 'done', label: t('battlepass.completed'), align: 'right', render: (r) => Object.keys(parseJson<Record<string, unknown>>(r.progress_json, {})).length },
          ]}
          actions={(r) => (r.premium_unlocked ? null : (
            <button
              type="button" className="btn btn-sm"
              onClick={() => act({ title: t('battlepass.unlockTitle', { name: r.character_name, month: r.month_key }), body: t('battlepass.unlockBody'), label: t('battlepass.unlock'), run: () => api.post(`/admin/battlepass/unlock-premium/${r.character_id}`, { month: r.month_key }), done: t('battlepass.done'), reload })}
            >{t('battlepass.unlock')}</button>
          ))}
        />
      </StateView>
    </>
  );
}

export function TrialCache(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const { data, error, loading, reload } = useLoad<any[]>(async () => (await api.get('/admin/trial-purchases')).rows, []);
  return (
    <>
      <PageHeader title={t('trial.title')} count={data?.length ?? null} />
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.length}>
        <DataTable
          rows={data || []}
          rowKey={(r, i) => `${r.character_id}-${r.slug}-${i}`}
          cols={[
            { key: 'hero', label: t('common.hero'), primary: true, render: (r) => <strong>{r.character_name}</strong> },
            { key: 'slug', label: t('trial.slug'), mono: true },
            { key: 'bought', label: t('trial.bought'), render: (r) => fmt.dateTime(r.bought_at) },
          ]}
        />
      </StateView>
    </>
  );
}
