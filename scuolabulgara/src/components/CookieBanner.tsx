"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { useUi } from "./UiProvider";

const KEY = "qb-cookie-ack";

export default function CookieBanner({ locale }: { locale: Locale }) {
  const ui = useUi();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
    // Re-open the banner when the user clicks "Cookie preferences" in the footer.
    const reopen = () => setShow(true);
    window.addEventListener("qb:cookie-settings", reopen);
    return () => window.removeEventListener("qb:cookie-settings", reopen);
  }, []);

  if (!show) return null;

  const decide = (choice: "accepted" | "rejected") => {
    try {
      localStorage.setItem(KEY, choice);
      // On reject, also clear any prior Facebook-embed consent.
      if (choice === "rejected") localStorage.removeItem("qb-fb-consent");
    } catch {}
    setShow(false);
  };

  return (
    <div className="cookiebar" role="region" aria-label={t(locale, "legal.cookie", ui)}>
      <p>
        {t(locale, "cookie.text", ui)}{" "}
        <a href={`/${locale}/cookie`}>{t(locale, "cookie.more", ui)}</a>
      </p>
      <div className="cookiebar__actions">
        <button type="button" className="btn btn--line btn--sm" onClick={() => decide("rejected")}>
          {t(locale, "cookie.reject", ui)}
        </button>
        <button type="button" className="btn btn--red btn--sm" onClick={() => decide("accepted")}>
          {t(locale, "cookie.accept", ui)}
        </button>
      </div>
    </div>
  );
}
