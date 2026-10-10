import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';
import { useStore } from '../lib/store';

export default function Login(): React.ReactElement {
  const { t } = useTranslation();
  const login = useStore((s) => s.login);
  const loading = useStore((s) => s.loading);
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await login(u, p);
      toast(t('login.welcomeToast'), 'success');
      navigate('/app');
    } catch (e: any) {
      setErr(e.message || t('login.failed'));
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <Logo size={46} />
          </div>
          <div>
            <h1>Nexus Dominion</h1>
            <p>{t('login.tagline')}</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="login-u">{t('login.usernameOrEmail')}</label>
            <input id="login-u" value={u} onChange={(e) => setU(e.target.value)} autoFocus required />
          </div>
          <div className="field">
            <label htmlFor="login-p">{t('auth.password')}</label>
            <input id="login-p" type="password" value={p} onChange={(e) => setP(e.target.value)} required minLength={6} />
            {err && <div className="error" role="alert">{err}</div>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? t('login.signingIn') : t('login.enterButton')}
          </button>
        </form>
        <div className="auth-footer" style={{ marginBottom: 6 }}>
          <Link to="/forgot">{t('login.forgotPassword', { defaultValue: 'Forgot your password?' })}</Link>
        </div>
        <div className="auth-footer">
          {t('login.newPrompt')} <Link to="/register">{t('login.createAccount')}</Link>
        </div>
      </div>
    </div>
  );
}
