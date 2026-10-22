"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { useUi } from "./UiProvider";

export const MAP_CONSENT_KEY = "qb-map-consent";

// Google Maps, loaded only after the visitor agrees (Google sets cookies) —
// the same two-click rule as the Facebook plugin. Until then: the address, a
// drawn street map in the site's own linen, and a plain link to Google Maps.
export default function MapEmbed({ locale, query, address, href }: {
  locale: Locale;
  /** What Google should look up: the street, or "lat,lng". */
  query: string;
  address: string;
  href: string;
}) {
  const ui = useUi();
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(MAP_CONSENT_KEY) === "1") setOn(true);
    } catch {}
    // „Настройки на бисквитките“ / „Отказвам“ withdraw consent: hide the map again.
    const off = () => setOn(false);
    window.addEventListener("qb:cookie-settings", off);
    window.addEventListener("qb:consent-withdrawn", off);
    return () => {
      window.removeEventListener("qb:cookie-settings", off);
      window.removeEventListener("qb:consent-withdrawn", off);
    };
  }, []);

  const show = () => {
    try { localStorage.setItem(MAP_CONSENT_KEY, "1"); } catch {}
    setOn(true);
  };

  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&hl=${locale}&z=16&output=embed`;
  return (
    <figure className="map">
      {on ? (
        <iframe
          src={src}
          title={t(locale, "map.title", ui)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <div className="map__consent">
          <span className="map__pin" aria-hidden="true" />
          <p className="map__address">{address}</p>
          <p className="map__note">{t(locale, "map.consent", ui)}</p>
          <button className="btn btn--red btn--sm" type="button" onClick={show}>{t(locale, "map.show", ui)}</button>
        </div>
      )}
      {href && (
        <figcaption>
          <a href={href} target="_blank" rel="noopener noreferrer">{t(locale, "map.open", ui)}</a>
        </figcaption>
      )}
    </figure>
  );
}
