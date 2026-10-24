/**
 * Чат модерация — преглед на глобалния/гилдийския чат по потребител и време.
 * Изтриването минава през свалянето по DSA (`/moderation/takedown`): одит,
 * причина и по избор обосновка до автора (чл. 17) — без втори път за триене.
 */
import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  CharacterPicker, DataTable, Field, Modal, PageHeader, Pager, SearchBox, Select, StateView, Tag, Toolbar,
  errMsg, useAdminT, useDebounced, useFmt, useLoad, type CharOption,
} from './ui';

interface Msg {
  id: number; source: 'global' | 'guild'; guild_id: number | null; guild_tag: string | null; channel: string;
  character_id: number; character_name: string | null; username: string | null; message: string; created_at: number;
}

const RANGES: Record<string, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000 };

export default function Chat(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const [source, setSource] = useState<'global' | 'guild'>('global');
  const [q, setQ] = useState('');
  const [range, setRange] = useState('');
  const [hero, setHero] = useState<CharOption | null>(null);
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<Msg | null>(null);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ messages: Msg[]; total: number; page: number; pages: number }>(() => {
    const p = new URLSearchParams({ source, q: dq, page: String(page), pageSize: '30' });
    if (hero) p.set('character_id', String(hero.id));
    if (range) p.set('since', String(Date.now() - RANGES[range]));
    return api.get(`/admin/chat?${p}`);
  }, [source, dq, range, hero?.id, page]);

  return (
    <>
      <PageHeader title={t('chat.title')} count={data?.total ?? null} subtitle={t('chat.subtitle')} />
      <Toolbar>
        <Select label={t('chat.source')} value={source} onChange={(v) => { setSource(v as 'global' | 'guild'); setPage(1); }} options={[{ value: 'global', label: t('chat.global') }, { value: 'guild', label: t('chat.guild') }]} />
        <Select label={t('chat.range')} value={range} onChange={(v) => { setRange(v); setPage(1); }} options={[{ value: '', label: t('chat.anyTime') }, ...Object.keys(RANGES).map((k) => ({ value: k, label: t(`chat.ranges.${k}`) }))]} />
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('chat.searchPlaceholder')} />
        <div className="adm-select" style={{ flex: '1 1 260px' }}><CharacterPicker value={hero} onChange={(c) => { setHero(c); setPage(1); }} label={t('chat.byHero')} /></div>
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.messages.length} emptyText={t('common.noResults')}>
        <DataTable
          rows={data?.messages || []}
          rowKey={(m) => `${m.source}-${m.id}`}
          dim={loading}
          caption={t('chat.title')}
          cols={[
            { key: 'msg', label: t('chat.message'), primary: true, render: (m) => <span className="break">{m.message}</span> },
            { key: 'who', label: t('common.hero'), render: (m) => <span className="adm-stack"><span>{m.character_name}</span><span className="muted small">{m.username}</span></span> },
            { key: 'where', label: t('chat.where'), render: (m) => (m.source === 'guild' ? <Tag tone="sapphire">[{m.guild_tag}]</Tag> : <Tag>{m.channel}</Tag>) },
            { key: 'when', label: t('common.when'), render: (m) => fmt.dateTime(m.created_at) },
          ]}
          actions={(m) => <button type="button" className="btn btn-sm btn-danger" onClick={() => setRemoving(m)}>{t('common.delete')}</button>}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
      {removing && <RemoveDialog msg={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); void reload(); }} />}
    </>
  );
}

function RemoveDialog({ msg, onClose, onDone }: { msg: Msg; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState('');
  const [ground, setGround] = useState<'terms' | 'illegal'>('terms');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      await api.post('/admin/moderation/takedown', { kind: msg.source === 'guild' ? 'guild_chat_message' : 'global_chat_message', targetId: msg.id, reason: reason.trim(), ground, notify });
      toast(t('chat.removed'), 'success');
      onDone();
    } catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Modal
      title={t('chat.removeTitle', { name: msg.character_name || '—' })}
      danger
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" form="adm-chat-rm" className="btn btn-danger" disabled={!ok || busy}>{t('common.delete')}</button></>}
    >
      <form id="adm-chat-rm" className="adm-form" onSubmit={submit}>
        <blockquote className="adm-quote">{msg.message}</blockquote>
        <Field label={t('common.reason')} hint={t('confirm.reasonHint', { min: 3 })} wide>
          {(id) => <textarea id={id} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus />}
        </Field>
        <Field label={t('moderation.ground')} wide>
          {(id) => (
            <select id={id} value={ground} onChange={(e) => setGround(e.target.value as 'terms' | 'illegal')}>
              <option value="terms">{t('moderation.groundTerms')}</option>
              <option value="illegal">{t('moderation.groundIllegal')}</option>
            </select>
          )}
        </Field>
        <label className="adm-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('chat.notifyAuthor')}</label>
      </form>
    </Modal>
  );
}
