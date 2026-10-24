/**
 * Статично съдържание (живее в кода — seed/*.ts): сетове, подземия,
 * козметика, постижения — преглед с търсене. Продуктите в магазина (реални
 * пари) имат замени на цена/видимост; каталогът не се мести в базата.
 */
import React, { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, Field, Modal, NumberInput, PageHeader, Pager, SearchBox, StateView, TabPanel, Tabs, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useFmt, useLoad, type Col,
} from './ui';

type TabId = 'products' | 'sets' | 'dungeons' | 'cosmetics' | 'achievements';
const PAGE = 25;

export default function Content(): React.ReactElement {
  const { t } = useAdminT();
  const [tab, setTab] = useState<TabId>('products');
  const tabs = [
    { id: 'products', label: t('content.tabs.products') },
    { id: 'sets', label: t('content.tabs.sets') },
    { id: 'dungeons', label: t('content.tabs.dungeons') },
    { id: 'cosmetics', label: t('content.tabs.cosmetics') },
    { id: 'achievements', label: t('content.tabs.achievements') },
  ] as const;
  return (
    <>
      <PageHeader title={t('content.title')} subtitle={t('content.subtitle')} />
      <Tabs idPrefix="cnt" tabs={tabs} value={tab} onChange={setTab} label={t('content.title')} />
      <TabPanel idPrefix="cnt" id={tab}>
        {tab === 'products' && <Products />}
        {tab === 'sets' && <Sets />}
        {tab === 'dungeons' && <Dungeons />}
        {tab === 'cosmetics' && <Cosmetics />}
        {tab === 'achievements' && <Achievements />}
      </TabPanel>
    </>
  );
}

/** Общ списък за статично съдържание: търсене по всички текстови полета + страници на клиента. */
function StaticList({ path, listKey, cols, rows: given }: { path?: string; listKey?: string; cols: Col<any>[]; rows?: any[] }) {
  const { t } = useAdminT();
  const { data, error, loading, reload } = useLoad<any[]>(async () => (given ? given : (await api.get(`/admin/content/${path}`))[listKey!]), [path, given]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data || [];
    return (data || []).filter((r) => JSON.stringify(r).toLowerCase().includes(s));
  }, [data, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  return (
    <>
      <Toolbar><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('content.searchPlaceholder')} /></Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!filtered.length} emptyText={q ? t('common.noResults') : undefined}>
        <DataTable rows={filtered.slice((cur - 1) * PAGE, cur * PAGE)} rowKey={(r: any, i) => r.slug ?? i} cols={cols} />
        <Pager page={cur} pages={pages} total={filtered.length} onPage={setPage} />
      </StateView>
    </>
  );
}

const bonusText = (b: Record<string, number> | null) => (b ? Object.entries(b).map(([k, v]) => `${k.replace('_bonus', '')} +${v}`).join(', ') : '');

