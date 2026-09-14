import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { onStream } from '../lib/stream';
import { useStore } from '../lib/store';
import ReportModal, { type ReportTarget } from '../components/ReportModal';
import '../styles/guild.css';

const REGION_CHANNELS = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];
const REGION_LABEL: Record<string, string> = {
  whispering_woods: 'Whispering Woods', mistmoor_hills: 'Mistmoor Hills', crystal_caverns: 'Crystal Caverns',
  ashen_wastes: 'Ashen Wastes', shadowfell: 'Shadowfell',
};

interface PublicMsg { id: number; message: string; created_at: number; character_id: number; name: string; class: string; level: number; }
interface DmMsg { id: number; from_id: number; to_id: number; message: string; created_at: number; }
interface Thread { id: number; name: string; class: string; level: number; unread: number; last: { message: string; created_at: number } | null; }

type Selection = { kind: 'channel'; channel: string } | { kind: 'dm'; charId: number; name: string };

/**
 * Чат: глобален/регионален публичен канал + лични съобщения (DM) с приятели.
 * Върху SSE (chat_global / dm) с polling fallback. Модерацията е сървърна.
 */
export default function Chat(): React.ReactElement {
  const { t } = useTranslation();
  const character = useStore((s) => s.character);
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const dmParam = params.get('dm');
  const [sel, setSel] = useState<Selection>({ kind: 'channel', channel: 'global' });
  const [messages, setMessages] = useState<Array<PublicMsg | DmMsg>>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [report, setReport] = useState<ReportTarget | null>(null);
  const lastId = useRef(0);
  const streamRef = useRef<HTMLDivElement>(null);

  const myId = character?.id;

  const loadThreads = useCallback(() => {
    api.get<{ threads: Thread[] }>('/chat/dm').then((r) => setThreads(r.threads)).catch(() => {});
  }, []);

  // Отвори DM директно от deep-link (?dm=<charId>) веднъж щом знаем нишките.
  useEffect(() => {
    if (dmParam) {
      const id = Number(dmParam);
      const th = threads.find((x) => x.id === id);
      if (th) { setSel({ kind: 'dm', charId: id, name: th.name }); setParams({}, { replace: true }); }
    }
  }, [dmParam, threads, setParams]);

  const load = useCallback((reset = false) => {
    if (reset) lastId.current = 0;
    if (sel.kind === 'channel') {
      api.get<{ messages: PublicMsg[] }>(`/chat/global?channel=${sel.channel}&after=${reset ? 0 : lastId.current}`)
        .then((r) => {
          if (!r.messages.length) return;
          setMessages((prev) => (reset ? r.messages : [...prev, ...r.messages]));
          lastId.current = r.messages[r.messages.length - 1].id;
        }).catch(() => {});
    } else {
      api.get<{ messages: DmMsg[] }>(`/chat/dm/${sel.charId}?after=${reset ? 0 : lastId.current}`)
        .then((r) => {
          if (!r.messages.length) return;
          setMessages((prev) => (reset ? r.messages : [...prev, ...r.messages]));
          lastId.current = r.messages[r.messages.length - 1].id;
          loadThreads(); // прочетеното нулира брояча
        }).catch(() => {});
    }
  }, [sel, loadThreads]);

  // Смяна на селекцията → чист презареждане.
  useEffect(() => { setMessages([]); load(true); /* eslint-disable-next-line */ }, [sel]);

  // Начално зареждане на нишките + polling.
  useEffect(() => {
    if (!character) return;
    loadThreads();
    const id = setInterval(() => { load(false); loadThreads(); }, 4000);
    return () => clearInterval(id);
  }, [character?.id, load, loadThreads]);

  // SSE: моментален pull при push за текущия изглед.
  useEffect(() => {
    const offG = onStream('chat_global', (d: any) => {
      if (sel.kind === 'channel' && (!d?.channel || d.channel === sel.channel)) load(false);
    });
    const offD = onStream('dm', () => { if (sel.kind === 'dm') load(false); loadThreads(); });
    return () => { offG(); offD(); };
  }, [sel, load, loadThreads]);

  useEffect(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setErr('');
    try {
      if (sel.kind === 'channel') await api.post('/chat/global', { channel: sel.channel, message: body });
      else await api.post(`/chat/dm/${sel.charId}`, { message: body });
      setText('');
      load(false);
    } catch (e: any) {
      setErr(e.message || 'Failed to send.');
    }
  }

  if (!character) return <div className="muted" style={{ padding: 24 }}>{t('chat.needChar', { defaultValue: 'Create a character to chat.' })}</div>;

  const title = sel.kind === 'channel'
    ? (sel.channel === 'global' ? t('chat.global', { defaultValue: 'Global' }) : REGION_LABEL[sel.channel] || sel.channel)
    : sel.name;

  return (
    <div>
      <h1 className="page-title">{t('chat.title', { defaultValue: 'Chat' })}</h1>
      <div className="chat-grid" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Канали + DM списък */}
        <div className="card" style={{ padding: 8 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: '6px 8px' }}>{t('chat.channels', { defaultValue: 'Channels' })}</div>
          {['global', ...REGION_CHANNELS].map((ch) => (
            <button
              key={ch}
              className="chat-nav-item"
              onClick={() => setSel({ kind: 'channel', channel: ch })}
              style={navStyle(sel.kind === 'channel' && sel.channel === ch)}
            >
              # {ch === 'global' ? t('chat.global', { defaultValue: 'Global' }) : (REGION_LABEL[ch] || ch)}
            </button>
          ))}
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: '12px 8px 6px' }}>{t('chat.direct', { defaultValue: 'Messages' })}</div>
          {threads.length === 0 && <div className="muted" style={{ padding: '4px 8px', fontSize: 12 }}>{t('chat.noFriends', { defaultValue: 'Add friends to DM them.' })}</div>}
          {threads.map((th) => (
            <button
              key={th.id}
              className="chat-nav-item"
              onClick={() => setSel({ kind: 'dm', charId: th.id, name: th.name })}
              style={navStyle(sel.kind === 'dm' && sel.charId === th.id)}
            >
              <span>@ {th.name}</span>
              {th.unread > 0 && <span style={{ marginLeft: 6, background: 'var(--crimson-1,#e85a4f)', color: '#fff', borderRadius: 8, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>{th.unread}</span>}
            </button>
          ))}
        </div>

        {/* Прозорец */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 460 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border,#2a2f3a)', fontWeight: 600 }}>{title}</div>
          <div className="chat-stream" ref={streamRef} style={{ flex: 1, maxHeight: 440, overflowY: 'auto', padding: 12 }}>
            {messages.length === 0 && <div className="muted">{t('chat.empty', { defaultValue: 'No messages yet. Say hello!' })}</div>}
            {messages.map((m) => {
              const isPublic = 'name' in m;
              const mine = 'from_id' in m ? m.from_id === myId : m.character_id === myId;
              const who = isPublic ? (m as PublicMsg).name : (mine ? character.name : title);
              return (
                <div key={m.id} className={`chat-line ${mine ? 'me' : ''}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {!mine && isPublic && <span style={{ fontWeight: 600, color: 'var(--gold-1,#d6a13d)' }}>{who}</span>}
                  <span style={{ flex: 1 }}>{m.message}</span>
                  {/* DSA чл. 16: докладване на публично съобщение (⚑). DM са
                      частна кореспонденция → без report бутон. */}
                  {!mine && isPublic && (
                    <button
                      title={t('chat.report', { defaultValue: 'Report message' })}
                      aria-label={t('chat.report', { defaultValue: 'Report message' })}
                      onClick={() => setReport({ contentKind: 'chat', contentRef: `chat:${m.id}`, label: `Message from ${who}` })}
                      style={{ background: 'none', border: 'none', color: 'var(--text-3,#7a7f8c)', cursor: 'pointer', fontSize: 12, padding: 2 }}
                    >⚑</button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="chat-input" style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border,#2a2f3a)' }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={t('chat.placeholder', { defaultValue: 'Message…' })}
              maxLength={280}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" disabled={!text.trim()} onClick={send}>{t('chat.send', { defaultValue: 'Send' })}</button>
          </div>
          {err && <div className="error" style={{ padding: '0 10px 10px' }}>{err}</div>}
        </div>
      </div>
      {report && <ReportModal target={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function navStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
    padding: '7px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    background: active ? 'rgba(214,161,61,.12)' : 'transparent',
    color: active ? 'var(--gold-1,#d6a13d)' : 'var(--text-2,#b8bcc8)',
  };
}
