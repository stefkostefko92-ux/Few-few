/**
 * Модерация по DSA: сигнали (чл. 16) → „Разреши" (какво реално сочи сигналът,
 * с преглед) → сваляне с основание → обосновка по чл. 17 до автора (на неговия
 * език, в същата транзакция). Плюс ръчно сваляне по вид+id и банове.
 */
import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import BanDialog from './BanDialog';
import {
  DataTable, Field, Modal, PageHeader, Pager, Select, StateView, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useFmt, useLoad,
} from './ui';

const KINDS = ['character_name', 'bio', 'guild_name', 'guild_tag', 'guild_motto', 'guild_chat_message', 'global_chat_message', 'market_listing'] as const;

interface Target { kind: string; targetId: number; label: string; preview: string; authorCharId: number | null; authorName: string | null }
interface Notice {
  id: number; content_kind: string; content_ref: string; reason: string; description: string;
  notifier_name: string | null; notifier_email: string | null; status: string; decision: string | null; decided_at: number | null; created_at: number;
}

export default function Moderation(): React.ReactElement {
  const { t } = useAdminT();
  const [tab, setTab] = useState<'reports' | 'takedown' | 'bans'>('reports');
  const tabs = [
    { id: 'reports', label: t('moderation.tabReports') },
    { id: 'takedown', label: t('moderation.tabTakedown') },
    { id: 'bans', label: t('moderation.tabBans') },
  ] as const;
  return (
    <>
      <PageHeader title={t('moderation.title')} subtitle={t('moderation.subtitle')} />
      <div className="adm-tabs" role="tablist" aria-label={t('moderation.title')}>
        {tabs.map((x) => (
          <button
            key={x.id} type="button" role="tab" id={`mod-tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`mod-panel-${x.id}`}
            className={tab === x.id ? 'active' : undefined} onClick={() => setTab(x.id)}
          >{x.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`mod-panel-${tab}`} aria-labelledby={`mod-tab-${tab}`}>
        {tab === 'reports' && <Reports />}
        {tab === 'takedown' && <ManualTakedown />}
        {tab === 'bans' && <Bans />}
      </div>
    </>
  );
}

function Reports() {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useLoad<{ notices: Notice[]; total: number; page: number; pages: number; counts: Record<string, number> }>(
    () => api.get(`/admin/moderation/notices?${new URLSearchParams({ status, page: String(page), pageSize: '20' })}`),
    [status, page],
  );
  const [resolving, setResolving] = useState<Notice | null>(null);
  const counts = data?.counts || {};

  async function reject(n: Notice) {
    const r = await confirm({ title: t('moderation.rejectTitle', { id: n.id }), body: t('moderation.rejectBody'), reason: { min: 3, label: t('moderation.decision') }, confirmLabel: t('moderation.reject') });
    if (!r) return;
    try { await api.post(`/admin/moderation/dsa/${n.id}/reject`, { decision: r.reason }); toast(t('moderation.rejected'), 'success'); await reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <>
      <Toolbar>
        <Select
          label={t('common.status')} value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            ...['open', 'actioned', 'rejected'].map((s) => ({ value: s, label: `${t(`moderation.st.${s}`)} (${counts[s] ?? 0})` })),
            { value: 'all', label: t('common.all') },
          ]}
        />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.notices.length}>
        <DataTable
          rows={data?.notices || []}
          rowKey={(n) => n.id}
          dim={loading}
          cols={[
            { key: 'id', label: '#', mono: true, primary: true, render: (n) => `#${n.id}` },
            { key: 'kind', label: t('moderation.kind'), render: (n) => <Tag>{n.content_kind}</Tag> },
            { key: 'ref', label: t('moderation.reference'), mono: true, render: (n) => <span className="break">{n.content_ref}</span> },
            { key: 'reason', label: t('common.reason'), render: (n) => <Tag tone={/illegal/.test(n.reason) ? 'crimson' : 'gold'}>{t(`moderation.reasons.${n.reason}`, { defaultValue: n.reason })}</Tag> },
            { key: 'desc', label: t('moderation.description'), render: (n) => <span className="adm-clamp">{n.description}</span> },
            { key: 'notifier', label: t('moderation.notifier'), render: (n) => n.notifier_name || n.notifier_email || <span className="muted">{t('moderation.anonymous')}</span> },
            { key: 'when', label: t('common.when'), render: (n) => fmt.dateTime(n.created_at) },
            { key: 'status', label: t('common.status'), render: (n) => <Tag tone={n.status === 'open' ? 'gold' : n.status === 'actioned' ? 'emerald' : undefined}>{t(`moderation.st.${n.status}`, { defaultValue: n.status })}</Tag> },
            { key: 'decision', label: t('moderation.decision'), render: (n) => (n.decision ? <span className="muted adm-clamp">{n.decision}</span> : null) },
          ]}
          actions={(n) => (n.status === 'open' ? (
            <>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setResolving(n)}>{t('moderation.act')}</button>
              <button type="button" className="btn btn-sm" onClick={() => reject(n)}>{t('moderation.reject')}</button>
            </>
          ) : null)}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
      {resolving && <ResolveDialog notice={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); void reload(); }} />}
    </>
  );
}

