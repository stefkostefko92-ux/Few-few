// frontend/src/components/CookieConsent.jsx
// GDPR/ePrivacy-compliant cookie consent banner.
// Stores consent in localStorage with versioning — if privacy policy
// changes and bumps the version, banner reappears.

import { useState, useEffect } from "react";
import { Cookie, X, Check } from "lucide-react";

const CONSENT_KEY = "supreme-bot-cookie-consent";
const CURRENT_VERSION = 1; // Bump this when privacy policy materially changes

// Двата бутона — еднакви по тежест (EDPB 03/2022: отказът не бива да е по-труден
// или по-незабележим от приемането).
const BTN = "flex-1 min-w-[8.5rem] inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border border-[#8C96A8]/50 bg-[#2B2D31] text-sm font-semibold text-[#DCE1E8] hover:border-[#DCE1E8]";
const LINK = "w-full min-h-[40px] text-sm text-[#8C96A8] underline underline-offset-4 hover:text-[#DCE1E8]";

export default function CookieConsent() {
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
      aria-label="Cookie consent"
      aria-describedby="cookie-consent-description"
      // Редизайн 25.09.2026: спокоен панел в цветовете на сайта (графит + хром),
      // без неонова рамка; „Приеми“ и „Откажи“ са равнозначни (без подбутване).
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-[100] rounded-xl border border-[#2F3238] bg-[#1E1F22] p-5 text-[#DCE1E8] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]"
      style={{ fontFamily: "Onest, 'Inter Tight', system-ui, sans-serif" }}
    >
      <div className="flex items-start gap-3 mb-4">
        <Cookie className="w-5 h-5 text-[#8C96A8] flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="font-semibold text-[15px] mb-1">Cookies</h3>
          <p id="cookie-consent-description" className="text-sm text-[#8C96A8] leading-relaxed">
            Only the essential cookies for signing in and keeping your session. No tracking, no ads.{" "}
            <a href="/cookies" className="text-[#DCE1E8] underline underline-offset-2">
              Cookie Policy
            </a>
          </p>
        </div>
      </div>

      {showPrefs && (
        <div className="mb-4 space-y-3 border-t border-[#2F3238] pt-3">
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
        <button type="button" onClick={acceptAll} className={BTN}>
          <Check className="w-4 h-4" aria-hidden="true" /> Accept all
        </button>
        <button type="button" onClick={rejectNonEssential} className={BTN}>
          Reject non-essential
        </button>
        {showPrefs ? (
          <button type="button" onClick={saveCustom} className={LINK}>
            Save preferences
          </button>
        ) : (
          <button type="button" onClick={() => setShowPrefs(true)} className={LINK}>
            Choose categories
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
        className="mt-1 accent-[#8FE600]"
      />
      <div className="flex-1">
        <div className="text-sm font-semibold">{label}{disabled && <span className="text-[#8C96A8] font-normal ml-2">(required)</span>}</div>
        <div className="text-xs text-[#8C96A8]">{description}</div>
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
