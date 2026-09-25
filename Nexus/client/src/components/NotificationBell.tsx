import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { onStream } from '../lib/stream';
import { useStore } from '../lib/store';

interface Notif { id: number; kind: string; message: string; ref: string; read_at: number; created_at: number; }

/**
 * Камбанка за нотификации — polling на /notifications (10s), badge за
 * непрочетени, dropdown feed. Deep-link по `ref` (char:/trade:).
 */
export default function NotificationBell(): React.ReactElement | null {
  const { t } = useTranslation();
  const nav = useNavigate();
  const character = useStore((s) => s.character);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    api.get<{ items: Notif[]; unread: number }>('/notifications')
      .then((r) => { setItems(r.items); setUnread(r.unread); })
      .catch(() => {});
  };
  useEffect(() => {
    if (!character) return;
    load();
    // SSE: презареди камбанката веднага при push. Polling-ът остава
    // fallback (за случаите, в които връзката е паднала).
    const off = onStream('notification', load);
    const id = setInterval(load, 10000);
    return () => { off(); clearInterval(id); };
  }, [character?.id]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!character) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) { api.post('/notifications/read', {}).then(() => setUnread(0)).catch(() => {}); }
  };
  const go = (n: Notif) => {
    setOpen(false);
    const m = n.ref.match(/^char:(.+)$/);
    if (m) { nav(`/app/player/${encodeURIComponent(m[1])}`); return; }
    if (n.ref.startsWith('dm:')) { nav(`/app/chat?dm=${encodeURIComponent(n.ref.slice(3))}`); return; }
    if (n.ref.startsWith('trade:')) nav('/app/social');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={toggle}
        aria-label={t('notif.title', { defaultValue: 'Notifications' })}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-2, #b8bcc8)', padding: 4 }}
      >
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--crimson-1, #e85a4f)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 300, maxHeight: 380, overflowY: 'auto', background: 'var(--surface-1, #0f1218)', border: '1px solid var(--border, #2a2f3a)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 1000 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #2a2f3a)', fontWeight: 600 }}>
            {t('notif.title', { defaultValue: 'Notifications' })}
          </div>
          {items.length === 0
            ? <div className="muted" style={{ padding: 16, textAlign: 'center' }}>{t('notif.empty', { defaultValue: 'Nothing new.' })}</div>
            : items.map((n) => (
              <div
                key={n.id}
                onClick={() => go(n)}
                style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #2a2f3a)', cursor: n.ref ? 'pointer' : 'default', background: n.read_at ? 'transparent' : 'rgba(214,161,61,.06)' }}
              >
                <div style={{ fontSize: 13 }}>{n.message}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
