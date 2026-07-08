"use client";

import { useEffect, useState } from "react";

interface Banner {
  id: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  image: string;
  imageAlt: string;
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
          className="relative text-center text-sm"
          style={{ background: b.bg, color: b.fg }}
        >
          {b.image ? (
            // Пълноширок рекламен банер (изображение). Цялото е кликаемо.
            // Видим етикет „Реклама“ (Дир. 2000/31 чл. 6 + ЗЗП). alt="" на
            // img, за да не се обявява два пъти — описанието е на линка.
            <a
              href={b.href || undefined}
              rel="noopener"
              className="relative block"
              aria-label={b.imageAlt || b.title || "Реклама"}
            >
              <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Реклама
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.image}
                alt=""
                className="mx-auto block h-auto w-full max-w-5xl"
              />
            </a>
          ) : (
            <div className="px-8 py-2.5">
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
            </div>
          )}
          <button
            type="button"
            aria-label="Скрий съобщението"
            onClick={() => dismiss(b.id)}
            className="absolute right-2 top-2 rounded-full bg-black/30 px-2 text-lg leading-none text-white opacity-80 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
