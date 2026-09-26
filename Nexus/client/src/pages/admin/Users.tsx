import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import BanDialog from './BanDialog';
import {
  DataTable, Field, Modal, NumberInput, PageHeader, Pager, SearchBox, Select, StateView, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useDebounced, useFmt, useLoad,
} from './ui';

interface UserRow {
  id: number; username: string; email: string; is_admin: number; created_at: number; last_seen_at: number;
  last_ip: string; last_country: string; country: string | null;
  banned: number; banned_until: number; banned_reason: string;
  char_id: number | null; char_name: string | null; char_class: string | null; char_level: number | null;
  gold: number | null; gems: number | null; arena_rating: number | null;
  hp: number; hp_max: number; mp: number; mp_max: number; stat_points: number; skill_points: number;
  energy: number; energy_max: number; current_title: string;
}
interface UsersResp { users: UserRow[]; total: number; page: number; pages: number }

const isBanned = (u: { banned: number; banned_until: number }) => u.banned === 1 && (u.banned_until === 0 || u.banned_until > Date.now());

export default function Users(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<UsersResp>(
    () => api.get(`/admin/users?${new URLSearchParams({ q: dq, filter, page: String(page), pageSize: '25' })}`),
    [dq, filter, page],
  );
  const [detail, setDetail] = useState<UserRow | null>(null);
  const navigate = useNavigate();
  // Героят се управлява на един екран — „Герои" (инвентар, напредък, бойна история).
  const openHero = (charId: number | null) => { if (charId) navigate(`/admin/characters?open=${charId}`); };
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader title={t('users.title')} count={data?.total ?? null}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ {t('users.createUser')}</button>
      </PageHeader>
      <Toolbar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('users.searchPlaceholder')} />
        <Select
          label={t('common.filter')}
          value={filter}
          onChange={(v) => { setFilter(v); setPage(1); }}
          options={[
            { value: 'all', label: t('users.filterAll') },
            { value: 'admins', label: t('users.filterAdmins') },
            { value: 'banned', label: t('users.filterBanned') },
          ]}
        />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.users.length} emptyText={dq || filter !== 'all' ? t('common.noResults') : undefined}>
        <DataTable
          rows={data?.users || []}
          rowKey={(u) => u.id}
          dim={loading}
          cols={[
            {
              key: 'username', label: t('common.user'), primary: true,
              render: (u) => (
                <span className="adm-stack">
                  <strong>{u.username} <span className="muted mono">#{u.id}</span></strong>
                  <span className="adm-tags">
                    {u.is_admin ? <Tag tone="gold">{t('users.roleAdmin')}</Tag> : null}
                    {isBanned(u) ? <Tag tone="crimson">{t('users.bannedTag')}</Tag> : null}
                  </span>
                </span>
              ),
            },
            { key: 'email', label: t('common.email'), render: (u) => <span className="muted break">{u.email}</span> },
            {
              key: 'char', label: t('users.character'),
              render: (u) => (u.char_id
                ? <span>{u.char_name} <span className="muted cap">{u.char_class} · {t('common.lv')} {fmt.num(u.char_level)}</span></span>
                : <span className="muted">{t('users.noHero')}</span>),
            },
            { key: 'gold', label: t('users.goldGems'), align: 'right', render: (u) => (u.char_id ? <span className="mono"><span className="gold">{fmt.num(u.gold)}</span> · <span className="gem">{fmt.num(u.gems)}</span></span> : null) },
            { key: 'ip', label: t('users.ipCountry'), mono: true, render: (u) => (u.last_ip ? <>{u.last_ip}{u.last_country ? <> <Tag>{u.last_country}</Tag></> : null}</> : null) },
            { key: 'last_seen_at', label: t('users.lastSeen'), render: (u) => fmt.dateTime(u.last_seen_at) },
          ]}
          actions={(u) => (
            <>
              <button type="button" className="btn btn-sm" onClick={() => setDetail(u)}>{t('common.details')}</button>
              {u.char_id ? <button type="button" className="btn btn-sm" onClick={() => openHero(u.char_id)}>{t('users.editHero')}</button> : null}
            </>
          )}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
      {detail && <UserDetail row={detail} onClose={() => setDetail(null)} onChanged={reload} onEditHero={() => { const id = detail.char_id; setDetail(null); openHero(id); }} />}
      {creating && <CreateUser onClose={() => setCreating(false)} onDone={() => { setCreating(false); void reload(); }} />}
    </>
  );
}

