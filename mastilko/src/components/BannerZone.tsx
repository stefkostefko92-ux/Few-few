"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      // Прочит от localStorage — достъпен чак в браузъра, веднъж при монтиране.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // Админ панелът не е място за реклама (и собственикът я вижда в таблото).
  if (visible.length === 0 || pathname?.startsWith("/admin")) return null;

  return (
    // `aside` + етикет, а не гол `div`: лентата стои МЕЖДУ хедъра и `main`,
    // тоест извън всеки landmark — при екранен четец съдържанието ѝ увисва
    // без ориентир (axe правило „region“).
    <aside className="no-print" aria-label="Съобщения от Мастилко">
      {visible.map((b) => (
        <div
          key={b.id}
          // С картинка → ред „банер | ×“: на телефон абсолютният бутон падаше
          // върху надписите на рекламата (самата картинка стига до ръба).
          className={`relative text-center text-sm ${b.image ? "flex items-center" : ""}`}
          style={{ background: b.bg, color: b.fg }}
        >
          {b.image ? (
            // Пълноширок рекламен банер (изображение). Цялото е кликаемо.
            // Видим етикет „Реклама“ (Дир. 2000/31 чл. 6 + ЗЗП). alt="" на
            // img, за да не се обявява два пъти — описанието е на линка.
            <a
              href={b.href || undefined}
              rel="noopener"
              className="relative block min-w-0 flex-1"
              aria-label={b.imageAlt || b.title || "Реклама"}
            >
              <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
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
            <div className="px-10 py-2.5">
              {/* Етикетът „Реклама“ важи и за текстовите съобщения — търговското
                  съобщение трябва да е разпознаваемо като такова (Дир. 2000/31
                  чл. 6, б. „а“ / ЗЕТ). Досега стоеше само във варианта с
                  изображение. */}
              <span className="mr-2 rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                Реклама
              </span>
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
            // 28 × 28 px (WCAG 2.5.8 иска поне 24) — преди беше 25 × 18 и
            // трудно се улучваше с пръст.
            className={`${b.image ? "mx-1 shrink-0" : "absolute right-2 top-2"} flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-lg leading-none text-white opacity-90 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
          >
            ×
          </button>
        </div>
      ))}
    </aside>
  );
}
