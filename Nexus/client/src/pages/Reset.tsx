import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

/**
 * Смяна на парола по токен от имейл линка (/reset?token=…). POST /auth/reset.
 * След успех сесиите се обезсилват (token_version bump на сървъра) → прати към
 * login.
 */
export default function Reset(): React.ReactElement {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (pw !== pw2) { setErr(t('reset.mismatch', { defaultValue: 'Passwords do not match.' })); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset', { token, newPassword: pw });
      setOk(true);
      setTimeout(() => nav('/login'), 1500);
    } catch (e: any) {
      setErr(e.message || t('reset.failed', { defaultValue: 'Reset failed. The link may have expired.' }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <svg viewBox="0 0 32 32"><path d="M16 4 L20 12 L28 13 L22 19 L24 28 L16 23 L8 28 L10 19 L4 13 L12 12 Z" fill="#d6a13d" stroke="#3a2812" strokeWidth=".5"/></svg>
          </div>
          <div>
            <h1>{t('reset.title', { defaultValue: 'Choose a new password' })}</h1>
            <p>{t('reset.tagline', { defaultValue: 'Enter a new password for your account.' })}</p>
          </div>
        </div>
        {!token ? (
          <div className="auth-form">
            <div className="error">{t('reset.noToken', { defaultValue: 'Missing or invalid reset link.' })}</div>
            <div className="auth-footer"><Link to="/forgot">{t('reset.requestNew', { defaultValue: 'Request a new link' })}</Link></div>
          </div>
        ) : ok ? (
          <div className="auth-form">
            <p style={{ lineHeight: 1.6 }}>{t('reset.done', { defaultValue: 'Password updated. Redirecting to sign in…' })}</p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="field">
              <label>{t('reset.newPassword', { defaultValue: 'New password' })}</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required minLength={8} />
            </div>
            <div className="field">
              <label>{t('reset.confirm', { defaultValue: 'Confirm password' })}</label>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
              {err && <div className="error">{err}</div>}
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || pw.length < 8}>
              {loading ? '…' : t('reset.submit', { defaultValue: 'Update password' })}
            </button>
            <div className="auth-footer"><Link to="/login">{t('forgot.backToLogin', { defaultValue: 'Back to sign in' })}</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
