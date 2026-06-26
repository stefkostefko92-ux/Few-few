import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { minAgeForCountry } from '../lib/legal';

const EU_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'BG', name: 'Bulgaria' },
  { code: 'IT', name: 'Italy' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'XX', name: 'Other / Non-EU' },
];

function computeAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export default function Register(): React.ReactElement {
  const register = useStore((s) => s.register);
  const loading = useStore((s) => s.loading);
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const [u, setU] = useState('');
  const [e, setE] = useState('');
  const [p, setP] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('BG');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [err, setErr] = useState('');

  const minAge = useMemo(() => minAgeForCountry(country), [country]);
  const age = computeAge(dob);
  const tooYoung = age !== null && age < minAge;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr('');
    if (!agreeTerms) {
      setErr('You must accept the Terms of Service and Privacy Policy.');
      return;
    }
    if (age === null) {
      setErr('Please enter your date of birth.');
      return;
    }
    if (tooYoung) {
      setErr(`Registration requires age ${minAge}+ in ${country === 'XX' ? 'your region' : country}.`);
      return;
    }
    try {
      await register(u, e, p, dob, country);
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
            <h1>Nexus Dominion</h1>
            <p>Begin your saga.</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="reg-u">Username</label>
            <input id="reg-u" value={u} onChange={(ev) => setU(ev.target.value)} required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="reg-e">Email</label>
            <input id="reg-e" type="email" value={e} onChange={(ev) => setE(ev.target.value)} required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="reg-p">Password</label>
            <input id="reg-p" type="password" value={p} onChange={(ev) => setP(ev.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div className="field">
            <label htmlFor="reg-country">Country of residence</label>
            <select id="reg-country" value={country} onChange={(ev) => setCountry(ev.target.value)}>
              {EU_COUNTRIES.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-dob">Date of birth (used for age verification only — never displayed)</label>
            <input
              id="reg-dob"
              type="date"
              value={dob}
              onChange={(ev) => setDob(ev.target.value)}
              required
              max={new Date().toISOString().slice(0, 10)}
              aria-describedby="reg-dob-help"
            />
            <small id="reg-dob-help" className="muted">
              Minimum age in {country === 'XX' ? 'your region' : country}: {minAge}.
            </small>
            {tooYoung && (
              <div className="error" role="alert">
                Registration requires age {minAge}+ in {country}. We cannot create your account.
              </div>
            )}
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <input
              id="reg-terms"
              type="checkbox"
              checked={agreeTerms}
              onChange={(ev) => setAgreeTerms(ev.target.checked)}
              required
              style={{ marginTop: 4 }}
            />
            <label htmlFor="reg-terms" style={{ fontSize: '0.9em', lineHeight: 1.4 }}>
              I have read and accept the <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link> and the <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
            </label>
          </div>
          {err && <div className="error" role="alert">{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading || tooYoung || !agreeTerms}>
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
