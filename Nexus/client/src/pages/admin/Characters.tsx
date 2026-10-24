/**
 * Герои — пълно управление: списък/търсене/филтри и чекмедже с раздели
 * (преглед и редакция · инвентар · напредък · бойна история). Всички
 * промени минават през /api/admin/characters/* (одит от → към на сървъра).
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, Field, Modal, NumberInput, PageHeader, Pager, SearchBox, Select, StateView, TabPanel, Tabs, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useDebounced, useFmt, useLoad,
} from './ui';

const CLASSES = ['warrior', 'ranger', 'mage', 'rogue'] as const;

interface CharRow {
  id: number; name: string; class: string; level: number; xp: number; gold: number; gems: number; arena_rating: number;
  is_npc: number; current_title: string; created_at: number; user_id: number | null; username: string | null;
  last_seen_at: number | null; banned: number | null; banned_until: number | null; guild_id: number | null; guild_tag: string | null;
}
type Paged<K extends string, T> = { total: number; page: number; pages: number } & Record<K, T[]>;

const isBanned = (r: { banned: number | null; banned_until: number | null }) => r.banned === 1 && (!r.banned_until || r.banned_until > Date.now());

export default function Characters(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [kind, setKind] = useState('players');
  const [sort, setSort] = useState('level');
  const [minL, setMinL] = useState<number | ''>('');
  const [maxL, setMaxL] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const dMin = useDebounced(minL);
  const dMax = useDebounced(maxL);
  const { data, error, loading, reload } = useLoad<Paged<'characters', CharRow>>(() => {
    const p = new URLSearchParams({ q: dq, class: cls, kind, sort, page: String(page), pageSize: '25' });
    if (dMin !== '') p.set('min_level', String(dMin));
    if (dMax !== '') p.set('max_level', String(dMax));
    return api.get(`/admin/characters?${p}`);
  }, [dq, cls, kind, sort, dMin, dMax, page]);
  const openId = Number(params.get('open')) || null;
  const open = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', String(id)); else next.delete('open');
    setParams(next, { replace: true });
  };
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title={t('characters.title')} count={data?.total ?? null} subtitle={t('characters.subtitle')} />
      <Toolbar>
        <SearchBox value={q} onChange={reset(setQ)} placeholder={t('characters.searchPlaceholder')} />
        <Select label={t('common.class')} value={cls} onChange={reset(setCls)} options={[{ value: '', label: t('characters.allClasses') }, ...CLASSES.map((c) => ({ value: c, label: t(`characters.cls.${c}`) }))]} />
        <Select label={t('characters.kind')} value={kind} onChange={reset(setKind)} options={['players', 'npc', 'all'].map((k) => ({ value: k, label: t(`characters.kinds.${k}`) }))} />
        <Select label={t('characters.sort')} value={sort} onChange={reset(setSort)} options={['level', 'recent', 'gold', 'rating', 'name'].map((k) => ({ value: k, label: t(`characters.sorts.${k}`) }))} />
        <span className="adm-search narrow"><NumberInput value={minL} min={1} onChange={reset(setMinL)} placeholder={t('characters.minLevel')} ariaLabel={t('characters.minLevel')} /></span>
        <span className="adm-search narrow"><NumberInput value={maxL} min={1} onChange={reset(setMaxL)} placeholder={t('characters.maxLevel')} ariaLabel={t('characters.maxLevel')} /></span>
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.characters.length} emptyText={t('common.noResults')}>
        <DataTable
          rows={data?.characters || []}
          rowKey={(r) => r.id}
          dim={loading}
          caption={t('characters.title')}
          cols={[
            {
              key: 'name', label: t('common.hero'), primary: true,
              render: (r) => (
                <span className="adm-stack">
                  <strong>{r.name} <span className="muted mono">#{r.id}</span></strong>
                  <span className="adm-tags">
                    {r.is_npc ? <Tag tone="sapphire">{t('characters.npc')}</Tag> : null}
                    {isBanned(r) ? <Tag tone="crimson">{t('users.bannedTag')}</Tag> : null}
                    {r.current_title ? <span className="muted small">{r.current_title}</span> : null}
                  </span>
                </span>
              ),
            },
            { key: 'user', label: t('common.user'), render: (r) => r.username },
            { key: 'class', label: t('common.class'), render: (r) => <span className="cap">{t(`characters.cls.${r.class}`, { defaultValue: r.class })} · {t('common.lv')} {fmt.num(r.level)}</span> },
            { key: 'gold', label: t('users.goldGems'), align: 'right', render: (r) => <span className="mono"><span className="gold">{fmt.num(r.gold)}</span> · <span className="gem">{fmt.num(r.gems)}</span></span> },
            { key: 'rating', label: t('users.elo'), align: 'right', render: (r) => fmt.num(r.arena_rating) },
            { key: 'guild', label: t('characters.guild'), mono: true, render: (r) => (r.guild_tag ? `[${r.guild_tag}]` : null) },
            { key: 'seen', label: t('users.lastSeen'), render: (r) => (r.last_seen_at ? fmt.dateTime(r.last_seen_at) : null) },
          ]}
          actions={(r) => <button type="button" className="btn btn-sm" onClick={() => open(r.id)}>{t('common.details')}</button>}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
      {openId && <CharacterDrawer id={openId} onClose={() => open(null)} onChanged={reload} />}
    </>
  );
}

/* ===================== Чекмедже на героя ===================== */
type TabId = 'overview' | 'inventory' | 'progress' | 'combat';

