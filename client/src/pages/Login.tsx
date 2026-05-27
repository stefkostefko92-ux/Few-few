import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';

export default function Login(): React.ReactElement {
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
      toast('Welcome back, traveler.', 'success');
      navigate('/app');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
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
            <h1>Tanoth-Reborn</h1>
            <p>Enter the realm. Forge your legend.</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label>Username or Email</label>
            <input value={u} onChange={(e) => setU(e.target.value)} autoFocus required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={p} onChange={(e) => setP(e.target.value)} required minLength={6} />
            {err && <div className="error">{err}</div>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Enter Tanoth'}
          </button>
        </form>
        <div className="auth-footer">
          New to the realm? <Link to="/register">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
