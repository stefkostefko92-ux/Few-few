"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SITE } from "@/lib/site";

// Начален екран при влизане в сайта: герб + силен надпис, стои няколко
// секунди и изчезва плавно. Показва се при всяко зареждане на сайта (не и в
// административната част). Има бутон „Прескочи“ за удобство.
export function IntroSplash() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  // Започва скрит; показва се само при ПЪРВО влизане в сайта за сесията
  // (решава се в useEffect долу — за да няма разлика сървър/клиент и да НЕ
  // изскача пак при навигация, търсене или презареждане).
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [visitorNo, setVisitorNo] = useState<number | null>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  const seconds = SITE.intro.seconds;

  // Истински брояч на посетителите: всеки браузър получава пореден номер
  // веднъж и го запомня, за да не надува брояча при всяко зареждане.
  useEffect(() => {
    if (isAdmin) return;
    const KEY = "zbd_visitor_no";
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* localStorage недостъпен */
    }
    if (stored && Number(stored) > 0) {
      setVisitorNo(Number(stored));
      return;
    }
    let cancelled = false;
    fetch("/api/visit", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok || typeof d.n !== "number") return;
        setVisitorNo(d.n);
        try {
          localStorage.setItem(KEY, String(d.n));
        } catch {
          /* пренебрегваме */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin || !SITE.intro.enabled) return;
    // Показваме началния екран само веднъж за сесията на браузъра. Така при
    // навигация, търсене или презареждане (вкл. пълно) той не изскача отново.
    try {
      if (sessionStorage.getItem("zbd_splash_seen")) return;
      sessionStorage.setItem("zbd_splash_seen", "1");
    } catch {
      /* sessionStorage недостъпен — показваме веднъж нормално */
    }
    setVisible(true);
    document.body.style.overflow = "hidden";
    const t1 = setTimeout(() => setLeaving(true), seconds * 1000 - 500);
    const t2 = setTimeout(() => {
      setVisible(false);
      document.body.style.overflow = "";
    }, seconds * 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Достъпност: при поява фокусираме бутона „Прескочи" и позволяваме затваряне
  // с клавиша Escape (за хора, които ползват клавиатура).
  useEffect(() => {
    if (!visible) return;
    skipRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLeaving(true);
        setTimeout(() => {
          setVisible(false);
          document.body.style.overflow = "";
        }, 350);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (isAdmin || !visible || !SITE.intro.enabled) return null;

  const skip = () => {
    setLeaving(true);
    setTimeout(() => {
      setVisible(false);
      document.body.style.overflow = "";
    }, 350);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Добре дошли"
      className={
        "no-print fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-brand-800 to-brand-900 px-6 text-center text-white transition-opacity duration-500 " +
        (leaving ? "pointer-events-none opacity-0" : "opacity-100")
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/bobov-dol-grb.png"
        alt="Герб на Бобов дол"
        width={150}
        height={216}
        className="splash-crest h-36 w-auto rounded-2xl bg-white p-3 shadow-2xl sm:h-44"
      />
      {/* Не е <h1> нарочно: това е временен надпис, а истинският <h1> е на
          страницата отдолу — иначе на началната страница биха станали два. */}
      <p className="splash-text mt-7 max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
        {SITE.intro.headline}
      </p>
      <p className="splash-text mt-3 text-base text-brand-100">
        {SITE.name} · {SITE.geo.city}
      </p>

      {/* Истински брояч на посетителите */}
      {visitorNo !== null && (
        <p className="splash-text mt-6 text-lg text-brand-50">
          Вие сте посетител номер{" "}
          <span className="font-extrabold text-gold-300">
            {new Intl.NumberFormat("bg-BG").format(visitorNo)}
          </span>
        </p>
      )}

      {/* Лента за прогрес (изпълва се за времето на екрана) */}
      <div className="mt-8 h-1 w-44 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-gold-400"
          style={{ animation: `splashBar ${seconds}s linear forwards` }}
        />
      </div>

      <button
        ref={skipRef}
        type="button"
        onClick={skip}
        className="mt-6 rounded-full border border-white/30 px-4 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
      >
        Прескочи →
      </button>
    </div>
  );
}
