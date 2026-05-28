import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

export default function Settings(): React.ReactElement {
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  const logout = useStore((s) => s.logout);
  const refresh = useStore((s) => s.refreshCharacter);
  const char = useStore((s) => s.character);
  const user = useStore((s) => s.user);
  const [acct, setAcct] = useState<{ username: string; email: string; created_at: number } | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [deleteText, setDeleteText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    api.get('/account/me').then((r) => setAcct(r.user)).catch(() => {});
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirmPw) {
      toast('Passwords do not match.', 'error');
      return;
    }
    if (next.length < 6) {
      toast('Use at least 6 characters.', 'error');
      return;
    }
    setPwBusy(true);
    try {
      await api.post('/account/password', { current, next });
      toast('Password updated.', 'success');
      setCurrent(''); setNext(''); setConfirmPw('');
    } catch (ex: any) {
      toast(ex.message, 'error');
    } finally {
      setPwBusy(false);
    }
  }

  async function deleteCharacter() {
    if (deleteText !== 'DELETE') {
      toast('Type DELETE to confirm.', 'error');
      return;
    }
    setDeleteBusy(true);
    try {
      await api.post('/account/delete-character', { confirm: 'DELETE' });
      toast('Character deleted. Begin again.', 'info');
      await refresh();
      navigate('/create');
    } catch (ex: any) {
      toast(ex.message, 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  function doLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Account</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Username</div>
            <div style={{ fontSize: 18, color: 'var(--gold-1)' }}>{acct?.username || user?.username || '—'}</div>
          </div>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Email</div>
            <div style={{ fontSize: 16 }}>{acct?.email || user?.email || '—'}</div>
          </div>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Joined</div>
            <div>{acct ? new Date(acct.created_at).toLocaleDateString() : '—'}</div>
          </div>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Current Hero</div>
            <div>{char?.name || '—'} {char ? `· Lv ${char.level}` : ''}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Change Password</h2>
        </div>
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <div className="field">
            <label>Current password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pwBusy}>
            {pwBusy ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Session</h2>
        </div>
        <p className="muted">Sign out of this device.</p>
        <button className="btn" onClick={doLogout}>Sign Out</button>
      </div>

      <div className="panel" style={{ borderColor: 'rgba(184,30,30,.5)' }}>
        <div className="panel-header">
          <h2 className="panel-title" style={{ color: 'var(--crimson-1)' }}>Danger Zone</h2>
        </div>
        <p className="muted">
          Deleting your character permanently wipes their progress, items, gold, and history. You will be returned to the
          class-selection screen. <strong>This cannot be undone.</strong>
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder="Type DELETE to confirm"
            style={{ maxWidth: 240 }}
          />
          <button className="btn btn-danger" onClick={deleteCharacter} disabled={deleteText !== 'DELETE' || deleteBusy}>
            {deleteBusy ? 'Deleting…' : 'Delete Character'}
          </button>
        </div>
      </div>
    </div>
  );
}
