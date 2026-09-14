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
      const hidden = localStorage.getItem("a11y-collapsed") === "1";
      setFont(f);
      setContrast(c);
      setBigTouch(t);
      setDark(d);
      setCollapsed(hidden);
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

  const fontBtn = (level: string, label: string, cls: string) => (
    <button
      type="button"
      onClick={() => chooseFont(level)}
      aria-pressed={font === level}
      className={
        "a11y-btn inline-flex min-w-[44px] items-center justify-center rounded px-3 py-1.5 font-bold leading-none transition " +
        cls +
        " " +
        (font === level
          ? "bg-brand-700 text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
      }
      title={`Размер на текста: ${label}`}
      aria-label={`Размер на текста: ${label}`}
    >
      А
    </button>
  );

  return (
    <div className="border-b-2 border-red-300 bg-red-100 no-print">
      <div className="container-content flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm">
        <span className="flex items-center gap-1.5 font-bold text-red-700">
          <Type className="h-4 w-4" aria-hidden />
          Достъпност:
        </span>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="a11y-controls"
          className="a11y-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium text-red-700 ring-1 ring-red-300 transition hover:bg-red-200"
          title={collapsed ? "Покажи настройките за достъпност" : "Скрий настройките за достъпност"}
        >
          <ChevronDown
            className={"h-4 w-4 transition-transform " + (collapsed ? "" : "rotate-180")}
            aria-hidden
          />
          {collapsed ? "Покажи" : "Скрий"}
        </button>

        {!collapsed && (
        <>
        <div
          id="a11y-controls"
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Размер на текста"
        >
          <span className="mr-0.5 text-slate-600">Текст</span>
          {fontBtn("1", "нормален", "text-sm")}
          {fontBtn("2", "голям", "text-base")}
          {fontBtn("3", "много голям", "text-lg")}
        </div>

        <button
          type="button"
          onClick={toggleContrast}
          aria-pressed={contrast}
          className={
            "a11y-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition " +
            (contrast
              ? "bg-brand-700 text-white"
              : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
          }
          title="Висок контраст за по-добра четимост"
        >
          <Contrast className="h-4 w-4" aria-hidden />
          Контраст
        </button>

        <button
          type="button"
          onClick={toggleDark}
          aria-pressed={dark}
          className={
            "a11y-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition " +
            (dark
              ? "bg-brand-700 text-white"
              : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
          }
          title="Тъмен режим (по-щадящ за очите на тъмно)"
        >
          <Moon className="h-4 w-4" aria-hidden />
          {dark ? "Светъл режим" : "Тъмен режим"}
        </button>

        <button
          type="button"
          onClick={toggleBigTouch}
          aria-pressed={bigTouch}
          className={
            "a11y-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition " +
            (bigTouch
              ? "bg-brand-700 text-white"
              : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
          }
          title="По-големи бутони и връзки за по-лесно натискане"
        >
          <Hand className="h-4 w-4" aria-hidden />
          По-лесно докосване
        </button>

        <Link
          href="/dostapnost"
          className="a11y-btn ml-auto inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium text-brand-700 underline-offset-2 hover:underline"
          title="Помощ за достъпността и връзка без обаждане"
        >
          <Info className="h-4 w-4" aria-hidden />
          Помощ за достъпността
        </Link>
        </>
        )}
      </div>
    </div>
  );
}
