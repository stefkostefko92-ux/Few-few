"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

const KEY = "qb-cookie-ack";

export default function CookieBanner({ locale }: { locale: Locale }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const accept = () => {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setShow(false);
  };

  return (
    <div className="cookiebar" role="region" aria-label="Cookie">
      <p>
        {t(locale, "cookie.text")}{" "}
        <a href={`/${locale}/cookie`}>{t(locale, "cookie.more")}</a>
      </p>
      <button type="button" className="btn btn--primary" onClick={accept}>
        {t(locale, "cookie.accept")}
      </button>
    </div>
  );
}
