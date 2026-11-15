"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SITE } from "@/lib/site";
import { visitNumber, formatVisitNumber } from "@/lib/visit-client";

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
  const [reduce, setReduce] = useState(false);
  const skipRef = useRef<HTMLButtonElement>(null);

  // При „по-малко движение“ показваме екрана съвсем кратко и без анимирана
  // лента — за хора с вестибуларна чувствителност и за да не бави достъпа.
  const seconds = reduce ? 1.5 : SITE.intro.seconds;

  // Брояч на посетителите: увеличава се при ВСЯКО зареждане на сайта. Самата
  // заявка е една на пълно зареждане (виж visit-client.ts) — същият номер
  // показва и футърът, а вътрешните навигации не броят пак.
  useEffect(() => {
    if (isAdmin) return;
    // Флаг „отказано“ при cleanup тук НЕ бива да има: в разработка StrictMode
    // вика cleanup веднага след първото изпълнение и номерът никога не би се
    // показал. setState след демонтиране е безвреден в React 18+.
    visitNumber().then((n) => {
      if (n !== null) setVisitorNo(n);
    });
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
    const reduceM =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setReduce(reduceM);
    const eff = reduceM ? 1.5 : SITE.intro.seconds;
    setVisible(true);
    document.body.style.overflow = "hidden";
    const t1 = setTimeout(() => setLeaving(true), eff * 1000 - 500);
    const t2 = setTimeout(() => {
      setVisible(false);
      document.body.style.overflow = "";
    }, eff * 1000);
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
        "on-dark no-print fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-brand-800 to-brand-900 px-6 text-center text-white transition-opacity duration-500 " +
        (leaving ? "pointer-events-none opacity-0" : "opacity-100")
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/bobov-dol-grb-mark.png"
        alt="Герб на Бобов дол"
        width={150}
        height={216}
        className="splash-crest h-32 w-auto drop-shadow-xl sm:h-40"
      />
      {/* Не е <h1> нарочно: това е временен надпис, а истинският <h1> е на
          страницата отдолу — иначе на началната страница биха станали два. */}
      <p className="splash-text mt-7 max-w-2xl text-balance font-display text-4xl font-bold leading-tight sm:text-5xl">
        {SITE.intro.headline}
      </p>
      <div aria-hidden className="splash-text mt-4 h-1 w-14 rounded-full bg-gold-400" />
      <p className="splash-text mt-4 text-lg text-brand-100">
        {SITE.tagline} · {SITE.geo.city}
      </p>

      {/* Брояч на посещенията. Брои ВСЯКО зареждане (и презарежданията),
          затова надписът е „посещение“, не „посетител“ — иначе числото
          изглежда като брой хора, какъвто не е. */}
      {visitorNo !== null && (
        <p className="splash-text mt-6 text-lg text-brand-50">
          Посещение номер{" "}
          <span className="font-extrabold text-gold-300">
            {formatVisitNumber(visitorNo)}
          </span>
        </p>
      )}

      {/* Лента за прогрес (изпълва се за времето на екрана). При „по-малко
          движение“ е статична — без анимация. */}
      <div className="mt-8 h-1 w-44 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-gold-400"
          style={
            reduce
              ? { width: "100%" }
              : { animation: `splashBar ${seconds}s linear forwards` }
          }
        />
      </div>

      <button
        ref={skipRef}
        type="button"
        onClick={skip}
        className="mt-6 inline-flex min-h-tap items-center gap-2 rounded-xl border-2 border-white/60 px-6 py-2.5 text-base font-semibold text-white transition-colors hover:bg-white/15"
      >
        Продължете към сайта
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
