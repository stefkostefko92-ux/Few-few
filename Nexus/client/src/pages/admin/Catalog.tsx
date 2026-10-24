import React, { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, Field, Modal, NumberInput, PageHeader, Pager, SearchBox, StateView, Toolbar,
  errMsg, useAdminT, useConfirm, useFmt, useLoad, type Col,
} from './ui';

type Row = Record<string, any> & { id: number };
interface FieldDef {
  key: string; type: 'text' | 'number' | 'textarea' | 'select'; options?: string[]; min?: number; max?: number; wide?: boolean;
  /** Опциите се допълват от стойностите в каталога (напр. нови региони). */
  dynamic?: boolean;
}

const REGIONS = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];
const PAGE = 25;

function CrudPage(props: {
  kind: 'items' | 'monsters' | 'quests';
  what: 'item' | 'monster' | 'quest';
  listKey: string;
  cols: Col<Row>[];
  fields: FieldDef[];
  template: Record<string, unknown>;
  nameOf: (r: Row) => string;
}): React.ReactElement {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad<Row[]>(async () => (await api.get(`/admin/${props.kind}`))[props.listKey], [props.kind]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const rows = data || [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)));
  }, [data, query]);
  const dynOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of props.fields) {
      if (!f.dynamic) continue;
      const seen = new Set(f.options || []);
      for (const r of data || []) if (typeof r[f.key] === 'string' && r[f.key]) seen.add(r[f.key]);
      out[f.key] = [...seen];
    }
    return out;
  }, [data, props.fields]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const visible = filtered.slice((cur - 1) * PAGE, cur * PAGE);

  async function save() {
    if (!editing) return;
    // Празно числово поле = грешка, не тихо 0.
    const missing = props.fields.find((f) => f.type === 'number' && (editing[f.key] === '' || editing[f.key] === undefined || editing[f.key] === null));
    if (missing) { toast(`${t(`catalog.fields.${missing.key}`)}: ${t('common.invalidNumber')}`, 'error'); return; }
    const body: Record<string, unknown> = {};
    for (const f of props.fields) body[f.key] = editing[f.key];
    setSaving(true);
    try {
      if (editing.id) await api.put(`/admin/${props.kind}/${editing.id}`, body);
      else await api.post(`/admin/${props.kind}`, body);
      toast(t('common.saved'), 'success');
      setEditing(null);
      await reload();
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setSaving(false); }
  }

  async function destroy(r: Row) {
    const ok = await confirm({ title: t('catalog.deleteTitle', { name: props.nameOf(r) }), body: t('catalog.deleteBody'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await api.delete(`/admin/${props.kind}/${r.id}`);
      toast(t('common.deleted'), 'success');
      await reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  const whatLabel = t(`catalog.${props.what}`);
  return (
    <>
      <PageHeader title={t(`catalog.${props.kind}`)} count={data ? filtered.length : null}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ ...props.template })}>+ {t('common.new')}</button>
      </PageHeader>
      <Toolbar>
        <SearchBox value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder={t('catalog.filterPlaceholder')} />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!filtered.length} emptyText={query ? t('common.noResults') : undefined}>
        <DataTable
          cols={props.cols}
          rows={visible}
          rowKey={(r) => r.id}
          dim={loading}
          actions={(r) => (
            <>
              <button type="button" className="btn btn-sm" onClick={() => setEditing({ ...r })}>{t('common.edit')}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => destroy(r)} aria-label={`${t('common.delete')} ${props.nameOf(r)}`}>{t('common.delete')}</button>
            </>
          )}
        />
        <Pager page={cur} pages={pages} total={filtered.length} onPage={setPage} />
      </StateView>
      {editing && (
        <Modal
          variant="drawer"
          title={editing.id ? t('catalog.editTitle', { what: whatLabel }) : t('catalog.createTitle', { what: whatLabel })}
          onClose={() => setEditing(null)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button type="submit" form="adm-catalog-form" className="btn btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
            </>
          )}
        >
          <form id="adm-catalog-form" className="adm-form grid" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            {props.fields.map((f) => (
              <Field key={f.key} label={t(`catalog.fields.${f.key}`)} wide={f.wide || f.type === 'textarea'} hint={f.type === 'number' && f.max !== undefined ? t('common.range', { min: f.min ?? 0, max: f.max }) : undefined}>
                {(id) => {
                  const v = editing[f.key];
                  const set = (nv: unknown) => setEditing({ ...editing, [f.key]: nv });
                  if (f.type === 'textarea') return <textarea id={id} rows={3} value={v ?? ''} onChange={(e) => set(e.target.value)} />;
                  if (f.type === 'select') {
                    // Непозната текуща стойност (напр. нов регион) се показва, не се подменя тихо.
                    const base = dynOptions[f.key] || f.options!;
                    const opts = v && !base.includes(v) ? [v, ...base] : base;
                    return <select id={id} value={v ?? ''} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
                  }
                  if (f.type === 'number') return <NumberInput id={id} value={v} onChange={set} min={f.min} max={f.max} />;
                  return <input id={id} value={v ?? ''} onChange={(e) => set(e.target.value)} />;
                }}
              </Field>
            ))}
          </form>
        </Modal>
      )}
    </>
  );
}

