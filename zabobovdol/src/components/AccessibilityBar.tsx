"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Type, Contrast, Hand, Info, Moon, ChevronDown } from "@/components/icons";

// Нива на уголемяване на шрифта → размер на корена (html). Понеже всичко е в
// rem, целият сайт (текст и отстояния) се мащабира пропорционално.
const FONT_SIZES: Record<string, string> = { "1": "100%", "2": "112.5%", "3": "125%" };

function applyFont(level: string) {
  const size = FONT_SIZES[level] ?? FONT_SIZES["1"];
  document.documentElement.style.fontSize = size;
}
function applyContrast(on: boolean) {
  document.documentElement.classList.toggle("hc", on);
}
function applyBigTouch(on: boolean) {
  document.documentElement.classList.toggle("bt", on);
}
function applyDark(on: boolean) {
  document.documentElement.classList.toggle("dark", on);
}

export function AccessibilityBar() {
  const pathname = usePathname();
  const [font, setFont] = useState("1");
  const [contrast, setContrast] = useState(false);
  const [bigTouch, setBigTouch] = useState(false);
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Зареждане на запазените предпочитания.
  useEffect(() => {
    try {
      const f = localStorage.getItem("a11y-font") || "1";
      const c = localStorage.getItem("a11y-contrast") === "1";
      const t = localStorage.getItem("a11y-bigtouch") === "1";
      const d = localStorage.getItem("a11y-dark") === "1";
      setFont(f);
      setContrast(c);
      setBigTouch(t);
      setDark(d);
      // Дали лентата е свита, се решава ПРЕДИ първото рисуване от вградения
      // скрипт в layout.tsx (клас `a11y-min` на <html>) — иначе на телефон тя
      // се рисуваше разгърната и после се свиваше, а страницата подскачаше.
      // Тук само синхронизираме състоянието за aria-expanded.
      setCollapsed(document.documentElement.classList.contains("a11y-min"));
      applyFont(f);
      applyContrast(c);
      applyBigTouch(t);
      applyDark(d);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      // С изрично true/false е идемпотентно — StrictMode вика тази функция два пъти.
      document.documentElement.classList.toggle("a11y-min", next);
      try {
        localStorage.setItem("a11y-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const chooseFont = useCallback((level: string) => {
    setFont(level);
    applyFont(level);
    try {
      localStorage.setItem("a11y-font", level);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleContrast = useCallback(() => {
    setContrast((prev) => {
      const next = !prev;
      applyContrast(next);
      try {
        localStorage.setItem("a11y-contrast", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      // Контрастът и тъмният режим са взаимно изключващи се.
      if (next) {
        setDark(false);
        applyDark(false);
        try { localStorage.setItem("a11y-dark", "0"); } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  const toggleDark = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      applyDark(next);
      try {
        localStorage.setItem("a11y-dark", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (next) {
        setContrast(false);
        applyContrast(false);
        try { localStorage.setItem("a11y-contrast", "0"); } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  const toggleBigTouch = useCallback(() => {
    setBigTouch((prev) => {
      const next = !prev;
      applyBigTouch(next);
      try {
        localStorage.setItem("a11y-bigtouch", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Скрий лентата в админ зоната.
  if (pathname?.startsWith("/admin")) return null;

  // Бутоните в панела: бял с рамка; включеният е запълнен в синьо. Надписът
  // е постоянен — състоянието казва aria-pressed (WCAG 4.1.2).
  const toggleCls = (on: boolean) =>
    "a11y-btn inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-base font-semibold leading-tight transition-colors " +
    (on
      ? "border-brand-700 bg-brand-700 text-white"
      : "border-slate-300 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50");

  const fontBtn = (level: string, label: string, cls: string) => (
    <button
      type="button"
      onClick={() => chooseFont(level)}
      aria-pressed={font === level}
      className={toggleCls(font === level) + " min-w-[44px] flex-1 font-bold leading-none sm:flex-none " + cls}
      title={`Размер на текста: ${label}`}
      aria-label={`Размер на текста: ${label}`}
    >
      А
    </button>
  );

  return (
    <div className="a11y-bar no-print border-b border-slate-200 bg-paper-muted">
      {/* Тънката лента: вляво — честно, че сайтът е независим (не е на
          общината); вдясно — настройките за четене. */}
      <div className="container-content flex min-h-12 items-center justify-between gap-3 py-0.5">
        <p className="min-w-0 text-sm leading-snug text-slate-700">
          <span className="hidden sm:inline">
            Независим граждански портал — не е сайтът на Община Бобов дол
          </span>
          <span className="sm:hidden">
            <span className="block">Независим портал</span>
            <span className="sr-only"> — </span>
            <span className="block">не е общината</span>
          </span>
        </p>

        {/* Стрелката се обръща от CSS според класа `a11y-min`, поставен преди
            първото рисуване — затова няма примигване. „Аа“ е украса; името
            на бутона е „Настройки за четене“ (на телефон „за четене“ е само
            за екранния четец, за да се събере редът). */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="a11y-controls"
          className="a11y-btn inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold text-brand-800 transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <span aria-hidden className="font-display text-lg font-bold leading-none max-[359px]:hidden">
            Аа
          </span>
          <span>
            Настройки<span className="max-[639px]:sr-only"> за четене</span>
          </span>
          <ChevronDown className="a11y-chevron h-5 w-5 rotate-180 transition-transform" aria-hidden />
        </button>
      </div>

      {/* Контролите стоят в DOM винаги (aria-controls трябва да сочи към
          съществуващ елемент); CSS ги скрива, когато лентата е свита.
          Телефон: мрежа 2 колони (трите „А“ на един ред, превключвателите по
          два); компютър: един ред. Всяка цел е ≥44px. */}
      <div id="a11y-controls" className="a11y-controls border-t border-slate-200">
        <div className="container-content grid grid-cols-2 gap-2 py-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3">
          <div
            className="col-span-2 flex items-center gap-2"
            role="group"
            aria-label="Размер на текста"
          >
            <span className="text-base text-slate-700" aria-hidden>
              <Type className="mr-1 inline h-5 w-5 align-[-0.2em] text-brand-700" />
              Текст
            </span>
            {fontBtn("1", "нормален", "text-sm")}
            {fontBtn("2", "голям", "text-base")}
            {fontBtn("3", "много голям", "text-lg")}
          </div>

          <button
            type="button"
            onClick={toggleContrast}
            aria-pressed={contrast}
            className={toggleCls(contrast)}
            title="Висок контраст за по-добра четимост"
          >
            <Contrast className="h-5 w-5 shrink-0" aria-hidden />
            Контраст
          </button>

          <button
            type="button"
            onClick={toggleDark}
            aria-pressed={dark}
            className={toggleCls(dark)}
            title="Тъмен режим (по-щадящ за очите на тъмно)"
          >
            <Moon className="h-5 w-5 shrink-0" aria-hidden />
            Тъмен режим
          </button>

          <button
            type="button"
            onClick={toggleBigTouch}
            aria-pressed={bigTouch}
            className={toggleCls(bigTouch)}
            title="По-големи бутони и връзки за по-лесно натискане"
          >
            <Hand className="h-5 w-5 shrink-0" aria-hidden />
            По-лесно докосване
          </button>

          <Link
            href="/dostapnost"
            className="a11y-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-base font-semibold leading-tight text-brand-700 underline decoration-slate-300 underline-offset-4 hover:decoration-brand-700 sm:ml-auto"
            title="Помощ за достъпността и връзка без обаждане"
          >
            <Info className="h-5 w-5 shrink-0" aria-hidden />
            <span>
              Помощ<span className="max-[639px]:sr-only"> за достъпността</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
