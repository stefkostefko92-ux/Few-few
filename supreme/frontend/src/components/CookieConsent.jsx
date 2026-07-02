// frontend/src/components/CookieConsent.jsx
// GDPR/ePrivacy-compliant cookie consent banner.
// Stores consent in localStorage with versioning — if privacy policy
// changes and bumps the version, banner reappears.

import { useState, useEffect } from "react";
import { Cookie, X, Check } from "lucide-react";

const CONSENT_KEY = "supreme-bot-cookie-consent";
const CURRENT_VERSION = 1; // Bump this when privacy policy materially changes

export default function CookieConsent() {
  const [show, setShow] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState({
    essential: true,   // Always required — session cookies
    analytics: false,  // Future: if we add analytics
    marketing: false,  // Future: if we add marketing
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) {
        setShow(true);
        return;
      }
      const parsed = JSON.parse(stored);
      if (parsed.version !== CURRENT_VERSION) {
        setShow(true);
      }
    } catch {
      setShow(true);
    }
  }, []);

  const save = (consent) => {
    const payload = {
      version: CURRENT_VERSION,
      timestamp: new Date().toISOString(),
      ...consent,
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
    } catch { /* storage may be disabled */ }
    setShow(false);
  };

  const acceptAll = () => save({ essential: true, analytics: true, marketing: true });
  const rejectNonEssential = () => save({ essential: true, analytics: false, marketing: false });
  const saveCustom = () => save(prefs);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-describedby="cookie-consent-description"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-[100] cs-card !p-5 border-cs-cyan/40 shadow-2xl shadow-cs-cyan/20 bg-cs-bg/95 backdrop-blur-md"
    >
      <div className="flex items-start gap-3 mb-3">
        <Cookie className="w-5 h-5 text-cs-cyan flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-display font-bold text-sm text-white mb-1">We use cookies</h3>
          <p id="cookie-consent-description" className="text-xs text-cs-muted leading-relaxed">
            We use essential cookies for authentication and session management.
            No tracking, no ads.{" "}
            <a href="/cookies" className="text-cs-cyan underline">
              Read our Cookie Policy
            </a>
          </p>
        </div>
      </div>

      {showPrefs && (
        <div className="mb-4 space-y-2 border-t border-cs-border pt-3">
          <PrefRow
            label="Essential cookies"
            description="Required for login, sessions, CSRF protection"
            checked={true}
            disabled
          />
          <PrefRow
            label="Analytics cookies"
            description="Help us understand usage patterns (not currently used)"
            checked={prefs.analytics}
            onChange={(v) => setPrefs({ ...prefs, analytics: v })}
          />
          <PrefRow
            label="Marketing cookies"
            description="Personalized content (not currently used)"
            checked={prefs.marketing}
            onChange={(v) => setPrefs({ ...prefs, marketing: v })}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={acceptAll}
          className="cs-btn-primary text-xs flex-1 min-w-[100px]"
        >
          <Check className="w-3.5 h-3.5" /> Accept all
        </button>
        <button
          onClick={rejectNonEssential}
          className="cs-btn-primary text-xs flex-1 min-w-[100px]"
        >
          Reject non-essential
        </button>
        {showPrefs ? (
          <button
            onClick={saveCustom}
            className="cs-btn-ghost text-xs w-full"
          >
            Save preferences
          </button>
        ) : (
          <button
            onClick={() => setShowPrefs(true)}
            className="cs-btn-ghost text-xs w-full"
          >
            Customize
          </button>
        )}
      </div>
    </div>
  );
}

function PrefRow({ label, description, checked, onChange, disabled }) {
  return (
    <label className={`flex items-start gap-3 cursor-${disabled ? "not-allowed" : "pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 accent-cs-cyan"
      />
      <div className="flex-1">
        <div className="text-xs font-semibold text-white">{label}{disabled && <span className="text-cs-dim ml-2">(required)</span>}</div>
        <div className="text-[10px] text-cs-dim">{description}</div>
      </div>
    </label>
  );
}

/**
 * Utility to check consent status programmatically (for future analytics integration)
 */
export function hasConsent(category) {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    if (parsed.version !== CURRENT_VERSION) return false;
    return !!parsed[category];
  } catch {
    return false;
  }
}
