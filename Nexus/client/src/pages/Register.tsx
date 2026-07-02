import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { minAgeForCountry } from '../lib/legal';

// Имената на държавите се превеждат при рендер (countries.<код>).
const EU_COUNTRY_CODES: string[] = [
  'BG', 'IT', 'AT', 'BE', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'GB', 'XX',
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
  const { t } = useTranslation();
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
  // Показваме преведено име на държавата в подсказките.
  const countryLabel = country === 'XX' ? t('register.yourRegion') : t(`countries.${country}`);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr('');
    if (!agreeTerms) {
      setErr(t('auth.submitErrorTerms'));
      return;
    }
    if (age === null) {
      setErr(t('auth.submitErrorDob'));
      return;
    }
    if (tooYoung) {
      setErr(t('auth.tooYoung', { minAge, country: countryLabel }));
      return;
    }
    try {
      await register(u, e, p, dob, country);
      toast(t('register.successToast'), 'success');
      navigate('/create');
    } catch (ex: any) {
      setErr(ex.message || t('register.failed'));
    }
  }

  // auth.acceptTerms съдържа {{terms}} и {{privacy}} (линкове) — режем низа
  // около сентинели, за да вградим <Link> в превода независимо от словореда.
  const acceptParts = t('auth.acceptTerms', { terms: '\u0001', privacy: '\u0002' })
    .split(/([\u0001\u0002])/);
  // auth.signInPrompt съдържа {{signin}} — същият подход.
  const [signInBefore, signInAfter] = t('auth.signInPrompt', { signin: '\u0001' }).split('\u0001');

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <svg viewBox="0 0 32 32"><path d="M16 4 L20 12 L28 13 L22 19 L24 28 L16 23 L8 28 L10 19 L4 13 L12 12 Z" fill="#d6a13d" stroke="#3a2812" strokeWidth=".5"/></svg>
          </div>
          <div>
            <h1>Nexus Dominion</h1>
            <p>{t('register.tagline')}</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="reg-u">{t('auth.username')}</label>
            <input id="reg-u" value={u} onChange={(ev) => setU(ev.target.value)} required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="reg-e">{t('auth.email')}</label>
            <input id="reg-e" type="email" value={e} onChange={(ev) => setE(ev.target.value)} required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="reg-p">{t('auth.password')}</label>
            <input id="reg-p" type="password" value={p} onChange={(ev) => setP(ev.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div className="field">
            <label htmlFor="reg-country">{t('auth.country')}</label>
            <select id="reg-country" value={country} onChange={(ev) => setCountry(ev.target.value)}>
              {EU_COUNTRY_CODES.map((code) => (<option key={code} value={code}>{t(`countries.${code}`)}</option>))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-dob">{t('auth.dob')}</label>
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
              {t('auth.minAgeHint', { country: countryLabel, minAge })}
            </small>
            {tooYoung && (
              <div className="error" role="alert">
                {t('auth.tooYoung', { minAge, country: countryLabel })}
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
              {acceptParts.map((part, i) =>
                part === '\u0001' ? (
                  <Link key={i} to="/terms" target="_blank" rel="noopener noreferrer">{t('auth.termsLink')}</Link>
                ) : part === '\u0002' ? (
                  <Link key={i} to="/privacy" target="_blank" rel="noopener noreferrer">{t('auth.privacyLink')}</Link>
                ) : (
                  <React.Fragment key={i}>{part}</React.Fragment>
                ),
              )}
            </label>
          </div>
          {err && <div className="error" role="alert">{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading || tooYoung || !agreeTerms}>
            {loading ? t('auth.creatingButton') : t('auth.createButton')}
          </button>
        </form>
        <div className="auth-footer">
          {signInBefore}<Link to="/login">{t('auth.signIn')}</Link>{signInAfter}
        </div>
      </div>
    </div>
  );
}