function useSetCols(): Col<any>[] {
  const { t } = useAdminT();
  return [
    { key: 'name', label: t('common.name'), primary: true, render: (s) => <span className="adm-stack"><strong className={`rarity-${s.rarity}`}>{s.name}</strong><span className="muted mono small">{s.slug}</span></span> },
    { key: 'tier', label: t('content.tier'), align: 'right', render: (s) => `T${s.tier}` },
    { key: 'class', label: t('common.class'), render: (s) => <span className="cap">{s.class_focus || t('content.anyClass')}</span> },
    { key: 'lvl', label: t('common.lv'), align: 'right', render: (s) => s.level_req },
    { key: 'pieces', label: t('content.pieces'), align: 'right', render: (s) => s.pieces.length },
    { key: 'bonus', label: t('content.bonuses'), render: (s) => <span className="small mono">{[s.bonus_2 && `2: ${bonusText(s.bonus_2)}`, s.bonus_4 && `4: ${bonusText(s.bonus_4)}`, s.bonus_6 && `6: ${bonusText(s.bonus_6)}`].filter(Boolean).join(' · ')}</span> },
  ];
}
function useDungeonCols(): Col<any>[] {
  const { t } = useAdminT();
  return [
    { key: 'name', label: t('common.name'), primary: true, render: (d) => <span className="adm-stack"><strong>{d.name}</strong><span className="muted mono small">{d.slug}</span></span> },
    { key: 'region', label: t('catalog.cols.region'), mono: true, render: (d) => d.region },
    { key: 'lvl', label: t('common.lv'), align: 'right', render: (d) => d.level_req },
    { key: 'cd', label: t('content.cooldown'), align: 'right', render: (d) => `${d.cooldown_hours} h` },
    { key: 'stages', label: t('content.stages'), render: (d) => <span className="mono small">{d.stages.join(' → ')}</span> },
    { key: 'loot', label: t('content.loot'), render: (d) => <span className="mono small">{d.loot_pool.length}</span> },
  ];
}
function useAchCols(): Col<any>[] {
  const { t } = useAdminT();
  const fmt = useFmt();
  return [
    { key: 'name', label: t('common.name'), primary: true, render: (a) => <span className="adm-stack"><strong><span aria-hidden="true">{a.icon}</span> {a.name}</strong><span className="muted small">{a.description}</span></span> },
    { key: 'title', label: t('characters.ach.titleCol'), render: (a) => a.title },
    { key: 'reward', label: t('content.reward'), render: (a) => [a.gold ? `${fmt.num(a.gold)} g` : '', a.xp ? `${fmt.num(a.xp)} XP` : ''].filter(Boolean).join(' · ') || null },
    { key: 'n', label: t('content.unlockedBy'), align: 'right', render: (a) => fmt.num(a.unlocked_by) },
  ];
}

function Sets() { return <StaticList path="sets" listKey="sets" cols={useSetCols()} />; }
function Dungeons() { return <StaticList path="dungeons" listKey="dungeons" cols={useDungeonCols()} />; }
function Achievements() { return <StaticList path="achievements" listKey="achievements" cols={useAchCols()} />; }

function Cosmetics() {
  const { t } = useAdminT();
  const { data, error, loading, reload } = useLoad<any>(() => api.get('/admin/content/cosmetics'), []);
  const rows = useMemo(() => (data ? [
    ...data.avatars.map((a: any) => ({ ...a, kind: 'avatar' })),
    ...data.frames.map((f: any) => ({ ...f, kind: 'frame' })),
  ] : null), [data]);
  if (!rows) return <StateView loading={loading} error={error} onRetry={reload} />;
  return (
    <StaticList
      rows={rows}
      cols={[
        { key: 'name', label: t('common.name'), primary: true, render: (c) => <span className="adm-stack"><strong>{c.border ? <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, border: `2px solid ${c.border}`, marginRight: 6, verticalAlign: 'middle' }} /> : null}{c.name}</strong><span className="muted mono small">{c.slug}</span></span> },
        { key: 'kind', label: t('content.kind'), render: (c) => <Tag>{t(`content.kinds.${c.kind}`)}</Tag> },
        { key: 'detail', label: t('content.detail'), render: (c) => <span className="cap">{c.class || c.rarity || ''}{c.pattern ? ` · ${c.pattern}` : ''}</span> },
        { key: 'unlock', label: t('content.unlock'), mono: true, render: (c) => c.unlocked_by },
      ]}
    />
  );
}

/* ---------- Продукти (реални пари) ---------- */
interface Product {
  kind: string; name: string; tagline: string; price_cents: number; base_price_cents: number; currency: string; enabled: boolean; overridden: boolean;
  effects: { gems?: number; name_change?: boolean };
}

