import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * GDPR / ePrivacy compliant cookie banner.
 *
 * The previous version was a binary "Reject optional" / "OK, got it" pair
 * with visually unequal buttons — read as a dark pattern under EDPB
 * guidance (Shein €150M, CNIL Google €325M). This version:
 *
 *  - Four categories: necessary (always on), preferences, analytics, marketing.
 *  - Equal-weight Reject all / Accept all + a per-category Save my choice.
 *  - Withdrawal: the footer "Cookie settings" link re-opens the banner
 *    at any time so consent can be withdrawn as easily as it was given
 *    (ePrivacy Art. 7 + GDPR Art. 7(3)).
 *  - We persist the choice as JSON `{ necessary, preferences, analytics,
 *    marketing, ts, version }` so a version bump (new sub-processor) can
 *    force a fresh consent prompt.
 */

const CONSENT_KEY = 'nd_cookie_consent_v2';
const CONSENT_VERSION = 2;

export interface ConsentState {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  ts: number;
  version: number;
}

const ALL_ON: ConsentState = {
  necessary: true, preferences: true, analytics: true, marketing: true,
  ts: 0, version: CONSENT_VERSION,
};
const ALL_OFF: ConsentState = {
  necessary: true, preferences: false, analytics: false, marketing: false,
  ts: 0, version: CONSENT_VERSION,
};

function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch { return null; }
}

function writeConsent(c: ConsentState): void {
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...c, ts: Date.now(), version: CONSENT_VERSION })); } catch {}
  // Broadcast so analytics loaders (Sentry etc.) can react without a page reload.
  try { window.dispatchEvent(new CustomEvent('nd:consent-changed', { detail: c })); } catch {}
}

/** Programmatic re-open used by the footer "Cookie settings" link. */
export function openCookieBanner(): void {
  try { window.dispatchEvent(new CustomEvent('nd:open-cookie-banner')); } catch {}
}

export default function CookieBanner(): React.ReactElement | null {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [pref, setPref] = useState(false);
  const [ana, setAna] = useState(false);
  const [mkt, setMkt] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) setVisible(true);
    const open = () => {
      const e = readConsent();
      setPref(e?.preferences ?? false);
      setAna(e?.analytics ?? false);
      setMkt(e?.marketing ?? false);
      setShowDetails(true);
      setVisible(true);
    };
    window.addEventListener('nd:open-cookie-banner', open);
    return () => window.removeEventListener('nd:open-cookie-banner', open);
  }, []);

  function decide(state: ConsentState) {
    writeConsent(state);
    setVisible(false);
    setShowDetails(false);
  }

  if (!visible) return null;

  // cookies.intro съдържа {{policy}} (линк) — режем низа около сентинел,
  // за да вградим <Link> вътре в превода.
  const [introBefore, introAfter] = t('cookies.intro', { policy: '\u0001' }).split('\u0001');

  return (
    <div className="cookie-banner" role="dialog" aria-modal="false" aria-labelledby="cookie-banner-title">
      <div className="cookie-banner-text">
        <strong id="cookie-banner-title">{t('cookies.title')}</strong> {introBefore}
        <Link to="/privacy">{t('cookies.policyLink')}</Link>{introAfter}
      </div>

      {showDetails && (
        <div className="cookie-banner-categories" style={{ display: 'grid', gap: 8, margin: '10px 0' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked readOnly disabled aria-label={t('cookies.necessary')} />
            <span><strong>{t('cookies.necessary')}</strong> — {t('cookies.necessaryDesc')}</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={pref} onChange={(e) => setPref(e.target.checked)} aria-label={t('cookies.preferences')} />
            <span><strong>{t('cookies.preferences')}</strong> — {t('cookies.preferencesDesc')}</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={ana} onChange={(e) => setAna(e.target.checked)} aria-label={t('cookies.analytics')} />
            <span><strong>{t('cookies.analytics')}</strong> — {t('cookies.analyticsDesc')}</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={mkt} onChange={(e) => setMkt(e.target.checked)} aria-label={t('cookies.marketing')} />
            <span><strong>{t('cookies.marketing')}</strong> — {t('cookies.marketingDesc')}</span>
          </label>
        </div>
      )}

      <div className="cookie-banner-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {/* Equal-weight Reject / Accept (same className, no primary on one only) */}
        <button className="btn btn-sm" onClick={() => decide(ALL_OFF)} type="button">{t('cookies.rejectAll')}</button>
        {showDetails ? (
          <button
            className="btn btn-sm"
            onClick={() => decide({ ...ALL_OFF, preferences: pref, analytics: ana, marketing: mkt })}
            type="button"
          >{t('cookies.saveChoice')}</button>
        ) : (
          <button className="btn btn-sm" onClick={() => setShowDetails(true)} type="button">{t('cookies.customise')}</button>
        )}
        <button className="btn btn-sm" onClick={() => decide(ALL_ON)} type="button">{t('cookies.acceptAll')}</button>
      </div>
    </div>
  );
}
