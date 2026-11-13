// frontend/src/components/CookieConsent.jsx
// GDPR/ePrivacy-compliant cookie consent banner.
// Stores consent in localStorage with versioning — if privacy policy
// changes and bumps the version, banner reappears.

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Cookie, Check } from "lucide-react";
import { useT } from "../contexts/I18nContext";
import { COOKIE_CONSENT, cookieConsentLocale } from "../i18n/cookieConsent";

const CONSENT_KEY = "supreme-bot-cookie-consent";
const CURRENT_VERSION = 1; // Bump this when privacy policy materially changes

export default function CookieConsent() {
  // Банерът е в рутера, но извън <Routes> — useLocation следи и смяната на страницата.
  const { pathname } = useLocation();
  const { lang } = useT();
  const L = COOKIE_CONSENT[cookieConsentLocale(pathname, lang)];
  const [show, setShow] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState({
    essential: true,   // Always required — session cookies
    analytics: false,  // Future: if we add analytics
    marketing: false,  // Future: if we add marketing
  });

  // Повторно отваряне по желание на потребителя.
  //
  // ДЕФЕКТЪТ (Правният Разбирач, одит 07.08.2026): банерът се показваше САМО при
  // липсващ или остарял запис. Веднъж решил, човекът нямаше как да си промени
  // решението — а чл. 7(3) ОРЗД иска оттеглянето на съгласието да е толкова
  // лесно, колкото даването му. Практическата експозиция беше ниска (реално
  // нямаме неесенциални бисквитки), но правото не пита за това.
  //
  // Глобално събитие, не контекст: банерът живее над рутера, а връзката за
  // отваряне е във футъра и в Политиката — по-евтино е от общо състояние.
  useEffect(() => {
    const reopen = () => { setShowPrefs(true); setShow(true); };
    window.addEventListener("cookie-preferences", reopen);
    return () => window.removeEventListener("cookie-preferences", reopen);
  }, []);

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
        return;
      }
      // Възстановяваме предишния избор, за да не изглежда „нулиран“ при
      // повторно отваряне — това само по себе си е тъмен модел.
      setPrefs((p) => ({ ...p, analytics: !!parsed.analytics, marketing: !!parsed.marketing }));
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
      aria-label={L.dialog}
      aria-describedby="cookie-consent-description"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-[100] cs-card !p-5 border-cs-cyan/40 shadow-2xl shadow-cs-cyan/20 bg-cs-bg/95 backdrop-blur-md"
    >
      <div className="flex items-start gap-3 mb-3">
        <Cookie className="w-5 h-5 text-cs-cyan flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="font-display font-bold text-sm text-cs-text mb-1">{L.title}</h3>
          <p id="cookie-consent-description" className="text-xs text-cs-muted leading-relaxed">
            {L.body}{" "}
            <a href="/cookies" className="text-cs-cyan underline">
              {L.policy}
            </a>
          </p>
        </div>
      </div>

      {showPrefs && (
        <div className="mb-4 space-y-2 border-t border-cs-border pt-3">
          <PrefRow
            label={L.essential}
            description={L.essentialDesc}
            requiredLabel={L.required}
            checked={true}
            disabled
          />
          <PrefRow
            label={L.analytics}
            description={L.analyticsDesc}
            checked={prefs.analytics}
            onChange={(v) => setPrefs({ ...prefs, analytics: v })}
          />
          <PrefRow
            label={L.marketing}
            description={L.marketingDesc}
            checked={prefs.marketing}
            onChange={(v) => setPrefs({ ...prefs, marketing: v })}
          />
        </div>
      )}

      {/* На телефон един под друг: преведените надписи („Отказвам незадължителните“)
          не се събират в половин ред. Двата избора остават еднакво видими. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          onClick={acceptAll}
          className="cs-btn-primary text-xs whitespace-normal text-center"
        >
          <Check className="w-3.5 h-3.5" aria-hidden="true" /> {L.acceptAll}
        </button>
        <button
          onClick={rejectNonEssential}
          className="cs-btn-primary text-xs whitespace-normal text-center"
        >
          {L.reject}
        </button>
        {showPrefs ? (
          <button
            onClick={saveCustom}
            className="cs-btn-ghost text-xs w-full sm:col-span-2"
          >
            {L.save}
          </button>
        ) : (
          <button
            onClick={() => setShowPrefs(true)}
            className="cs-btn-ghost text-xs w-full sm:col-span-2"
          >
            {L.customize}
          </button>
        )}
      </div>
    </div>
  );
}

function PrefRow({ label, description, checked, onChange, disabled, requiredLabel }) {
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
        <div className="text-xs font-semibold text-cs-text">{label}{disabled && <span className="text-cs-dim ml-2">{requiredLabel}</span>}</div>
        <div className="text-[10px] text-cs-dim">{description}</div>
      </div>
    </label>
  );
}

/**
 * Отваря настройките за бисквитки отвсякъде — чл. 7(3) ОРЗД.
 * Ползва се от футъра и от Политиката за бисквитки.
 */
export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent("cookie-preferences"));
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
