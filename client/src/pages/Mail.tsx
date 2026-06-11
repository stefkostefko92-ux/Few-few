import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { MailEntry } from '../lib/types';

export default function Mail(): React.ReactElement {
  const refreshMail = useStore((s) => s.refreshMail);
  const [mails, setMails] = useState<MailEntry[]>([]);
  const [selected, setSelected] = useState<MailEntry | null>(null);

  async function load() {
    const r = await api.get('/mail');
    setMails(r.mails);
    await refreshMail();
  }
  useEffect(() => { load(); }, []);

  async function open(m: MailEntry) {
    setSelected(m);
    if (!m.read_at) {
      await api.post(`/mail/${m.id}/read`);
      await load();
    }
  }
  async function remove(m: MailEntry) {
    await api.delete(`/mail/${m.id}`);
    setSelected(null);
    await load();
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Mail</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, minHeight: 400 }}>
        <div className="col" style={{ gap: 6 }}>
          {mails.map((m) => (
            <div
              key={m.id}
              className="card"
              style={{
                padding: 10,
                cursor: 'pointer',
                borderColor: selected?.id === m.id ? 'var(--gold-2)' : undefined,
                background: m.read_at ? undefined : 'rgba(214,161,61,.06)',
              }}
              onClick={() => open(m)}
            >
              <div className="flex between">
                <strong>{m.subject}</strong>
                {!m.read_at && <span className="tag gold">New</span>}
              </div>
              <div className="muted text-sm">{m.from_name}</div>
            </div>
          ))}
          {mails.length === 0 && <div className="muted">No mail.</div>}
        </div>
        <div className="card" style={{ minHeight: 400 }}>
          {selected ? (
            <div>
              <div className="flex between">
                <h3 style={{ color: 'var(--gold-1)' }}>{selected.subject}</h3>
                <button className="btn btn-sm btn-danger" onClick={() => remove(selected)}>Delete</button>
              </div>
              <div className="muted text-sm">From {selected.from_name} · {new Date(selected.created_at).toLocaleString()}</div>
              <div className="panel-divider" />
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selected.body}</p>
            </div>
          ) : (
            <div className="muted" style={{ textAlign: 'center', paddingTop: 80 }}>Select a letter to read.</div>
          )}
        </div>
      </div>
    </div>
  );
}
