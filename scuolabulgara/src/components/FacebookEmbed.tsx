"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import Icon from "@/components/Icon";

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
            <Icon name="facebook-circle" size={56} />
          </span>
          <h3>{t(locale, "nav.facebook")}</h3>
          <p>{t(locale, "fb.consent")}</p>
          <button className="btn btn--primary" type="button" onClick={onLoad}>{t(locale, "fb.show")}</button>
        </div>
      )}
    </div>
  );
}