export function CharacterDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { t } = useAdminT();
  const [tab, setTab] = useState<TabId>('overview');
  const detail = useLoad<any>(() => api.get(`/admin/characters/${id}`), [id]);
  const c = detail.data?.character;
  const refresh = () => { void detail.reload(); onChanged(); };
  const tabs = [
    { id: 'overview', label: t('characters.tabs.overview') },
    { id: 'inventory', label: t('characters.tabs.inventory') },
    { id: 'progress', label: t('characters.tabs.progress') },
    { id: 'combat', label: t('characters.tabs.combat') },
  ] as const;
  return (
    <Modal variant="drawer" wide title={c ? t('characters.drawerTitle', { name: c.name }) : t('common.loading')} onClose={onClose}>
      <StateView loading={detail.loading} error={detail.error} onRetry={detail.reload} isEmpty={!c}>
        {c && (
          <>
            <Tabs idPrefix="chr" tabs={tabs} value={tab} onChange={setTab} label={t('characters.title')} />
            <TabPanel idPrefix="chr" id={tab}>
              {tab === 'overview' && <Overview data={detail.data} onSaved={refresh} />}
              {tab === 'inventory' && <Inventory charId={id} onChanged={refresh} />}
              {tab === 'progress' && <Progress data={detail.data} onChanged={refresh} />}
              {tab === 'combat' && <Combat charId={id} />}
            </TabPanel>
          </>
        )}
      </StateView>
    </Modal>
  );
}

/* ---------- Преглед + редакция ---------- */
const NUM_FIELDS: { key: string; min: number; max: number }[] = [
  { key: 'level', min: 1, max: 1000 }, { key: 'xp', min: 0, max: 1e13 },
  { key: 'gold', min: 0, max: 1e12 }, { key: 'gems', min: 0, max: 1e9 },
  { key: 'hp', min: 1, max: 1e7 }, { key: 'hp_max', min: 1, max: 1e7 },
  { key: 'mp', min: 0, max: 1e7 }, { key: 'mp_max', min: 0, max: 1e7 },
  { key: 'energy', min: 0, max: 999 }, { key: 'energy_max', min: 1, max: 999 },
  { key: 'arena_rating', min: 0, max: 100000 }, { key: 'stat_points', min: 0, max: 100000 }, { key: 'skill_points', min: 0, max: 100000 },
  { key: 'strength', min: 0, max: 1e6 }, { key: 'dexterity', min: 0, max: 1e6 }, { key: 'constitution', min: 0, max: 1e6 },
  { key: 'intelligence', min: 0, max: 1e6 }, { key: 'charisma', min: 0, max: 1e6 }, { key: 'wisdom', min: 0, max: 1e6 },
  { key: 'trial_tokens', min: 0, max: 1e6 }, { key: 'forge_guarantees', min: 0, max: 1e6 }, { key: 'tower_best_floor', min: 0, max: 100000 },
];
const TEXT_FIELDS = ['name', 'current_title', 'bio'] as const;

