import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const KEY = "aso_cookie_ok";

/**
 * Cookie notice. АСО uses only strictly-necessary cookies (auth session), so
 * this is an informational acknowledgement rather than a tracking opt-in. The
 * acknowledgement is remembered in localStorage (never leaves the device).
 */
export function CookieBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked — don't nag */
    }
  }, []);

  if (!show) return null;

  function accept() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3">
      <div className="flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-panel border border-brass-400/25 bg-felt-900/95 px-4 py-3 shadow-lift backdrop-blur">
        <p className="flex-1 text-sm text-ink-300">
          {t("cookie.text")}{" "}
          <a href="/cookies/" target="_blank" rel="noreferrer" className="text-brass-300 hover:text-brass-100">
            {t("cookie.learn")}
          </a>
        </p>
        <button
          type="button"
          onClick={accept}
          className="rounded-card bg-gradient-to-b from-brass-300 to-brass-400 px-4 py-2 text-sm font-semibold text-charcoal-900"
        >
          {t("cookie.accept")}
        </button>
      </div>
    </div>
  );
}
