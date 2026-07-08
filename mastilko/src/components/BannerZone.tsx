"use client";

import { useEffect, useState } from "react";

interface Banner {
  id: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  bg: string;
  fg: string;
}

// Показва активните банери, зададени от админа. Собствени промоции — без
// проследяване и без чужди скриптове. Затварянето се помни в localStorage
// (функционално, не проследяване), за да не досажда.
export default function BannerZone({ placement }: { placement: "all" | "home" }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      setDismissed(
        new Set(JSON.parse(localStorage.getItem("mastilko-banners-x") || "[]")),
      );
    } catch {
      /* игнорирай повреден запис */
    }
    fetch(`/api/banners?p=${placement}`)
      .then((r) => (r.ok ? r.json() : { banners: [] }))
      .then((d) => setBanners(Array.isArray(d.banners) ? d.banners : []))
      .catch(() => setBanners([]));
  }, [placement]);

  function dismiss(id: string) {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    try {
      localStorage.setItem("mastilko-banners-x", JSON.stringify([...next]));
    } catch {
      /* пълно хранилище → просто не помним */
    }
  }

  const visible = banners.filter((b) => !dismissed.has(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="no-print">
      {visible.map((b) => (
        <div
          key={b.id}
          className="relative px-4 py-2.5 text-center text-sm"
          style={{ background: b.bg, color: b.fg }}
        >
          <span className="font-semibold">{b.title}</span>
          {b.text && <span className="ml-2 opacity-90">{b.text}</span>}
          {b.cta && b.href && (
            <a
              href={b.href}
              rel="noopener"
              className="ml-3 inline-block rounded-full bg-white/25 px-3 py-0.5 font-semibold underline-offset-2 hover:underline"
              style={{ color: b.fg }}
            >
              {b.cta}
            </a>
          )}
          <button
            type="button"
            aria-label="Скрий съобщението"
            onClick={() => dismiss(b.id)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 text-lg leading-none opacity-70 hover:opacity-100"
            style={{ color: b.fg }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
