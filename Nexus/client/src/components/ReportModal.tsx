import React, { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

/**
 * Потребителски „Report" (DSA чл. 16 notice-and-action). Праща сигнал към
 * /api/dsa/notice за конкретно съдържание (чат, име, гилдия…). Съответства
 * на обещанието в Terms за in-game докладване. Приема се и анонимно, но
 * имейл се препоръчва (чл. 16(2)(d)) за потвърждение.
 */
export interface ReportTarget {
  contentKind: 'chat' | 'auction' | 'character_name' | 'guild_name' | 'mail' | 'other';
  contentRef: string; // напр. "chat:42" или "char:Foo"
  label?: string;     // човеко-четимо за заглавието на модала
}

const REASONS = [
  { v: 'illegal_hate', l: 'Hate speech / illegal' },
  { v: 'illegal_csam', l: 'Sexual content involving minors' },
  { v: 'impersonation', l: 'Impersonation' },
  { v: 'spam', l: 'Spam / scam' },
  { v: 'copyright', l: 'Copyright' },
  { v: 'other', l: 'Other' },
];

export default function ReportModal({ target, onClose }: { target: ReportTarget; onClose: () => void }): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState('illegal_hate');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [goodFaith, setGoodFaith] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (description.trim().length < 20) { toast('Please describe the issue (at least 20 characters).', 'error'); return; }
    if (!goodFaith) { toast('Please confirm your good-faith belief.', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/dsa/notice', {
        contentKind: target.contentKind,
        contentRef: target.contentRef,
        reason,
        description: description.trim(),
        notifierEmail: email || undefined,
        goodFaith: true,
      });
      toast('Report submitted. Thank you — our team will review it.', 'success');
      onClose();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: 'var(--surface-2, #14171f)', border: '1px solid var(--border, #2a2f3a)', borderRadius: 6, color: 'var(--text-1, #e8eaf0)', boxSizing: 'border-box' };

  return (
    <div role="dialog" aria-modal="true" aria-label="Report content" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)', background: 'var(--surface-1, #0f1218)', border: '1px solid var(--border, #2a2f3a)', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 4px' }}>Report content</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{target.label || target.contentRef}</p>
        <label style={{ display: 'block', fontSize: 13, margin: '10px 0 4px' }}>Reason</label>
        <select style={inp} value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
        <label style={{ display: 'block', fontSize: 13, margin: '10px 0 4px' }}>What’s wrong?</label>
        <textarea style={{ ...inp, minHeight: 88, resize: 'vertical' }} value={description} maxLength={5000}
          onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue (min 20 characters)…" />
        <label style={{ display: 'block', fontSize: 13, margin: '10px 0 4px' }}>Your email <span className="muted">(optional, for updates)</span></label>
        <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0', fontSize: 13 }}>
          <input type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I affirm, in good faith, that the information above is accurate and complete.</span>
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Submit report</button>
        </div>
      </div>
    </div>
  );
}
