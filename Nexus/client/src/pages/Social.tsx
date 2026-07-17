import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Avatar from '../components/Avatar';

interface CharCard { id: number; name: string; class: string; level: number; avatar: string; frame_slug: string; }
interface Overview { friends: CharCard[]; incoming: CharCard[]; outgoing: CharCard[]; blocked: CharCard[]; }

export default function Social(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const [data, setData] = useState<Overview | null>(null);
  const [addName, setAddName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Overview>('/social/overview').then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, []);

  const act = async (fn: () => Promise<any>, okMsg?: string) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg, 'success'); await load(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const sendRequest = () => {
    if (!addName.trim()) return;
    act(async () => { await api.post('/social/friend/request', { name: addName.trim() }); setAddName(''); }, t('social.requestSent', { defaultValue: 'Request sent' }));
  };

  const Row = ({ c, actions }: { c: CharCard; actions: React.ReactNode }) => (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar avatar={c.avatar} frame={c.frame_slug} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/app/player/${encodeURIComponent(c.name)}`} style={{ color: 'var(--text-1)', textDecoration: 'none', fontWeight: 600 }}>{c.name}</Link>
        <div className="muted" style={{ fontSize: 12 }}>{t('common.lv', { defaultValue: 'Lv' })} {c.level} · {t(`common.class.${c.class}`, { defaultValue: c.class })}</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>{actions}</div>
    </div>
  );

  if (!data) return <div className="panel"><p className="muted">{t('common.loading', { defaultValue: 'Loading…' })}</p></div>;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header"><h2 className="panel-title">{t('social.title', { defaultValue: 'Friends' })}</h2></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1, padding: '8px 10px', background: 'var(--surface-2, #14171f)', border: '1px solid var(--border, #2a2f3a)', borderRadius: 6, color: 'var(--text-1)' }}
            placeholder={t('social.addPlaceholder', { defaultValue: 'Player name…' })}
            value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendRequest()}
          />
          <button className="btn btn-primary" disabled={busy || !addName.trim()} onClick={sendRequest}>{t('social.addFriend', { defaultValue: 'Add friend' })}</button>
        </div>
      </div>

      {data.incoming.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2 className="panel-title">{t('social.incoming', { defaultValue: 'Friend requests' })} ({data.incoming.length})</h2></div>
          <div className="col" style={{ gap: 8 }}>
            {data.incoming.map((c) => <Row key={c.id} c={c} actions={<>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => api.post('/social/friend/accept', { charId: c.id }), t('social.accepted', { defaultValue: 'Accepted' }))}>{t('social.accept', { defaultValue: 'Accept' })}</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => act(() => api.post('/social/friend/decline', { charId: c.id }))}>{t('social.decline', { defaultValue: 'Decline' })}</button>
            </>} />)}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header"><h2 className="panel-title">{t('social.friends', { defaultValue: 'Friends' })} ({data.friends.length})</h2></div>
        {data.friends.length === 0 ? <p className="muted">{t('social.noFriends', { defaultValue: 'No friends yet — add someone above.' })}</p> : (
          <div className="col" style={{ gap: 8 }}>
            {data.friends.map((c) => <Row key={c.id} c={c} actions={
              <button className="btn btn-sm" disabled={busy} onClick={() => act(() => api.post('/social/friend/remove', { charId: c.id }))}>{t('social.remove', { defaultValue: 'Remove' })}</button>
            } />)}
          </div>
        )}
      </div>

      {data.outgoing.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2 className="panel-title">{t('social.outgoing', { defaultValue: 'Sent requests' })} ({data.outgoing.length})</h2></div>
          <div className="col" style={{ gap: 8 }}>
            {data.outgoing.map((c) => <Row key={c.id} c={c} actions={
              <button className="btn btn-sm" disabled={busy} onClick={() => act(() => api.post('/social/friend/decline', { charId: c.id }))}>{t('social.cancel', { defaultValue: 'Cancel' })}</button>
            } />)}
          </div>
        </div>
      )}

      {data.blocked.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2 className="panel-title">{t('social.blocked', { defaultValue: 'Blocked' })} ({data.blocked.length})</h2></div>
          <div className="col" style={{ gap: 8 }}>
            {data.blocked.map((c) => <Row key={c.id} c={c} actions={
              <button className="btn btn-sm" disabled={busy} onClick={() => act(() => api.post('/social/unblock', { charId: c.id }))}>{t('social.unblock', { defaultValue: 'Unblock' })}</button>
            } />)}
          </div>
        </div>
      )}
    </div>
  );
}
