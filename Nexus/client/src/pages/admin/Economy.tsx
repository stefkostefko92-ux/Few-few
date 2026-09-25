/** Поръчки, пазар и гилдии — икономическият изглед на админ панела. */
import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, Field, Modal, NumberInput, PageHeader, Pager, SearchBox, Select, StateView, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useDebounced, useFmt, useLoad,
} from './ui';

const STATUS_TONE: Record<string, 'gold' | 'emerald' | 'crimson' | 'sapphire' | undefined> = {
  pending: 'gold', completed: 'emerald', failed: 'crimson', refunded: 'sapphire', disputed: 'crimson',
  active: 'gold', sold: 'emerald', cancelled: 'crimson',
};

/* ===================== Поръчки ===================== */
interface Purchase {
  id: number; character_id: number | null; character_name: string | null; kind: string; amount_cents: number; currency: string;
  gems_granted: number; status: string; mode: string; stripe_session_id: string | null; created_at: number; completed_at: number | null;
}

export function Purchases(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ purchases: Purchase[]; total: number; page: number; pages: number }>(
    () => api.get(`/admin/purchases?${new URLSearchParams({ q: dq, status, page: String(page), pageSize: '25' })}`),
    [dq, status, page],
  );
  return (
    <>
      <PageHeader title={t('purchases.title')} count={data?.total ?? null} />
      <Toolbar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('purchases.searchPlaceholder')} />
        <Select
          label={t('common.status')} value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ value: 'all', label: t('common.all') }, ...['pending', 'completed', 'failed', 'refunded', 'disputed'].map((s) => ({ value: s, label: t(`purchases.st.${s}`) }))]}
        />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.purchases.length} emptyText={dq || status !== 'all' ? t('common.noResults') : undefined}>
        <DataTable
          rows={data?.purchases || []}
          rowKey={(p) => p.id}
          dim={loading}
          cols={[
            { key: 'id', label: t('common.id'), mono: true, primary: true, render: (p) => `#${p.id}` },
            { key: 'hero', label: t('common.hero'), render: (p) => p.character_name },
            { key: 'kind', label: t('purchases.product'), mono: true },
            { key: 'amount', label: t('purchases.amount'), align: 'right', render: (p) => fmt.money(p.amount_cents, p.currency) },
            { key: 'gems', label: t('purchases.gems'), align: 'right', render: (p) => (p.gems_granted ? <span className="gem">{fmt.num(p.gems_granted)}</span> : null) },
            { key: 'status', label: t('common.status'), render: (p) => <Tag tone={STATUS_TONE[p.status]}>{t(`purchases.st.${p.status}`, { defaultValue: p.status })}</Tag> },
            { key: 'mode', label: t('purchases.mode'), render: (p) => <span className="muted">{p.mode}</span> },
            { key: 'created_at', label: t('purchases.created'), render: (p) => fmt.dateTime(p.created_at) },
            { key: 'completed_at', label: t('purchases.completed'), render: (p) => (p.completed_at ? fmt.dateTime(p.completed_at) : null) },
          ]}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
    </>
  );
}

/* ===================== Пазар ===================== */
interface Listing {
  id: number; item_name: string; rarity: string; seller_name: string; buyer_name: string | null;
  price_gold: number; status: string; listed_at: number; sold_at: number | null;
}

export function Marketplace(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ listings: Listing[]; total: number; page: number; pages: number }>(
    () => api.get(`/admin/marketplace?${new URLSearchParams({ q: dq, status, page: String(page), pageSize: '25' })}`),
    [dq, status, page],
  );
  async function cancel(m: Listing) {
    const r = await confirm({
      title: t('market.cancelTitle', { item: m.item_name }),
      body: t('market.cancelBody'),
      reason: { min: 3, placeholder: t('moderation.reasonPlaceholder') },
      confirmLabel: t('market.cancel'),
      danger: true,
    });
    if (!r) return;
    try {
      await api.post(`/admin/marketplace/${m.id}/cancel`, { reason: r.reason });
      toast(t('market.cancelled'), 'success');
      await reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <>
      <PageHeader title={t('market.title')} count={data?.total ?? null} />
      <Toolbar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('market.searchPlaceholder')} />
        <Select
          label={t('common.status')} value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ value: 'all', label: t('common.all') }, ...['active', 'sold', 'cancelled'].map((s) => ({ value: s, label: t(`market.st.${s}`) }))]}
        />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.listings.length} emptyText={dq ? t('common.noResults') : undefined}>
        <DataTable
          rows={data?.listings || []}
          rowKey={(m) => m.id}
          dim={loading}
          cols={[
            { key: 'item', label: t('market.item'), primary: true, render: (m) => <strong className={`rarity-${m.rarity}`}>{m.item_name}</strong> },
            { key: 'seller', label: t('market.seller'), render: (m) => m.seller_name },
            { key: 'buyer', label: t('market.buyer'), render: (m) => m.buyer_name },
            { key: 'price', label: t('market.price'), align: 'right', render: (m) => <span className="gold mono">{fmt.num(m.price_gold)}</span> },
            { key: 'status', label: t('common.status'), render: (m) => <Tag tone={STATUS_TONE[m.status]}>{t(`market.st.${m.status}`, { defaultValue: m.status })}</Tag> },
            { key: 'listed', label: t('market.listed'), render: (m) => fmt.date(m.listed_at) },
            { key: 'sold', label: t('market.sold'), render: (m) => (m.sold_at ? fmt.date(m.sold_at) : null) },
          ]}
          actions={(m) => (m.status === 'active'
            ? <button type="button" className="btn btn-sm btn-danger" onClick={() => cancel(m)}>{t('market.cancel')}</button>
            : null)}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
    </>
  );
}