function Overview({ data, onSaved }: { data: any; onSaved: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const c = data.character;
  const init = () => Object.fromEntries([...NUM_FIELDS.map((f) => [f.key, c[f.key]]), ...TEXT_FIELDS.map((k) => [k, c[k] ?? '']), ['class', c.class]]);
  const [vals, setVals] = useState<Record<string, any>>(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVals(init()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [c]);
  const bad = NUM_FIELDS.find((f) => { const v = vals[f.key]; return v === '' || !Number.isInteger(v) || v < f.min || v > f.max; });
  const nameBad = !/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(vals.name || '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad || nameBad) return;
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(vals)) if (vals[k] !== (c[k] ?? '')) patch[k] = vals[k];
    // Нивото и опитът са свързани — сървърът извежда липсващото.
    if ('level' in patch && 'xp' in patch) delete patch.xp;
    if (!Object.keys(patch).length) { toast(t('common.noChanges'), 'info'); return; }
    setBusy(true);
    try { await api.put(`/admin/characters/${c.id}`, patch); toast(t('common.saved'), 'success'); onSaved(); }
    catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <dl className="adm-kv">
        <dt>{t('common.id')}</dt><dd className="mono">#{c.id}{c.is_npc ? <> <Tag tone="sapphire">{t('characters.npc')}</Tag></> : null}</dd>
        <dt>{t('common.user')}</dt><dd>{data.user ? <>{data.user.username} <span className="muted mono">#{data.user.id}</span></> : '—'}</dd>
        <dt>{t('characters.guild')}</dt><dd>{data.guild ? <>{data.guild.name} <span className="muted mono">[{data.guild.tag}]</span> · <span className="cap">{t(`guilds.roles.${data.guild.role}`, { defaultValue: data.guild.role })}</span></> : '—'}</dd>
        <dt>{t('characters.created')}</dt><dd>{fmt.dateTime(c.created_at)}</dd>
        <dt>{t('characters.record')}</dt><dd>{t('characters.recordValue', { won: fmt.num(c.battles_won), lost: fmt.num(c.battles_lost), slain: fmt.num(c.monsters_slain) })}</dd>
        <dt>{t('characters.counts')}</dt><dd>{t('characters.countsValue', { inv: fmt.num(data.counts.inventory), battles: fmt.num(data.counts.battles), quests: fmt.num(data.counts.quests), mail: fmt.num(data.counts.mail) })}</dd>
      </dl>
      <h3 className="adm-h3">{t('characters.edit')}</h3>
      <form className="adm-form grid" onSubmit={save}>
        <Field label={t('common.name')} error={nameBad ? t('characters.nameRule') : null}>
          {(fid) => <input id={fid} value={vals.name} maxLength={20} autoComplete="off" onChange={(e) => setVals({ ...vals, name: e.target.value })} />}
        </Field>
        <Field label={t('common.class')}>
          {(fid) => (
            <select id={fid} value={vals.class} onChange={(e) => setVals({ ...vals, class: e.target.value })}>
              {CLASSES.map((k) => <option key={k} value={k}>{t(`characters.cls.${k}`)}</option>)}
            </select>
          )}
        </Field>
        {NUM_FIELDS.map((f) => (
          <Field key={f.key} label={t(`characters.f.${f.key}`)} error={bad?.key === f.key ? t('common.range', { min: fmt.num(f.min), max: fmt.num(f.max) }) : null} hint={f.key === 'xp' ? t('characters.xpHint') : undefined}>
            {(fid) => <NumberInput id={fid} value={vals[f.key]} min={f.min} max={f.max} onChange={(v) => setVals({ ...vals, [f.key]: v })} />}
          </Field>
        ))}
        <Field label={t('characters.f.current_title')} wide>
          {(fid) => <input id={fid} value={vals.current_title} maxLength={40} onChange={(e) => setVals({ ...vals, current_title: e.target.value })} />}
        </Field>
        <Field label={t('characters.f.bio')} wide>
          {(fid) => <textarea id={fid} rows={3} value={vals.bio} maxLength={500} onChange={(e) => setVals({ ...vals, bio: e.target.value })} />}
        </Field>
        <div className="adm-form-actions">
          <button type="button" className="btn" onClick={() => setVals(init())}>{t('common.reset')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !!bad || nameBad}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </>
  );
}

/* ---------- Инвентар ---------- */
interface InvRow {
  inv_id: number; quantity: number; equipped: number; slot: string; soul_bound: number; listed: number; vaulted_guild_id: number; gem_bought: number;
  enchant_count: number; enchant_bonuses_json: string; item_id: number; slug: string; name: string; category: string; sub_type: string;
  tier: number; rarity: string; level_req: number; class_req: string; is_mount: number;
}
const ENCHANT_KEYS = ['str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus', 'hp_bonus', 'mp_bonus', 'defense', 'atk_min', 'atk_max', 'phys_dmg_bonus', 'phys_def_bonus', 'mag_dmg_bonus', 'mag_def_bonus'] as const;
const EQUIPPABLE = new Set(['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'ring', 'amulet', 'cloak']);
const parseBonuses = (s: string): Record<string, number> => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

function Inventory({ charId, onChanged }: { charId: number; onChanged: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad<InvRow[]>(async () => (await api.get(`/admin/characters/${charId}/inventory`)).items, [charId]);
  const [q, setQ] = useState('');
  const [give, setGive] = useState({ slug: '', quantity: 1 as number | '', soul_bound: false });
  const [edit, setEdit] = useState<InvRow | null>(null);
  const done = async (msg: string) => { toast(msg, 'success'); await reload(); onChanged(); };
  const rows = (data || []).filter((r) => !q.trim() || `${r.name} ${r.slug} ${r.category}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function doGive(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[a-z0-9_]{2,60}$/.test(give.slug) || give.quantity === '' || give.quantity < 1) return;
    try {
      await api.post(`/admin/characters/${charId}/inventory`, { slug: give.slug, quantity: give.quantity, soul_bound: give.soul_bound });
      setGive({ slug: '', quantity: 1, soul_bound: false });
      await done(t('characters.inv.given'));
    } catch (err) { toast(errMsg(err), 'error'); }
  }
  async function toggle(r: InvRow) {
    const on = r.equipped === 1 || r.is_mount === 1;
    try { await api.post(`/admin/characters/${charId}/inventory/${r.inv_id}/${on ? 'unequip' : 'equip'}`); await done(t(on ? 'characters.inv.unequipped' : 'characters.inv.equipped')); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  async function remove(r: InvRow) {
    const ok = await confirm({ title: t('characters.inv.removeTitle', { item: r.name }), body: t('characters.inv.removeBody', { count: r.quantity }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try { await api.delete(`/admin/characters/${charId}/inventory/${r.inv_id}`); await done(t('common.deleted')); }
    catch (err) { toast(errMsg(err), 'error'); }
  }

  return (
    <>
      <form className="adm-form inline adm-card" onSubmit={doGive} aria-label={t('characters.inv.give')}>
        <Field label={t('characters.inv.slug')} hint={t('characters.inv.slugHint')}>
          {(fid) => <input id={fid} value={give.slug} maxLength={60} autoComplete="off" spellCheck={false} onChange={(e) => setGive({ ...give, slug: e.target.value.trim().toLowerCase() })} />}
        </Field>
        <Field label={t('characters.inv.qty')}>
          {(fid) => <NumberInput id={fid} value={give.quantity} min={1} max={100} onChange={(v) => setGive({ ...give, quantity: v })} />}
        </Field>
        <label className="adm-check"><input type="checkbox" checked={give.soul_bound} onChange={(e) => setGive({ ...give, soul_bound: e.target.checked })} /> {t('characters.inv.soulBound')}</label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!/^[a-z0-9_]{2,60}$/.test(give.slug)}>{t('characters.inv.give')}</button>
      </form>
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder={t('characters.inv.filter')} /></Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!rows.length} emptyText={t('characters.inv.empty')}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.inv_id}
          dim={loading}
          caption={t('characters.tabs.inventory')}
          cols={[
            { key: 'name', label: t('characters.inv.item'), primary: true, render: (r) => <span className="adm-stack"><strong className={`rarity-${r.rarity}`}>{r.name}</strong><span className="muted mono small">{r.slug} · T{r.tier}</span></span> },
            { key: 'cat', label: t('catalog.cols.cat'), render: (r) => <span className="cap">{r.category}{r.sub_type ? ` · ${r.sub_type}` : ''}</span> },
            { key: 'qty', label: t('characters.inv.qty'), align: 'right', render: (r) => r.quantity },
            {
              key: 'state', label: t('common.status'),
              render: (r) => (
                <span className="adm-tags">
                  {r.equipped ? <Tag tone="emerald">{t('characters.inv.st.equipped')}</Tag> : null}
                  {r.is_mount ? <Tag tone="emerald">{t('characters.inv.st.mount')}</Tag> : null}
                  {r.listed ? <Tag tone="gold">{t('characters.inv.st.listed')}</Tag> : null}
                  {r.vaulted_guild_id ? <Tag tone="sapphire">{t('characters.inv.st.vaulted')}</Tag> : null}
                  {r.soul_bound ? <Tag tone="amethyst">{t('characters.inv.st.soulBound')}</Tag> : null}
                </span>
              ),
            },
            { key: 'ench', label: t('characters.inv.enchant'), render: (r) => (r.enchant_count || Object.keys(parseBonuses(r.enchant_bonuses_json)).length ? <span className="mono small">+{r.enchant_count} · {Object.entries(parseBonuses(r.enchant_bonuses_json)).map(([k, v]) => `${k.replace('_bonus', '')} ${v > 0 ? '+' : ''}${v}`).join(', ')}</span> : null) },
          ]}
          actions={(r) => (
            <>
              {(EQUIPPABLE.has(r.category) || r.sub_type === 'mount') && !r.vaulted_guild_id && !r.listed
                ? <button type="button" className="btn btn-sm" onClick={() => toggle(r)}>{r.equipped || r.is_mount ? t('characters.inv.unequip') : t('characters.inv.equip')}</button>
                : null}
              <button type="button" className="btn btn-sm" onClick={() => setEdit(r)}>{t('common.edit')}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(r)} disabled={!!r.listed || !!r.vaulted_guild_id}>{t('common.delete')}</button>
            </>
          )}
        />
      </StateView>
      {edit && <InvEditor charId={charId} row={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await done(t('common.saved')); }} />}
    </>
  );
}

function InvEditor({ charId, row, onClose, onSaved }: { charId: number; row: InvRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const stackable = row.category === 'potion' || row.category === 'misc';
  const [qty, setQty] = useState<number | ''>(row.quantity);
  const [sb, setSb] = useState(!!row.soul_bound);
  const [count, setCount] = useState<number | ''>(row.enchant_count);
  const [bon, setBon] = useState<Record<string, number | ''>>(() => { const b = parseBonuses(row.enchant_bonuses_json); return Object.fromEntries(ENCHANT_KEYS.map((k) => [k, b[k] ?? 0])); });
  const [busy, setBusy] = useState(false);
  const bad = qty === '' || count === '' || Object.values(bon).some((v) => v === '' || !Number.isInteger(v) || Math.abs(v as number) > 100000);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad) return;
    const body: Record<string, unknown> = {};
    if (qty !== row.quantity) body.quantity = qty;
    if (sb !== !!row.soul_bound) body.soul_bound = sb;
    const before = parseBonuses(row.enchant_bonuses_json);
    const bonuses = Object.fromEntries(Object.entries(bon).filter(([, v]) => v !== 0));
    if (count !== row.enchant_count || JSON.stringify(bonuses) !== JSON.stringify(Object.fromEntries(ENCHANT_KEYS.filter((k) => before[k]).map((k) => [k, before[k]])))) {
      body.enchant_count = count;
      body.bonuses = bonuses;
    }
    if (!Object.keys(body).length) { onClose(); return; }
    setBusy(true);
    try { await api.patch(`/admin/characters/${charId}/inventory/${row.inv_id}`, body); onSaved(); }
    catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Modal
      title={t('characters.inv.editTitle', { item: row.name })}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" form="adm-inv-edit" className="btn btn-primary" disabled={busy || bad}>{busy ? t('common.saving') : t('common.save')}</button></>}
    >
      <form id="adm-inv-edit" className="adm-form grid" onSubmit={save}>
        <Field label={t('characters.inv.qty')} hint={stackable ? undefined : t('characters.inv.noStack')}>
          {(fid) => <NumberInput id={fid} value={qty} min={1} max={stackable ? 100000 : 1} onChange={setQty} />}
        </Field>
        <Field label={t('characters.inv.enchantCount')}>
          {(fid) => <NumberInput id={fid} value={count} min={0} max={100} onChange={setCount} />}
        </Field>
        <label className="adm-check"><input type="checkbox" checked={sb} onChange={(e) => setSb(e.target.checked)} /> {t('characters.inv.soulBound')}</label>
        <p className="muted small wide" style={{ gridColumn: '1 / -1', margin: 0 }}>{t('characters.inv.bonusHint')}</p>
        {ENCHANT_KEYS.map((k) => (
          <Field key={k} label={t(`characters.bonus.${k}`)}>
            {(fid) => <NumberInput id={fid} value={bon[k]} min={-100000} max={100000} onChange={(v) => setBon({ ...bon, [k]: v })} />}
          </Field>
        ))}
      </form>
    </Modal>
  );
}

/* ---------- Напредък: репутация, постижения, изчаквания ---------- */
function Progress({ data, onChanged }: { data: any; onChanged: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const c = data.character;
  const [rep, setRep] = useState<Record<string, number | ''>>(() => Object.fromEntries(data.factions.map((f: any) => [f.slug, f.rep])));
  const [achQ, setAchQ] = useState('');
  useEffect(() => { setRep(Object.fromEntries(data.factions.map((f: any) => [f.slug, f.rep]))); }, [data]);

  async function saveRep(slug: string) {
    const v = rep[slug];
    if (v === '' || !Number.isInteger(v) || v < 0) return;
    try { await api.put(`/admin/characters/${c.id}/reputation/${slug}`, { rep: v }); toast(t('common.saved'), 'success'); onChanged(); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  async function toggleAch(a: any) {
    if (a.unlocked_at) {
      const ok = await confirm({ title: t('characters.ach.revokeTitle', { name: a.name }), body: a.title ? t('characters.ach.revokeBody', { title: a.title }) : undefined, confirmLabel: t('characters.ach.revoke'), danger: true });
      if (!ok) return;
    }
    try {
      if (a.unlocked_at) await api.delete(`/admin/characters/${c.id}/achievements/${a.slug}`);
      else await api.post(`/admin/characters/${c.id}/achievements`, { slug: a.slug });
      toast(t(a.unlocked_at ? 'characters.ach.revoked' : 'characters.ach.granted'), 'success');
      onChanged();
    } catch (err) { toast(errMsg(err), 'error'); }
  }
  async function resetCd(scope: string) {
    const ok = await confirm({ title: t('characters.cd.confirmTitle', { scope: t(`characters.cd.scopes.${scope}`) }), body: t('characters.cd.confirmBody'), confirmLabel: t('characters.cd.reset') });
    if (!ok) return;
    try { await api.post(`/admin/characters/${c.id}/cooldowns/reset`, { scope }); toast(t('characters.cd.done'), 'success'); onChanged(); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  const cd = data.cooldowns;
  const now = Date.now();
  const achs = (data.achievements as any[]).filter((a) => !achQ.trim() || `${a.name} ${a.slug} ${a.title}`.toLowerCase().includes(achQ.trim().toLowerCase()));

  return (
    <>
      <h3 className="adm-h3">{t('characters.cd.title')}</h3>
      <dl className="adm-kv">
        {cd.actions.map((r: any) => <React.Fragment key={r.action_kind}><dt className="cap">{r.action_kind}</dt><dd>{r.next_available_at > now ? fmt.dateTime(r.next_available_at) : t('characters.cd.ready')}</dd></React.Fragment>)}
        {cd.dungeons.map((r: any) => <React.Fragment key={r.slug}><dt className="mono small">{r.slug}</dt><dd>{r.next_available_at > now ? fmt.dateTime(r.next_available_at) : t('characters.cd.ready')}</dd></React.Fragment>)}
        <dt>{t('characters.cd.daily')}</dt>
        <dd>{cd.daily ? t('characters.cd.dailyValue', { streak: cd.daily.streak, claim: cd.daily.last_claim_day >= cd.today ? t('characters.cd.taken') : t('characters.cd.free'), spin: cd.daily.last_spin_day >= cd.today ? t('characters.cd.taken') : t('characters.cd.free') }) : '—'}</dd>
      </dl>
      <div className="adm-inline-actions" style={{ marginTop: 10 }}>
        {['actions', 'dungeons', 'daily', 'all'].map((s) => <button key={s} type="button" className="btn btn-sm" onClick={() => resetCd(s)}>{t('characters.cd.resetScope', { scope: t(`characters.cd.scopes.${s}`) })}</button>)}
      </div>

      <h3 className="adm-h3">{t('characters.rep.title')}</h3>
      <div className="adm-settings">
        {data.factions.map((f: any) => (
          <div key={f.slug} className="adm-setting">
            <div className="adm-setting-info"><strong>{f.name}</strong><span className="muted small">{t('characters.rep.tier', { tier: f.tier.tier, name: f.tier.name })}</span></div>
            <div className="adm-setting-ctrl"><NumberInput value={rep[f.slug]} min={0} max={1000000} onChange={(v) => setRep({ ...rep, [f.slug]: v })} /></div>
            <div className="adm-setting-actions"><button type="button" className="btn btn-sm" disabled={rep[f.slug] === f.rep || rep[f.slug] === ''} onClick={() => saveRep(f.slug)}>{t('common.save')}</button></div>
          </div>
        ))}
      </div>

      <h3 className="adm-h3">{t('characters.ach.title', { n: (data.achievements as any[]).filter((a) => a.unlocked_at).length, total: data.achievements.length })}</h3>
      <p className="muted small">{t('characters.ach.hint')}</p>
      <Toolbar><SearchBox value={achQ} onChange={setAchQ} placeholder={t('characters.ach.filter')} /></Toolbar>
      <DataTable
        rows={achs}
        rowKey={(a: any) => a.slug}
        caption={t('characters.ach.caption')}
        cols={[
          { key: 'name', label: t('common.name'), primary: true, render: (a: any) => <span className="adm-stack"><strong><span aria-hidden="true">{a.icon}</span> {a.name}</strong><span className="muted small">{a.description}</span></span> },
          { key: 'title', label: t('characters.ach.titleCol'), render: (a: any) => a.title },
          { key: 'when', label: t('characters.ach.unlocked'), render: (a: any) => (a.unlocked_at ? fmt.date(a.unlocked_at) : null) },
        ]}
        actions={(a: any) => <button type="button" className={`btn btn-sm${a.unlocked_at ? ' btn-danger' : ''}`} onClick={() => toggleAch(a)}>{a.unlocked_at ? t('characters.ach.revoke') : t('characters.ach.grant')}</button>}
      />
    </>
  );
}

/* ---------- Бойна история (само четене) ---------- */
function Combat({ charId }: { charId: number }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const { data, error, loading, reload } = useLoad<Paged<'battles', any>>(
    () => api.get(`/admin/characters/${charId}/combat?${new URLSearchParams({ result, page: String(page), pageSize: '20' })}`),
    [charId, result, page],
  );
  return (
    <>
      <Toolbar>
        <Select label={t('characters.combat.result')} value={result} onChange={(v) => { setResult(v); setPage(1); }} options={[{ value: '', label: t('common.all') }, ...['win', 'loss', 'flee'].map((r) => ({ value: r, label: t(`characters.combat.r.${r}`) }))]} />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.battles.length} emptyText={t('characters.combat.empty')}>
        <DataTable
          rows={data?.battles || []}
          rowKey={(b: any) => b.id}
          dim={loading}
          caption={t('characters.tabs.combat')}
          cols={[
            { key: 'when', label: t('common.when'), primary: true, render: (b: any) => fmt.dateTime(b.created_at) },
            { key: 'opp', label: t('characters.combat.opponent'), render: (b: any) => b.opponent },
            { key: 'kind', label: t('characters.combat.kind'), mono: true, render: (b: any) => b.kind },
            { key: 'res', label: t('characters.combat.result'), render: (b: any) => <Tag tone={b.result === 'win' ? 'emerald' : b.result === 'loss' ? 'crimson' : undefined}>{t(`characters.combat.r.${b.result}`, { defaultValue: b.result })}</Tag> },
            { key: 'gain', label: t('characters.combat.gain'), align: 'right', render: (b: any) => <span className="mono">{fmt.num(b.xp_gained)} XP · <span className="gold">{fmt.num(b.gold_gained)}</span></span> },
            { key: 'rounds', label: t('characters.combat.rounds'), align: 'right', render: (b: any) => b.rounds },
          ]}
          actions={(b: any) => <button type="button" className="btn btn-sm" onClick={() => setOpen(b.id)}>{t('common.details')}</button>}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
      {open && <BattleModal charId={charId} id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function BattleModal({ charId, id, onClose }: { charId: number; id: number; onClose: () => void }) {
  const { t } = useAdminT();
  const { data, error, loading, reload } = useLoad<any>(async () => (await api.get(`/admin/characters/${charId}/combat/${id}`)).battle, [charId, id]);
  return (
    <Modal title={t('characters.combat.detailTitle', { id })} onClose={onClose}>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data}>
        {data && <div className="adm-meta"><pre>{JSON.stringify(data.rounds, null, 1).slice(0, 20000)}</pre></div>}
      </StateView>
    </Modal>
  );
}
