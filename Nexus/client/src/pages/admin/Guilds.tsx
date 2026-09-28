/**
 * Гилдии — списък (търсене/страници) и чекмедже: данни и развитие,
 * членове (роля, изгонване, лидерство), трезор, войни и разпускане
 * (необратимо → потвърждение с тага на гилдията).
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, Field, Modal, NumberInput, PageHeader, Pager, SearchBox, StateView, TabPanel, Tabs, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useDebounced, useFmt, useLoad,
} from './ui';

interface GuildRow {
  id: number; name: string; tag: string; slots_tier: number; member_slots: number; member_count: number; xp: number; gold: number;
  leader_name: string | null; active_wars: number;
  attr_level: number; power_level: number; defence_level: number; exp_bonus_level: number; gold_bonus_level: number; gold_level: number;
}
const TRACKS = ['attr_level', 'power_level', 'defence_level', 'exp_bonus_level', 'gold_bonus_level', 'gold_level'] as const;

export default function Guilds(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ guilds: GuildRow[]; total: number; page: number; pages: number }>(
    () => api.get(`/admin/guilds?${new URLSearchParams({ q: dq, page: String(page), pageSize: '25' })}`),
    [dq, page],
  );
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PageHeader title={t('guilds.title')} count={data?.total ?? null} />
      <Toolbar><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('guilds.searchPlaceholder')} /></Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.guilds.length} emptyText={dq ? t('common.noResults') : undefined}>
        <DataTable
          rows={data?.guilds || []}
          rowKey={(g) => g.id}
          dim={loading}
          caption={t('guilds.title')}
          cols={[
            { key: 'name', label: t('common.name'), primary: true, render: (g) => <span className="adm-stack"><strong>{g.name} <span className="muted mono">[{g.tag}]</span></strong>{g.active_wars ? <span><Tag tone="crimson">{t('guilds.atWar')}</Tag></span> : null}</span> },
            { key: 'leader', label: t('guilds.leader'), render: (g) => g.leader_name },
            { key: 'members', label: t('guilds.members'), align: 'right', render: (g) => `${fmt.num(g.member_count)} / ${fmt.num(g.member_slots)}` },
            { key: 'xp', label: t('guilds.xp'), align: 'right', render: (g) => fmt.num(g.xp) },
            { key: 'gold', label: t('guilds.treasury'), align: 'right', render: (g) => <span className="gold">{fmt.num(g.gold)}</span> },
            { key: 'tracks', label: t('guilds.tracks'), mono: true, render: (g) => <span title={TRACKS.map((k) => `${t(`guilds.f.${k}`)}: ${g[k]}`).join('\n')}>{TRACKS.map((k) => g[k]).join('·')}</span> },
          ]}
          actions={(g) => <button type="button" className="btn btn-sm" onClick={() => setOpen(g.id)}>{t('common.details')}</button>}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
      {open && <GuildDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

type TabId = 'info' | 'members' | 'vault' | 'wars';

function GuildDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [tab, setTab] = useState<TabId>('info');
  const { data, error, loading, reload } = useLoad<any>(() => api.get(`/admin/guilds/${id}`), [id]);
  const g = data?.guild;
  const refresh = () => { void reload(); onChanged(); };
  async function disband() {
    const ok = await confirm({ title: t('guilds.disbandTitle', { name: g.name }), body: t('guilds.disbandBody', { members: data.members.length, vault: data.vault.length }), typeToConfirm: g.tag, confirmLabel: t('guilds.disband'), danger: true });
    if (!ok) return;
    try {
      await api.delete(`/admin/guilds/${id}?confirm=${encodeURIComponent(g.tag)}`);
      toast(t('guilds.disbanded', { name: g.name }), 'success');
      onChanged();
      onClose();
    } catch (err) { toast(errMsg(err), 'error'); }
  }
  const tabs = [
    { id: 'info', label: t('guilds.tabs.info') },
    { id: 'members', label: t('guilds.tabs.members', { n: data?.members.length ?? 0 }) },
    { id: 'vault', label: t('guilds.tabs.vault', { n: data?.vault.length ?? 0 }) },
    { id: 'wars', label: t('guilds.tabs.wars', { n: data?.wars.length ?? 0 }) },
  ] as const;
  return (
    <Modal variant="drawer" wide title={g ? `${g.name} [${g.tag}]` : t('common.loading')} onClose={onClose}>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!g}>
        {g && (
          <>
            <div className="adm-actions-bar"><button type="button" className="btn btn-sm btn-danger" onClick={disband}>{t('guilds.disband')}</button></div>
            <Tabs idPrefix="gld" tabs={tabs} value={tab} onChange={setTab} label={t('guilds.title')} />
            <TabPanel idPrefix="gld" id={tab}>
              {tab === 'info' && <Info guild={g} onSaved={refresh} />}
              {tab === 'members' && <Members guild={g} members={data.members} invitations={data.invitations} onChanged={refresh} />}
              {tab === 'vault' && <Vault guild={g} vault={data.vault} onChanged={refresh} />}
              {tab === 'wars' && <Wars guild={g} wars={data.wars} onChanged={refresh} />}
            </TabPanel>
          </>
        )}
      </StateView>
    </Modal>
  );
}

const NUMS: { key: string; min: number; max: number }[] = [
  { key: 'level', min: 1, max: 5 }, ...TRACKS.map((k) => ({ key: k, min: 0, max: 100 })),
  { key: 'xp', min: 0, max: 1e12 }, { key: 'gold', min: 0, max: 1e12 },
];

function Info({ guild, onSaved }: { guild: any; onSaved: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const init = () => ({ name: guild.name, tag: guild.tag, motto: guild.motto || '', description: guild.description || '', crest_color: guild.crest_color, ...Object.fromEntries(NUMS.map((f) => [f.key, guild[f.key]])) });
  const [v, setV] = useState<Record<string, any>>(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(init()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [guild]);
  const bad = NUMS.find((f) => v[f.key] === '' || !Number.isInteger(v[f.key]) || v[f.key] < f.min || v[f.key] > f.max);
  const nameBad = !/^[a-zA-Z][a-zA-Z0-9 ']{2,29}$/.test(v.name);
  const tagBad = !/^[A-Z0-9]{2,5}$/.test(v.tag);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad || nameBad || tagBad) return;
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(v)) if (v[k] !== (guild[k] ?? '')) patch[k] = v[k];
    if (!Object.keys(patch).length) { toast(t('common.noChanges'), 'info'); return; }
    setBusy(true);
    try { await api.put(`/admin/guilds/${guild.id}`, patch); toast(t('common.saved'), 'success'); onSaved(); }
    catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <form className="adm-form grid" onSubmit={save}>
      <Field label={t('common.name')} error={nameBad ? t('guilds.nameRule') : null}>{(fid) => <input id={fid} value={v.name} maxLength={30} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
      <Field label={t('guilds.tag')} error={tagBad ? t('guilds.tagRule') : null}>{(fid) => <input id={fid} value={v.tag} maxLength={5} onChange={(e) => setV({ ...v, tag: e.target.value.toUpperCase() })} />}</Field>
      <Field label={t('guilds.motto')} wide>{(fid) => <input id={fid} value={v.motto} maxLength={80} onChange={(e) => setV({ ...v, motto: e.target.value })} />}</Field>
      <Field label={t('guilds.description')} wide>{(fid) => <textarea id={fid} rows={3} value={v.description} maxLength={500} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
      <Field label={t('guilds.crest')}>{(fid) => <input id={fid} type="color" value={v.crest_color} onChange={(e) => setV({ ...v, crest_color: e.target.value })} />}</Field>
      {NUMS.map((f) => (
        <Field key={f.key} label={t(`guilds.f.${f.key}`)} hint={t('common.range', { min: fmt.num(f.min), max: fmt.num(f.max) })} error={bad?.key === f.key ? t('common.invalidNumber') : null}>
          {(fid) => <NumberInput id={fid} value={v[f.key]} min={f.min} max={f.max} onChange={(x) => setV({ ...v, [f.key]: x })} />}
        </Field>
      ))}
      <div className="adm-form-actions">
        <button type="button" className="btn" onClick={() => setV(init())}>{t('common.reset')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !!bad || nameBad || tagBad}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </form>
  );
}

function Members({ guild, members, invitations, onChanged }: { guild: any; members: any[]; invitations: any[]; onChanged: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  async function run(fn: () => Promise<unknown>, msg: string) {
    try { await fn(); toast(msg, 'success'); onChanged(); } catch (err) { toast(errMsg(err), 'error'); }
  }
  async function kick(m: any) {
    const ok = await confirm({ title: t('guilds.kickTitle', { name: m.name }), confirmLabel: t('guilds.kick'), danger: true });
    if (ok) await run(() => api.post(`/admin/guilds/${guild.id}/members/${m.character_id}/kick`), t('guilds.kicked'));
  }
  async function lead(m: any) {
    const ok = await confirm({ title: t('guilds.leaderTitle', { name: m.name }), body: t('guilds.leaderBody'), confirmLabel: t('guilds.makeLeader'), danger: true });
    if (ok) await run(() => api.post(`/admin/guilds/${guild.id}/leader`, { character_id: m.character_id }), t('guilds.leaderDone'));
  }
  return (
    <>
      <DataTable
        rows={members}
        rowKey={(m) => m.character_id}
        caption={t('guilds.members')}
        cols={[
          { key: 'name', label: t('common.hero'), primary: true, render: (m) => <Link to={`/admin/characters?open=${m.character_id}`}>{m.name}</Link> },
          { key: 'lvl', label: t('common.class'), render: (m) => <span className="cap">{t(`characters.cls.${m.class}`, { defaultValue: m.class })} · {t('common.lv')} {m.level}</span> },
          {
            key: 'role', label: t('guilds.role'),
            render: (m) => (m.role === 'leader'
              ? <Tag tone="gold">{t('guilds.roles.leader')}</Tag>
              : (
                <select aria-label={t('guilds.roleFor', { name: m.name })} value={m.role} onChange={(e) => run(() => api.put(`/admin/guilds/${guild.id}/members/${m.character_id}/role`, { role: e.target.value }), t('common.saved'))}>
                  {['officer', 'member', 'recruit'].map((r) => <option key={r} value={r}>{t(`guilds.roles.${r}`)}</option>)}
                </select>
              )),
          },
          { key: 'contrib', label: t('guilds.contribution'), align: 'right', render: (m) => fmt.num(m.contribution) },
          { key: 'joined', label: t('guilds.joined'), render: (m) => fmt.date(m.joined_at) },
        ]}
        actions={(m) => (m.role === 'leader' ? null : (
          <>
            <button type="button" className="btn btn-sm" onClick={() => lead(m)}>{t('guilds.makeLeader')}</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => kick(m)}>{t('guilds.kick')}</button>
          </>
        ))}
      />
      {invitations.length > 0 && (
        <>
          <h3 className="adm-h3">{t('guilds.invitations')}</h3>
          <ul className="adm-timeline">{invitations.map((i) => <li key={i.id}><span>{i.name}</span><span className="muted small">{fmt.dateTime(i.created_at)}</span></li>)}</ul>
        </>
      )}
    </>
  );
}

function Vault({ guild, vault, onChanged }: { guild: any; vault: any[]; onChanged: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  async function ret(v: any) {
    const ok = await confirm({ title: t('guilds.vaultReturnTitle', { item: v.name, owner: v.owner_name || '—' }), confirmLabel: t('guilds.vaultReturn') });
    if (!ok) return;
    try { await api.post(`/admin/guilds/${guild.id}/vault/${v.vault_id}/return`); toast(t('guilds.vaultReturned'), 'success'); onChanged(); } catch (err) { toast(errMsg(err), 'error'); }
  }
  async function destroy(v: any) {
    const ok = await confirm({ title: t('guilds.vaultDestroyTitle', { item: v.name }), body: t('guilds.vaultDestroyBody'), confirmLabel: t('guilds.vaultDestroy'), danger: true });
    if (!ok) return;
    try { await api.delete(`/admin/guilds/${guild.id}/vault/${v.vault_id}`); toast(t('common.deleted'), 'success'); onChanged(); } catch (err) { toast(errMsg(err), 'error'); }
  }
  return (
    <>
      <p className="muted small">{t('guilds.vaultHint')}</p>
      <StateView loading={false} error={null} isEmpty={!vault.length} emptyText={t('guilds.vaultEmpty')}>
        <DataTable
          rows={vault}
          rowKey={(v) => v.vault_id}
          caption={t('guilds.tabs.vault', { n: vault.length })}
          cols={[
            { key: 'item', label: t('characters.inv.item'), primary: true, render: (v) => <strong className={`rarity-${v.rarity}`}>{v.name}{v.quantity > 1 ? ` ×${v.quantity}` : ''}</strong> },
            { key: 'owner', label: t('guilds.owner'), render: (v) => v.owner_name },
            { key: 'by', label: t('guilds.depositedBy'), render: (v) => v.deposited_by_name },
            { key: 'when', label: t('common.when'), render: (v) => fmt.dateTime(v.deposited_at) },
          ]}
          actions={(v) => (
            <>
              <button type="button" className="btn btn-sm" onClick={() => ret(v)}>{t('guilds.vaultReturn')}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => destroy(v)}>{t('guilds.vaultDestroy')}</button>
            </>
          )}
        />
      </StateView>
    </>
  );
}

function Wars({ guild, wars, onChanged }: { guild: any; wars: any[]; onChanged: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const [ending, setEnding] = useState<any | null>(null);
  const [winner, setWinner] = useState('none');
  async function end(e: React.FormEvent) {
    e.preventDefault();
    try { await api.post(`/admin/guilds/${guild.id}/wars/${ending.id}/end`, { winner }); toast(t('guilds.warEnded'), 'success'); setEnding(null); onChanged(); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  return (
    <>
      <StateView loading={false} error={null} isEmpty={!wars.length} emptyText={t('guilds.noWars')}>
        <DataTable
          rows={wars}
          rowKey={(w) => w.id}
          caption={t('guilds.tabs.wars', { n: wars.length })}
          cols={[
            { key: 'sides', label: t('guilds.war'), primary: true, render: (w) => <span>[{w.attacker_tag}] {w.attacker_name} <span className="muted">vs</span> [{w.defender_tag}] {w.defender_name}</span> },
            { key: 'score', label: t('guilds.score'), mono: true, render: (w) => `${w.attacker_score} : ${w.defender_score}` },
            { key: 'status', label: t('common.status'), render: (w) => <Tag tone={w.status === 'active' ? 'crimson' : undefined}>{t(`guilds.warSt.${w.status}`, { defaultValue: w.status })}</Tag> },
            { key: 'ends', label: t('guilds.ends'), render: (w) => fmt.dateTime(w.ends_at) },
            { key: 'winner', label: t('guilds.winner'), render: (w) => (w.winner_guild_id ? (w.winner_guild_id === w.attacker_guild_id ? w.attacker_name : w.defender_name) : null) },
          ]}
          actions={(w) => (w.status === 'active' ? <button type="button" className="btn btn-sm btn-danger" onClick={() => { setEnding(w); setWinner('none'); }}>{t('guilds.endWar')}</button> : null)}
        />
      </StateView>
      {ending && (
        <Modal
          title={t('guilds.endWarTitle')}
          danger
          onClose={() => setEnding(null)}
          footer={<><button type="button" className="btn" onClick={() => setEnding(null)}>{t('common.cancel')}</button><button type="submit" form="adm-war-end" className="btn btn-danger">{t('guilds.endWar')}</button></>}
        >
          <form id="adm-war-end" className="adm-form" onSubmit={end}>
            <Field label={t('guilds.winner')} wide>
              {(fid) => (
                <select id={fid} value={winner} onChange={(e) => setWinner(e.target.value)}>
                  <option value="none">{t('guilds.noWinner')}</option>
                  <option value="attacker">{ending.attacker_name}</option>
                  <option value="defender">{ending.defender_name}</option>
                </select>
              )}
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