const num = (key: string, min = 0, max?: number): FieldDef => ({ key, type: 'number', min, max });
const txt = (key: string): FieldDef => ({ key, type: 'text' });

export function Items(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  return (
    <CrudPage
      kind="items" what="item" listKey="items" nameOf={(r) => r.name}
      cols={[
        { key: 'name', label: t('common.name'), primary: true, render: (r) => <strong className={`rarity-${r.rarity}`}>{r.name}</strong> },
        { key: 'category', label: t('catalog.cols.cat') },
        { key: 'tier', label: t('catalog.fields.tier'), align: 'right' },
        { key: 'rarity', label: t('catalog.fields.rarity'), render: (r) => <span className={`rarity-pill ${r.rarity}`}>{r.rarity}</span> },
        { key: 'level_req', label: t('common.lv'), align: 'right' },
        { key: 'atk_max', label: t('catalog.cols.atk'), align: 'right' },
        { key: 'defense', label: t('catalog.cols.def'), align: 'right' },
        { key: 'buy_price', label: t('catalog.cols.buy'), align: 'right', render: (r) => fmt.num(r.buy_price) },
      ]}
      template={{ slug: '', name: '', category: 'weapon', sub_type: '', tier: 1, rarity: 'common', level_req: 1, class_req: '', atk_min: 0, atk_max: 0, defense: 0, hp_bonus: 0, mp_bonus: 0, str_bonus: 0, dex_bonus: 0, con_bonus: 0, int_bonus: 0, cha_bonus: 0, wis_bonus: 0, heal_hp: 0, heal_mp: 0, buy_price: 0, sell_price: 0, icon: 'sword', description: '' }}
      fields={[
        txt('slug'), txt('name'),
        { key: 'category', type: 'select', options: ['weapon', 'helm', 'armor', 'gloves', 'boots', 'shield', 'cloak', 'ring', 'amulet', 'potion', 'misc'] },
        { key: 'rarity', type: 'select', options: ['common', 'uncommon', 'rare', 'epic', 'legendary'] },
        num('tier', 1, 12), num('level_req', 1, 1000), txt('sub_type'), txt('class_req'),
        num('atk_min'), num('atk_max'), num('defense'),
        num('hp_bonus', -100000, 100000), num('mp_bonus', -100000, 100000),
        num('str_bonus', -100000, 100000), num('dex_bonus', -100000, 100000), num('con_bonus', -100000, 100000),
        num('int_bonus', -100000, 100000), num('wis_bonus', -100000, 100000), num('cha_bonus', -100000, 100000),
        num('heal_hp'), num('heal_mp'), num('buy_price'), num('sell_price'),
        { key: 'description', type: 'textarea' },
      ]}
    />
  );
}