function TargetCard({ target, onRemove }: { target: Target; onRemove?: () => void }) {
  const { t } = useAdminT();
  return (
    <div className="adm-target">
      <div className="adm-target-head">
        <Tag tone="sapphire">{t(`moderation.kinds.${target.kind}`, { defaultValue: target.kind })}</Tag>
        <span className="muted mono">#{target.targetId}</span>
        {target.label && <span className="muted">{target.label}</span>}
      </div>
      <blockquote className="adm-quote">{target.preview || <span className="muted">{t('moderation.previewEmpty')}</span>}</blockquote>
      <div className="adm-target-foot">
        <span className="muted">{t('moderation.author')}: {target.authorName || '—'}</span>
        {onRemove && <button type="button" className="btn btn-sm btn-danger" onClick={onRemove}>{t('moderation.remove')}</button>}
      </div>
    </div>
  );
}

function ResolveDialog({ notice, onClose, onDone }: { notice: Notice; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const { data, error, loading, reload } = useLoad<{ candidates: Target[] }>(() => api.get(`/admin/moderation/notices/${notice.id}/resolve`), [notice.id]);
  const [chosen, setChosen] = useState<Target | null>(null);
  const cands = data?.candidates || [];
  return (
    <Modal variant="drawer" title={t('moderation.resolveTitle', { id: notice.id })} onClose={onClose}>
      <p className="muted">{t('moderation.resolveHint')}</p>
      <dl className="adm-kv">
        <dt>{t('moderation.reference')}</dt><dd className="mono break">{notice.content_ref}</dd>
        <dt>{t('common.reason')}</dt><dd>{t(`moderation.reasons.${notice.reason}`, { defaultValue: notice.reason })}</dd>
        <dt>{t('moderation.description')}</dt><dd className="break">{notice.description}</dd>
      </dl>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!cands.length} emptyText={t('moderation.noCandidates')}>
        {cands.length > 1 && <p className="adm-warn" role="note">{t('moderation.ambiguous')}</p>}
        <div className="adm-target-list">
          {cands.map((c) => <TargetCard key={`${c.kind}-${c.targetId}`} target={c} onRemove={() => setChosen(c)} />)}
        </div>
      </StateView>
      {chosen && (
        <TakedownDialog
          target={chosen}
          noticeId={notice.id}
          // Само категорията — описанието на подателя може да съдържа негови лични
          // данни и НЕ бива да стига до автора (DSA чл. 17(3)(б): самоличността на
          // подателя — само ако е строго необходимо).
          initialReason={t('moderation.reasonFromNotice', { reason: t(`moderation.reasons.${notice.reason}`, { defaultValue: notice.reason }) })}
          onClose={() => setChosen(null)}
          onDone={onDone}
        />
      )}
    </Modal>
  );
}

function TakedownDialog({ target, noticeId, initialReason, onClose, onDone }: { target: Target; noticeId?: number; initialReason?: string; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState(initialReason || '');
  const [ground, setGround] = useState<'terms' | 'illegal'>('terms');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/moderation/takedown', { kind: target.kind, targetId: target.targetId, reason: reason.trim(), ground, notify, noticeId });
      toast(r.notified ? t('moderation.removedNotified') : t('moderation.removed'), 'success');
      onDone();
    } catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Modal
      danger
      title={t('moderation.takedownTitle')}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" form="adm-takedown" className="btn btn-danger" disabled={!ok || busy}>{t('moderation.remove').replace('…', '')}</button></>}
    >
      <form id="adm-takedown" className="adm-form" onSubmit={submit}>
        <p className="adm-confirm-body">{t('moderation.takedownBody')}</p>
        <TargetCard target={target} />
        <Field label={t('common.reason')} hint={t('confirm.reasonHint', { min: 3 })} wide>
          {(id) => <textarea id={id} rows={3} maxLength={300} value={reason} placeholder={t('moderation.reasonPlaceholder')} onChange={(e) => setReason(e.target.value)} data-autofocus />}
        </Field>
        <Field label={t('moderation.ground')} wide>
          {(id) => (
            <select id={id} value={ground} onChange={(e) => setGround(e.target.value as 'terms' | 'illegal')}>
              <option value="terms">{t('moderation.groundTerms')}</option>
              <option value="illegal">{t('moderation.groundIllegal')}</option>
            </select>
          )}
        </Field>
        <label className="adm-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('moderation.notify')}</label>
      </form>
    </Modal>
  );
}

