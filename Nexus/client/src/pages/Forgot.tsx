import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

/**
 * „Забравена парола" — POST /auth/forgot. Сървърът винаги връща ok (без
 * account-enumeration), а линкът за смяна пристига по имейл. В dev без
 * конфигуриран SMTP отговорът носи devToken за локално тестване.
 */
export default function Forgot(): React.ReactElement {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post<{ ok: boolean; devToken?: string }>('/auth/forgot', { identifier });
      setSent(true);
      if (r.devToken) setDevToken(r.devToken);
    } catch {
      // Дори при грешка не издаваме нищо — показваме същото „изпратено".
      setSent(true);
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
            <h1>{t('forgot.title', { defaultValue: 'Reset password' })}</h1>
            <p>{t('forgot.tagline', { defaultValue: 'We’ll email you a reset link.' })}</p>
          </div>
        </div>
        {sent ? (
          <div className="auth-form">
            <p style={{ lineHeight: 1.6 }}>
              {t('forgot.sent', { defaultValue: 'If an account matches, a reset link is on its way. Check your inbox (and spam).' })}
            </p>
            {devToken && (
              <div className="field">
                <label>dev token (SMTP off)</label>
                <Link to={`/reset?token=${encodeURIComponent(devToken)}`} style={{ wordBreak: 'break-all' }}>{devToken}</Link>
              </div>
            )}
            <div className="auth-footer"><Link to="/login">{t('forgot.backToLogin', { defaultValue: 'Back to sign in' })}</Link></div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="field">
              <label>{t('login.usernameOrEmail')}</label>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !identifier.trim()}>
              {loading ? '…' : t('forgot.send', { defaultValue: 'Send reset link' })}
            </button>
            <div className="auth-footer"><Link to="/login">{t('forgot.backToLogin', { defaultValue: 'Back to sign in' })}</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
