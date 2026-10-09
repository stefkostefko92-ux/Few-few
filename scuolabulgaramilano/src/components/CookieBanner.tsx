"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

const KEY = "qb-cookie-ack";

export default function CookieBanner({ locale }: { locale: Locale }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
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
    <div className="cookiebar" role="region" aria-label="Cookie">
      <p>
        {t(locale, "cookie.text")}{" "}
        <a href={`/${locale}/cookie`}>{t(locale, "cookie.more")}</a>
      </p>
      <div className="cookiebar__actions">
        <button type="button" className="btn btn--ghost" onClick={() => decide("rejected")}>
          {t(locale, "cookie.reject")}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => decide("accepted")}>
          {t(locale, "cookie.accept")}
        </button>
      </div>
    </div>
  );
}