export function Monsters(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  return (
    <CrudPage
      kind="monsters" what="monster" listKey="monsters" nameOf={(r) => r.name}
      cols={[
        { key: 'name', label: t('common.name'), primary: true, render: (r) => <strong>{r.name}</strong> },
        { key: 'level', label: t('common.lv'), align: 'right' },
        { key: 'hp', label: t('catalog.cols.hp'), align: 'right', render: (r) => fmt.num(r.hp) },
        { key: 'atk_max', label: t('catalog.cols.atk'), align: 'right' },
        { key: 'defense', label: t('catalog.cols.def'), align: 'right' },
        { key: 'xp_reward', label: t('catalog.cols.xp'), align: 'right', render: (r) => fmt.num(r.xp_reward) },
        { key: 'region', label: t('catalog.cols.region'), mono: true },
        { key: 'family', label: t('catalog.cols.family') },
      ]}
      template={{ slug: '', name: '', level: 1, hp: 20, atk_min: 2, atk_max: 4, defense: 0, speed: 5, xp_reward: 5, gold_min: 1, gold_max: 3, sprite: 'goblin', family: 'beast', region: 'whispering_woods' }}
      fields={[
        txt('slug'), txt('name'), num('level', 1, 1000), num('hp', 1),
        num('atk_min'), num('atk_max'), num('defense'), num('speed', 1, 50),
        num('xp_reward'), num('gold_min'), num('gold_max'),
        { key: 'sprite', type: 'select', dynamic: true, options: ['goblin', 'wolf', 'rat', 'boar', 'bandit', 'troll', 'orc', 'witch', 'spider', 'golem', 'serpent', 'wraith', 'drake', 'titan', 'shadowlord', 'overlord'] },
        { key: 'family', type: 'select', dynamic: true, options: ['beast', 'humanoid', 'giant', 'magic', 'construct', 'undead', 'dragon', 'demon'] },
        { key: 'region', type: 'select', dynamic: true, options: REGIONS },
      ]}
    />
  );
}

export function Quests(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  return (
    <CrudPage
      kind="quests" what="quest" listKey="quests" nameOf={(r) => r.title}
      cols={[
        { key: 'title', label: t('catalog.fields.title'), primary: true, render: (r) => <strong>{r.title}</strong> },
        { key: 'region', label: t('catalog.cols.region'), mono: true },
        { key: 'level_req', label: t('common.lv'), align: 'right' },
        { key: 'energy_cost', label: t('catalog.cols.en'), align: 'right' },
        { key: 'monster_slug', label: t('catalog.cols.foe'), mono: true },
        { key: 'xp_reward', label: t('catalog.cols.xp'), align: 'right', render: (r) => fmt.num(r.xp_reward) },
        { key: 'gold_reward', label: t('common.gold'), align: 'right', render: (r) => fmt.num(r.gold_reward) },
        { key: 'item_reward', label: t('catalog.cols.drop'), mono: true },
      ]}
      template={{ slug: '', title: '', region: 'whispering_woods', level_req: 1, energy_cost: 5, duration_sec: 0, intro: '', narrative: '', monster_slug: '', xp_reward: 10, gold_reward: 5, item_reward: '', success_text: '', failure_text: '' }}
      fields={[
        txt('slug'), txt('title'),
        { key: 'region', type: 'select', dynamic: true, options: REGIONS },
        num('level_req', 1, 1000), num('energy_cost', 0, 99), txt('monster_slug'),
        num('xp_reward'), num('gold_reward'), { key: 'item_reward', type: 'text', wide: true },
        { key: 'intro', type: 'textarea' }, { key: 'narrative', type: 'textarea' },
        { key: 'success_text', type: 'textarea' }, { key: 'failure_text', type: 'textarea' },
      ]}
    />
  );
}
