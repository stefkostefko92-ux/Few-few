/** Поръчки, пазар, аукцион и размени — икономическият изглед на админ панела. */
import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, PageHeader, Pager, SearchBox, Select, StateView, Tag, Toolbar,
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
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ purchases: Purchase[]; total: number; page: number; pages: number }>(
    () => api.get(`/admin/purchases?${new URLSearchParams({ q: dq, status, page: String(page), pageSize: '25' })}`),
    [dq, status, page],
  );
  async function refund(p: Purchase) {
    const r = await confirm({
      title: t('purchases.refundTitle', { id: p.id }),
      body: <>{t('purchases.refundBody', { amount: fmt.money(p.amount_cents, p.currency) })}{p.gems_granted ? <><br />{t('purchases.refundGems', { gems: fmt.num(p.gems_granted) })}</> : null}</>,
      reason: { min: 3, placeholder: t('purchases.refundReason') },
      confirmLabel: t('purchases.refund'),
      danger: true,
    });
    if (!r) return;
    try {
      const out = await api.post(`/admin/purchases/${p.id}/refund`, { reason: r.reason, revoke_gems: true });
      toast(t('purchases.refunded', { gems: fmt.num(out.gems_clawed_back) }), 'success');
      await reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <>
      <PageHeader title={t('purchases.title')} count={data?.total ?? null} subtitle={t('purchases.subtitle')} />
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
          actions={(p) => (p.status === 'completed' || p.status === 'disputed'
            ? <button type="button" className="btn btn-sm btn-danger" onClick={() => refund(p)}>{t('purchases.refund')}</button>
            : null)}
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

/* ===================== Аукцион (гемове, по час) ===================== */
interface Auction {
  id: number; hour_bucket: number; item_slug: string; item_name: string; rarity: string; starts_at: number; ends_at: number;
  starting_bid: number; current_bid: number; bidder_id: number | null; bidder_name: string | null; settled: number; cancelled_at: number;
}
const auctionState = (a: Auction, now: number) => (a.cancelled_at ? 'cancelled' : a.settled ? 'settled' : a.ends_at <= now ? 'closing' : 'open');
const AUCTION_TONE: Record<string, 'gold' | 'emerald' | 'crimson' | undefined> = { open: 'gold', closing: 'gold', settled: 'emerald', cancelled: 'crimson' };

export function Auction(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ listings: Auction[]; total: number; page: number; pages: number; server_now: number }>(
    () => api.get(`/admin/auction?${new URLSearchParams({ q: dq, status, page: String(page), pageSize: '25' })}`),
    [dq, status, page],
  );
  const now = data?.server_now ?? Date.now();
  async function cancel(a: Auction) {
    const r = await confirm({
      title: t('auction.cancelTitle', { item: a.item_name }),
      body: a.bidder_id ? t('auction.cancelBodyBid', { gems: fmt.num(a.current_bid), name: a.bidder_name }) : t('auction.cancelBody'),
      reason: { min: 3, placeholder: t('auction.reasonPlaceholder') },
      confirmLabel: t('auction.cancel'),
      danger: true,
    });
    if (!r) return;
    try {
      const out = await api.post(`/admin/auction/${a.id}/cancel`, { reason: r.reason });
      toast(t('auction.cancelled', { gems: fmt.num(out.refunded) }), 'success');
      await reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <>
      <PageHeader title={t('auction.title')} count={data?.total ?? null} subtitle={t('auction.subtitle')} />
      <Toolbar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('auction.searchPlaceholder')} />
        <Select label={t('common.status')} value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={['all', 'open', 'settled', 'cancelled'].map((s) => ({ value: s, label: t(`auction.st.${s}`) }))} />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.listings.length} emptyText={t('common.noResults')}>
        <DataTable
          rows={data?.listings || []}
          rowKey={(a) => a.id}
          dim={loading}
          caption={t('auction.title')}
          cols={[
            { key: 'item', label: t('market.item'), primary: true, render: (a) => <span className="adm-stack"><strong className={`rarity-${a.rarity}`}>{a.item_name}</strong><span className="muted mono small">#{a.id}</span></span> },
            { key: 'window', label: t('auction.window'), render: (a) => `${fmt.dateTime(a.starts_at)} – ${fmt.time(a.ends_at)}` },
            { key: 'bid', label: t('auction.bid'), align: 'right', render: (a) => <span className="gem mono">{fmt.num(a.current_bid)}</span> },
            { key: 'bidder', label: t('auction.bidder'), render: (a) => a.bidder_name },
            { key: 'status', label: t('common.status'), render: (a) => { const st = auctionState(a, now); return <Tag tone={AUCTION_TONE[st]}>{t(`auction.st.${st}`)}</Tag>; } },
          ]}
          actions={(a) => (!a.settled ? <button type="button" className="btn btn-sm btn-danger" onClick={() => cancel(a)}>{t('auction.cancel')}</button> : null)}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
    </>
  );
}

/* ===================== Размени (P2P escrow) ===================== */
interface Trade {
  id: number; from_id: number; from_name: string; to_id: number; to_name: string; from_gold: number; to_gold: number;
  from_item_count: number; to_item_count: number; from_ready: number; to_ready: number; status: string; created_at: number; updated_at: number;
}
const TRADE_TONE: Record<string, 'gold' | 'emerald' | 'crimson' | undefined> = { pending: 'gold', completed: 'emerald', cancelled: 'crimson', declined: 'crimson' };

export function Trades(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ trades: Trade[]; total: number; page: number; pages: number }>(
    () => api.get(`/admin/trades?${new URLSearchParams({ q: dq, status, page: String(page), pageSize: '25' })}`),
    [dq, status, page],
  );
  async function cancel(x: Trade) {
    const r = await confirm({ title: t('trades.cancelTitle', { a: x.from_name, b: x.to_name }), body: t('trades.cancelBody'), reason: { min: 3 }, confirmLabel: t('trades.cancel'), danger: true });
    if (!r) return;
    try { await api.post(`/admin/trades/${x.id}/cancel`, { reason: r.reason }); toast(t('trades.cancelled'), 'success'); await reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  const side = (items: number, gold: number) => [items ? t('trades.items', { count: items }) : '', gold ? `${fmt.num(gold)} g` : ''].filter(Boolean).join(' + ') || '—';
  return (
    <>
      <PageHeader title={t('trades.title')} count={data?.total ?? null} subtitle={t('trades.subtitle')} />
      <Toolbar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('trades.searchPlaceholder')} />
        <Select label={t('common.status')} value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={['all', 'pending', 'completed', 'cancelled', 'declined'].map((s) => ({ value: s, label: t(`trades.st.${s}`) }))} />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.trades.length} emptyText={t('common.noResults')}>
        <DataTable
          rows={data?.trades || []}
          rowKey={(x) => x.id}
          dim={loading}
          caption={t('trades.title')}
          cols={[
            { key: 'parties', label: t('trades.parties'), primary: true, render: (x) => <span>{x.from_name} ⇄ {x.to_name} <span className="muted mono">#{x.id}</span></span> },
            { key: 'from', label: t('trades.fromGives'), render: (x) => side(x.from_item_count, x.from_gold) },
            { key: 'to', label: t('trades.toGives'), render: (x) => side(x.to_item_count, x.to_gold) },
            { key: 'ready', label: t('trades.ready'), render: (x) => `${x.from_ready ? '✓' : '·'} / ${x.to_ready ? '✓' : '·'}` },
            { key: 'status', label: t('common.status'), render: (x) => <Tag tone={TRADE_TONE[x.status]}>{t(`trades.st.${x.status}`, { defaultValue: x.status })}</Tag> },
            { key: 'updated', label: t('trades.updated'), render: (x) => fmt.dateTime(x.updated_at) },
          ]}
          actions={(x) => (x.status === 'pending' ? <button type="button" className="btn btn-sm btn-danger" onClick={() => cancel(x)}>{t('trades.cancel')}</button> : null)}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
    </>
  );
}