function Products() {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad<{ products: Product[]; limits: { min_cents: number; max_cents: number } }>(() => api.get('/admin/content/products'), []);
  const [edit, setEdit] = useState<Product | null>(null);
  async function toggle(p: Product) {
    const ok = await confirm({ title: t(p.enabled ? 'content.disableTitle' : 'content.enableTitle', { name: p.name }), body: p.enabled ? t('content.disableBody') : undefined, confirmLabel: t(p.enabled ? 'content.disable' : 'content.enable'), danger: p.enabled });
    if (!ok) return;
    try { await api.put(`/admin/content/products/${p.kind}`, { enabled: !p.enabled }); toast(t('common.saved'), 'success'); await reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <>
      <p className="adm-note">{t('content.productsNote')}</p>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.products.length}>
        <DataTable
          rows={data?.products || []}
          rowKey={(p) => p.kind}
          caption={t('content.tabs.products')}
          cols={[
            { key: 'name', label: t('purchases.product'), primary: true, render: (p) => <span className="adm-stack"><strong>{p.name}</strong><span className="muted mono small">{p.kind}</span></span> },
            { key: 'effect', label: t('content.effect'), render: (p) => (p.effects.gems ? <span className="gem">{fmt.num(p.effects.gems)}</span> : p.effects.name_change ? t('content.rename') : null) },
            { key: 'price', label: t('purchases.amount'), align: 'right', render: (p) => <span className="adm-stack"><span className="mono">{fmt.money(p.price_cents, p.currency)}</span>{p.price_cents !== p.base_price_cents ? <span className="muted small">{t('content.base', { price: fmt.money(p.base_price_cents, p.currency) })}</span> : null}</span> },
            { key: 'state', label: t('common.status'), render: (p) => <span className="adm-tags"><Tag tone={p.enabled ? 'emerald' : 'crimson'}>{t(p.enabled ? 'content.on' : 'content.off')}</Tag>{p.overridden ? <Tag tone="gold">{t('content.overridden')}</Tag> : null}</span> },
          ]}
          actions={(p) => (
            <>
              <button type="button" className="btn btn-sm" onClick={() => setEdit(p)}>{t('content.price')}</button>
              <button type="button" className={`btn btn-sm${p.enabled ? ' btn-danger' : ''}`} onClick={() => toggle(p)}>{t(p.enabled ? 'content.disable' : 'content.enable')}</button>
            </>
          )}
        />
      </StateView>
      {edit && data && <PriceDialog p={edit} limits={data.limits} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void reload(); }} />}
    </>
  );
}

function PriceDialog({ p, limits, onClose, onDone }: { p: Product; limits: { min_cents: number; max_cents: number }; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const [cents, setCents] = useState<number | ''>(p.price_cents);
  const bad = cents === '' || !Number.isInteger(cents) || cents < limits.min_cents || cents > limits.max_cents;
  async function save(price: number | null) {
    try { await api.put(`/admin/content/products/${p.kind}`, { price_cents: price }); toast(t('common.saved'), 'success'); onDone(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <Modal
      title={t('content.priceTitle', { name: p.name })}
      onClose={onClose}
      footer={(
        <>
          {p.price_cents !== p.base_price_cents && <button type="button" className="btn" onClick={() => save(null)}>{t('content.resetPrice', { price: fmt.money(p.base_price_cents, p.currency) })}</button>}
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" form="adm-price" className="btn btn-primary" disabled={bad}>{t('common.save')}</button>
        </>
      )}
    >
      <form id="adm-price" className="adm-form" onSubmit={(e) => { e.preventDefault(); if (!bad) void save(cents as number); }}>
        <Field
          label={t('content.priceCents')}
          hint={cents !== '' && !bad ? t('content.priceIs', { price: fmt.money(cents, p.currency) }) : t('common.range', { min: limits.min_cents, max: fmt.num(limits.max_cents) })}
          error={cents !== '' && bad ? t('common.range', { min: limits.min_cents, max: fmt.num(limits.max_cents) }) : null}
          wide
        >
          {(id) => <NumberInput id={id} value={cents} min={limits.min_cents} max={limits.max_cents} step={1} onChange={setCents} />}
        </Field>
        <p className="muted small">{t('content.priceHint')}</p>
      </form>
    </Modal>
  );
}