function UserDetail({ row, onClose, onChanged, onEditHero }: { row: UserRow; onClose: () => void; onChanged: () => void; onEditHero: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const me = useStore((s) => s.user);
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad<any>(() => api.get(`/admin/users/${row.id}`), [row.id]);
  const [banning, setBanning] = useState(false);
  const [gems, setGems] = useState(false);
  const u = data?.user;
  const self = me?.id === row.id;
  const refresh = () => { void reload(); onChanged(); };

  async function toggleAdmin() {
    const promote = !u.is_admin;
    const ok = await confirm({
      title: t(promote ? 'users.promoteTitle' : 'users.demoteTitle', { name: u.username }),
      body: promote ? t('users.promoteBody') : undefined,
      typeToConfirm: promote ? u.username : undefined,
      confirmLabel: t(promote ? 'users.promote' : 'users.demote'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/admin/users/${u.id}/admin`, { admin: promote });
      toast(t(promote ? 'users.promoted' : 'users.demoted', { name: u.username }), 'success');
      refresh();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function unban() {
    const ok = await confirm({ title: t('moderation.unbanTitle', { name: u.username }), confirmLabel: t('moderation.unban') });
    if (!ok) return;
    try { await api.post('/admin/moderation/unban', { userId: u.id }); toast(t('moderation.unbanned'), 'success'); refresh(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  async function erase() {
    const ok = await confirm({ title: t('users.deleteTitle', { name: u.username }), body: t('users.deleteBody'), typeToConfirm: u.username, confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await api.delete(`/admin/users/${u.id}?confirm=${encodeURIComponent(u.username)}`);
      toast(t('users.deletedToast'), 'success');
      onChanged();
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <Modal variant="drawer" title={t('users.detailTitle', { name: row.username })} onClose={onClose}>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!u}>
        {u && (
          <>
            <div className="adm-actions-bar">
              {data.character && <button type="button" className="btn btn-sm" onClick={onEditHero}>{t('users.editHero')}</button>}
              {data.character && <button type="button" className="btn btn-sm" onClick={() => setGems(true)}>{t('users.gems')}</button>}
              {!self && <button type="button" className="btn btn-sm" onClick={toggleAdmin}>{u.is_admin ? t('users.demote') : t('users.promote')}</button>}
              {!self && !u.is_admin && (isBanned(u)
                ? <button type="button" className="btn btn-sm" onClick={unban}>{t('moderation.unban')}</button>
                : <button type="button" className="btn btn-sm btn-danger" onClick={() => setBanning(true)}>{t('users.ban')}</button>)}
              {!self && !u.is_admin && <button type="button" className="btn btn-sm btn-danger" onClick={erase}>{t('common.delete')}</button>}
            </div>
            <h3 className="adm-h3">{t('users.account')}</h3>
            <dl className="adm-kv">
              <dt>{t('common.id')}</dt><dd className="mono">#{u.id}</dd>
              <dt>{t('common.email')}</dt><dd className="break">{u.email}</dd>
              <dt>{t('users.role')}</dt><dd>{u.is_admin ? <Tag tone="gold">{t('users.roleAdmin')}</Tag> : t('users.rolePlayer')}</dd>
              <dt>{t('users.registered')}</dt><dd>{fmt.dateTime(u.created_at)}</dd>
              <dt>{t('users.lastSeen')}</dt><dd>{fmt.dateTime(u.last_seen_at)}</dd>
              <dt>{t('users.country')}</dt><dd>{u.country || '—'}{u.last_country ? ` · ${u.last_country}` : ''}</dd>
              <dt>{t('users.lastIp')}</dt><dd className="mono">{u.last_ip || '—'}</dd>
              <dt>{t('users.userAgent')}</dt><dd className="muted break small">{u.last_user_agent || '—'}</dd>
              <dt>{t('users.banStatus')}</dt>
              <dd>{isBanned(u)
                ? <><Tag tone="crimson">{u.banned_until ? t('users.bannedUntil', { date: fmt.dateTime(u.banned_until) }) : t('common.permanent')}</Tag> <span className="muted">{u.banned_reason}</span></>
                : t('users.notBanned')}
              </dd>
            </dl>
            {data.character && (
              <>
                <h3 className="adm-h3">{t('users.character')}</h3>
                <dl className="adm-kv">
                  <dt>{t('common.name')}</dt><dd>{data.character.name} <span className="muted cap">{data.character.class}</span></dd>
                  <dt>{t('common.level')}</dt><dd>{fmt.num(data.character.level)}</dd>
                  <dt>{t('users.goldGems')}</dt><dd className="mono"><span className="gold">{fmt.num(data.character.gold)}</span> · <span className="gem">{fmt.num(data.character.gems)}</span></dd>
                  <dt>{t('users.elo')}</dt><dd>{fmt.num(data.character.arena_rating)}</dd>
                </dl>
              </>
            )}
            <h3 className="adm-h3">{t('users.purchases')}</h3>
            <dl className="adm-kv">
              <dt>{t('users.purchases')}</dt><dd>{fmt.num(data.purchases?.n)}</dd>
              <dt>{t('users.paid')}</dt><dd>{fmt.money(data.purchases?.paid_cents, 'eur')}</dd>
            </dl>
            <h3 className="adm-h3">{t('users.recentActivity')}</h3>
            {data.events?.length ? (
              <ul className="adm-timeline">
                {data.events.map((e: any) => (
                  <li key={e.id}>
                    <span className="muted mono small">{fmt.dateTime(e.ts)}</span>
                    <span><Tag tone={e.level === 'warn' ? 'gold' : e.level === 'error' ? 'crimson' : undefined}>{e.category}.{e.action}</Tag> {e.message}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">{t('users.noActivity')}</p>}
          </>
        )}
      </StateView>
      {banning && u && <BanDialog user={u} onClose={() => setBanning(false)} onDone={() => { setBanning(false); refresh(); }} />}
      {gems && u && data.character && <GemsDialog userId={u.id} name={data.character.name} onClose={() => setGems(false)} onDone={() => { setGems(false); refresh(); }} />}
    </Modal>
  );
}

function GemsDialog({ userId, name, onClose, onDone }: { userId: number; name: string; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const [amount, setAmount] = useState<number | ''>(100);
  const valid = typeof amount === 'number' && Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= 1_000_000;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      const r = await api.post(`/admin/users/${userId}/gems`, { amount });
      toast(t('users.gemsDone', { name: r.name, gems: r.gems }), 'success');
      onDone();
    } catch (err) { toast(errMsg(err), 'error'); }
  }
  return (
    <Modal
      title={t('users.gemsTitle', { name })}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" form="adm-gems" className="btn btn-primary" disabled={!valid}>{t('common.save')}</button></>}
    >
      <form id="adm-gems" className="adm-form" onSubmit={submit}>
        <Field label={t('users.gemsAmount')} hint={t('common.range', { min: '-1 000 000', max: '1 000 000' })} error={amount !== '' && !valid ? t('common.invalidNumber') : null} wide>
          {(id) => <NumberInput id={id} value={amount} onChange={setAmount} min={-1_000_000} max={1_000_000} />}
        </Field>
      </form>
    </Modal>
  );
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [f, setF] = useState({ username: '', email: '', password: '', dateOfBirth: '', country: 'BG', is_admin: false });
  const [busy, setBusy] = useState(false);
  const ok = /^[a-zA-Z0-9_]{3,20}$/.test(f.username) && /\S+@\S+\.\S+/.test(f.email) && f.password.length >= 8 && /^\d{4}-\d{2}-\d{2}$/.test(f.dateOfBirth) && /^[A-Z]{2}$/.test(f.country);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    if (f.is_admin) {
      const c = await confirm({ title: t('users.promoteTitle', { name: f.username }), body: t('users.promoteBody'), typeToConfirm: f.username, danger: true });
      if (!c) return;
    }
    setBusy(true);
    try { await api.post('/admin/users', f); toast(t('users.created'), 'success'); onDone(); }
    catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Modal
      title={t('users.createTitle')}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" form="adm-create-user" className="btn btn-primary" disabled={!ok || busy}>{t('common.create')}</button></>}
    >
      <form id="adm-create-user" className="adm-form" onSubmit={submit}>
        <Field label={t('users.username')} wide>{(id) => <input id={id} value={f.username} maxLength={20} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value })} />}</Field>
        <Field label={t('common.email')} wide>{(id) => <input id={id} type="email" value={f.email} autoComplete="off" onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label={t('users.password')} hint="≥ 8" wide>{(id) => <input id={id} type="password" value={f.password} autoComplete="new-password" onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
        <Field label={t('users.dateOfBirth')} hint={t('users.ageGateHint')}>{(id) => <input id={id} type="date" value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} />}</Field>
        <Field label={t('users.country')}>{(id) => <input id={id} value={f.country} maxLength={2} autoComplete="off" onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} />}</Field>
        <label className="adm-check"><input type="checkbox" checked={f.is_admin} onChange={(e) => setF({ ...f, is_admin: e.target.checked })} /> {t('users.makeAdmin')}</label>
      </form>
    </Modal>
  );
}