function ManualTakedown() {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const [kind, setKind] = useState<string>('character_name');
  const [id, setId] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [removing, setRemoving] = useState(false);
  const validId = /^\d+$/.test(id) && Number(id) > 0;
  async function preview(e: React.FormEvent) {
    e.preventDefault();
    if (!validId) return;
    try { setTarget((await api.get(`/admin/moderation/target?kind=${kind}&id=${id}`)).target); }
    catch (err) { setTarget(null); toast(errMsg(err), 'error'); }
  }
  return (
    <section className="adm-card">
      <form className="adm-form inline" onSubmit={preview}>
        <Field label={t('moderation.targetKind')}>
          {(fid) => <select id={fid} value={kind} onChange={(e) => { setKind(e.target.value); setTarget(null); }}>{KINDS.map((k) => <option key={k} value={k}>{t(`moderation.kinds.${k}`)}</option>)}</select>}
        </Field>
        <Field label={t('moderation.targetId')}>
          {(fid) => <input id={fid} inputMode="numeric" value={id} onChange={(e) => { setId(e.target.value.trim()); setTarget(null); }} aria-invalid={!!id && !validId} />}
        </Field>
        <button type="submit" className="btn" disabled={!validId}>{t('moderation.preview')}</button>
      </form>
      {target && <TargetCard target={target} onRemove={() => setRemoving(true)} />}
      {removing && target && <TakedownDialog target={target} onClose={() => setRemoving(false)} onDone={() => { setRemoving(false); setTarget(null); }} />}
    </section>
  );
}

function Bans() {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad<{ users: any[]; ips: any[]; devices: any[] }>(() => api.get('/admin/moderation/bans'), []);
  const [uid, setUid] = useState('');
  const [found, setFound] = useState<{ id: number; username: string; is_admin: number } | null>(null);
  const [banning, setBanning] = useState(false);
  const validId = /^\d+$/.test(uid) && Number(uid) > 0;

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!validId) return;
    try { setFound((await api.get(`/admin/users/${uid}`)).user); }
    catch (err) { setFound(null); toast(errMsg(err), 'error'); }
  }
  async function unban(u: { id: number; username: string }) {
    if (!(await confirm({ title: t('moderation.unbanTitle', { name: u.username }), confirmLabel: t('moderation.unban') }))) return;
    try { await api.post('/admin/moderation/unban', { userId: u.id }); toast(t('moderation.unbanned'), 'success'); await reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <>
      <section className="adm-card">
        <h2 className="adm-h2">{t('moderation.banTitle')}</h2>
        <p className="muted">{t('moderation.banBody')}</p>
        <form className="adm-form inline" onSubmit={lookup}>
          <Field label={t('moderation.userId')}>
            {(fid) => <input id={fid} inputMode="numeric" value={uid} onChange={(e) => { setUid(e.target.value.trim()); setFound(null); }} aria-invalid={!!uid && !validId} />}
          </Field>
          <button type="submit" className="btn" disabled={!validId}>{t('moderation.lookup')}</button>
          {found && (
            <span className="adm-found">
              <strong>{found.username}</strong>
              {found.is_admin ? <Tag tone="gold">{t('users.roleAdmin')}</Tag> : (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setBanning(true)}>{t('users.ban')}…</button>
              )}
            </span>
          )}
        </form>
      </section>
      <h2 className="adm-h2">{t('moderation.bannedUsers')}</h2>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.users.length}>
        <DataTable
          rows={data?.users || []}
          rowKey={(u) => u.id}
          cols={[
            { key: 'username', label: t('common.user'), primary: true, render: (u) => <strong>{u.username} <span className="muted mono">#{u.id}</span></strong> },
            { key: 'reason', label: t('common.reason'), render: (u) => <span className="adm-clamp">{u.banned_reason}</span> },
            { key: 'since', label: t('moderation.since'), render: (u) => fmt.dateTime(u.banned_at) },
            { key: 'until', label: t('moderation.expires'), render: (u) => (u.banned_until ? fmt.dateTime(u.banned_until) : <Tag tone="crimson">{t('common.permanent')}</Tag>) },
          ]}
          actions={(u) => <button type="button" className="btn btn-sm" onClick={() => unban(u)}>{t('moderation.unban')}</button>}
        />
      </StateView>
      {data && <p className="muted small">{t('moderation.ipsDevices', { ips: data.ips.length, devices: data.devices.length })}</p>}
      {banning && found && <BanDialog user={found} onClose={() => setBanning(false)} onDone={() => { setBanning(false); setFound(null); setUid(''); void reload(); }} />}
    </>
  );
}
