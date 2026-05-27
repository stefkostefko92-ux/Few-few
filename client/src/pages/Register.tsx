import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';

export default function Register(): React.ReactElement {
  const register = useStore((s) => s.register);
  const loading = useStore((s) => s.loading);
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const [u, setU] = useState('');
  const [e, setE] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr('');
    try {
      await register(u, e, p);
      toast('Account created. Forge your hero!', 'success');
      navigate('/create');
    } catch (ex: any) {
      setErr(ex.message || 'Registration failed');
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
            <p>Begin your saga.</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label>Username</label>
            <input value={u} onChange={(ev) => setU(ev.target.value)} required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" autoFocus />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={e} onChange={(ev) => setE(ev.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={p} onChange={(ev) => setP(ev.target.value)} required minLength={6} />
            {err && <div className="error">{err}</div>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Forging…' : 'Create Account'}
          </button>
        </form>
        <div className="auth-footer">
          Already a hero? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