/* ===================== Гилдии ===================== */
interface Guild {
  id: number; name: string; tag: string; member_slots: number | null; member_count: number; xp: number; gold: number;
  attr_level: number; power_level: number; defence_level: number; exp_bonus_level: number; gold_bonus_level: number; gold_level: number;
}
const GUILD_FIELDS: { key: keyof Guild; max: number }[] = [
  { key: 'attr_level', max: 100 }, { key: 'power_level', max: 100 }, { key: 'defence_level', max: 100 },
  { key: 'exp_bonus_level', max: 100 }, { key: 'gold_bonus_level', max: 100 }, { key: 'gold_level', max: 100 },
  { key: 'xp', max: 1e12 }, { key: 'gold', max: 1e12 },
];

export function Guilds(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const { data, error, loading, reload } = useLoad<Guild[]>(async () => (await api.get('/admin/guilds')).guilds, []);
  const [edit, setEdit] = useState<Guild | null>(null);
  const [vals, setVals] = useState<Record<string, number | ''>>({});
  const [busy, setBusy] = useState(false);

  function open(g: Guild) {
    setEdit(g);
    setVals(Object.fromEntries(GUILD_FIELDS.map((f) => [f.key, g[f.key] as number])));
  }
  const bad = GUILD_FIELDS.find((f) => { const v = vals[f.key]; return v === '' || !Number.isInteger(v) || (v as number) < 0 || (v as number) > f.max; });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit || bad) return;
    const patch: Record<string, unknown> = {};
    for (const f of GUILD_FIELDS) if (vals[f.key] !== edit[f.key]) patch[f.key] = vals[f.key];
    if (!Object.keys(patch).length) { setEdit(null); return; }
    setBusy(true);
    try { await api.put(`/admin/guilds/${edit.id}`, patch); toast(t('common.saved'), 'success'); setEdit(null); await reload(); }
    catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title={t('guilds.title')} count={data?.length ?? null} />
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.length}>
        <DataTable
          rows={data || []}
          rowKey={(g) => g.id}
          cols={[
            { key: 'name', label: t('common.name'), primary: true, render: (g) => <strong>{g.name}</strong> },
            { key: 'tag', label: t('guilds.tag'), mono: true, render: (g) => `[${g.tag}]` },
            { key: 'members', label: t('guilds.members'), align: 'right', render: (g) => `${fmt.num(g.member_count)}${g.member_slots ? ` / ${fmt.num(g.member_slots)}` : ''}` },
            { key: 'xp', label: t('guilds.xp'), align: 'right', render: (g) => fmt.num(g.xp) },
            { key: 'gold', label: t('guilds.treasury'), align: 'right', render: (g) => <span className="gold">{fmt.num(g.gold)}</span> },
            {
              key: 'tracks', label: t('guilds.tracks'), mono: true,
              render: (g) => <span title={GUILD_FIELDS.slice(0, 6).map((f) => `${t(`guilds.f.${f.key}`)}: ${g[f.key]}`).join('\n')}>{g.attr_level}·{g.power_level}·{g.defence_level}·{g.exp_bonus_level}·{g.gold_bonus_level}·{g.gold_level}</span>,
            },
          ]}
          actions={(g) => <button type="button" className="btn btn-sm" onClick={() => open(g)}>{t('common.edit')}</button>}
        />
      </StateView>
      {edit && (
        <Modal
          variant="drawer"
          title={t('guilds.editTitle', { name: edit.name })}
          onClose={() => setEdit(null)}
          footer={<><button type="button" className="btn" onClick={() => setEdit(null)}>{t('common.cancel')}</button><button type="submit" form="adm-guild" className="btn btn-primary" disabled={!!bad || busy}>{busy ? t('common.saving') : t('common.save')}</button></>}
        >
          <form id="adm-guild" className="adm-form grid" onSubmit={save}>
            {GUILD_FIELDS.map((f) => (
              <Field key={f.key} label={t(`guilds.f.${f.key}`)} hint={t('common.range', { min: 0, max: fmt.num(f.max) })} error={bad?.key === f.key ? t('common.range', { min: 0, max: fmt.num(f.max) }) : null}>
                {(id) => <NumberInput id={id} value={vals[f.key]} min={0} max={f.max} onChange={(v) => setVals({ ...vals, [f.key]: v })} />}
              </Field>
            ))}
          </form>
        </Modal>
      )}
    </>
  );
}
