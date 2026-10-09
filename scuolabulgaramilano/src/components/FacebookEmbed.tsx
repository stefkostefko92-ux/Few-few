"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

const STORE_KEY = "qb-fb-consent";

export default function FacebookEmbed({ locale, href }: { locale: Locale; href: string }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!ref.current) return;
    setLoaded(true);
    const width = Math.min(520, Math.max(320, Math.round(ref.current.clientWidth)));
    const height = 600;
    const src =
      "https://www.facebook.com/plugins/page.php?href=" +
      encodeURIComponent(href) +
      `&tabs=timeline&width=${width}&height=${height}&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`;
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "Facebook — Qui Bulgaria";
    iframe.width = String(width);
    iframe.height = String(height);
    iframe.loading = "lazy";
    iframe.style.width = "100%";
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("frameborder", "0");
    iframe.allow = "encrypted-media; clipboard-write; web-share";
    ref.current.innerHTML = "";
    ref.current.appendChild(iframe);
  };

  useEffect(() => {
    try {
      if (localStorage.getItem(STORE_KEY) === "1") load();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = () => {
    try { localStorage.setItem(STORE_KEY, "1"); } catch {}
    load();
  };

  return (
    <div className="fb-embed" ref={ref}>
      {!loaded && (
        <div className="fb-consent">
          <span className="fb-consent__logo">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" /></svg>
          </span>
          <h3>{t(locale, "nav.facebook")}</h3>
          <p>{t(locale, "fb.consent")}</p>
          <button className="btn btn--primary" type="button" onClick={onLoad}>{t(locale, "fb.show")}</button>
        </div>
      )}
    </div>
  );
}
