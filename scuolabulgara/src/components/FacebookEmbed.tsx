"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { useUi } from "./UiProvider";
import Icon from "@/components/Icon";

const STORE_KEY = "qb-fb-consent";

// Facebook's page plugin, loaded only after the visitor agrees (it sets
// cookies). The iframe is rendered by React like everything else: writing it
// into the DOM by hand (innerHTML) pulled the consent box out from under React,
// whose next update then crashed the whole page.
export default function FacebookEmbed({ locale, href }: { locale: Locale; href: string }) {
  const ui = useUi();
  const [frame, setFrame] = useState<{ src: string; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    const width = Math.min(500, Math.max(180, Math.round(ref.current?.clientWidth || 500)));
    const src =
      "https://www.facebook.com/plugins/page.php?href=" +
      encodeURIComponent(href) +
      `&tabs=timeline&width=${width}&height=600&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`;
    setFrame({ src, width });
  };

  useEffect(() => {
    try {
      if (localStorage.getItem(STORE_KEY) === "1") load();
    } catch {}
    // Withdrawn consent („Отказвам“, cookie settings) unloads the plugin again.
    const off = () => setFrame(null);
    window.addEventListener("qb:cookie-settings", off);
    window.addEventListener("qb:consent-withdrawn", off);
    return () => {
      window.removeEventListener("qb:cookie-settings", off);
      window.removeEventListener("qb:consent-withdrawn", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = () => {
    try { localStorage.setItem(STORE_KEY, "1"); } catch {}
    load();
  };

  return (
    <div className="fb-embed" ref={ref}>
      {frame ? (
        <iframe
          src={frame.src}
          title={t(locale, "nav.facebook", ui)}
          width={frame.width}
          height={600}
          style={{ width: "100%", maxWidth: frame.width, border: 0 }}
          scrolling="no"
          allow="encrypted-media; clipboard-write; web-share"
        />
      ) : (
        <div className="fb-consent">
          <span className="fb-consent__logo">
            <Icon name="facebook-circle" size={56} />
          </span>
          <h3>{t(locale, "nav.facebook", ui)}</h3>
          <p>{t(locale, "fb.consent", ui)}</p>
          <button className="btn btn--red" type="button" onClick={onLoad}>{t(locale, "fb.show", ui)}</button>
        </div>
      )}
    </div>
  );
}
