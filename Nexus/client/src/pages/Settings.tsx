import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

export default function Settings(): React.ReactElement {
  const { t } = useTranslation();
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
      toast(t('settings.pwMismatch'), 'error');
      return;
    }
    if (next.length < 6) {
      toast(t('settings.pwTooShort'), 'error');
      return;
    }
    setPwBusy(true);
    try {
      await api.post('/account/password', { current, next });
      toast(t('settings.pwUpdated'), 'success');
      setCurrent(''); setNext(''); setConfirmPw('');
    } catch (ex: any) {
      toast(ex.message, 'error');
    } finally {
      setPwBusy(false);
    }
  }

  async function deleteCharacter() {
    if (deleteText !== 'DELETE') {
      toast(t('settings.typeDelete'), 'error');
      return;
    }
    setDeleteBusy(true);
    try {
      await api.post('/account/delete-character', { confirm: 'DELETE' });
      toast(t('settings.charDeleted'), 'info');
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
          <h2 className="panel-title">{t('settings.account')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('settings.username')}</div>
            <div style={{ fontSize: 18, color: 'var(--gold-1)' }}>{acct?.username || user?.username || '—'}</div>
          </div>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('settings.email')}</div>
            <div style={{ fontSize: 16 }}>{acct?.email || user?.email || '—'}</div>
          </div>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('settings.joined')}</div>
            <div>{acct ? new Date(acct.created_at).toLocaleDateString() : '—'}</div>
          </div>
          <div className="card">
            <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('settings.currentHero')}</div>
            <div>{char?.name || '—'} {char ? `· ${t('common.lv')} ${char.level}` : ''}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('settings.changePassword')}</h2>
        </div>
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <div className="field">
            <label>{t('settings.currentPw')}</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label>{t('settings.newPw')}</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
          </div>
          <div className="field">
            <label>{t('settings.confirmPw')}</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pwBusy}>
            {pwBusy ? t('settings.updating') : t('settings.updatePw')}
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('settings.session')}</h2>
        </div>
        <p className="muted">{t('settings.signOutDesc')}</p>
        <button className="btn" onClick={doLogout}>{t('settings.signOut')}</button>
      </div>

      <div className="panel" style={{ borderColor: 'rgba(184,30,30,.5)' }}>
        <div className="panel-header">
          <h2 className="panel-title" style={{ color: 'var(--crimson-1)' }}>{t('settings.dangerZone')}</h2>
        </div>
        <p className="muted">
          {t('settings.deleteWarning')} <strong>{t('settings.cannotBeUndone')}</strong>
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder={t('settings.typeDelete')}
            style={{ maxWidth: 240 }}
          />
          <button className="btn btn-danger" onClick={deleteCharacter} disabled={deleteText !== 'DELETE' || deleteBusy}>
            {deleteBusy ? t('settings.deleting') : t('settings.deleteChar')}
          </button>
        </div>
      </div>
    </div>
  );
}
