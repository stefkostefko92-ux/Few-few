"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Type, Contrast, Volume2, Square } from "lucide-react";

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

export function AccessibilityBar() {
  const pathname = usePathname();
  const [font, setFont] = useState("1");
  const [contrast, setContrast] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);

  // Зареждане на запазените предпочитания.
  useEffect(() => {
    try {
      const f = localStorage.getItem("a11y-font") || "1";
      const c = localStorage.getItem("a11y-contrast") === "1";
      setFont(f);
      setContrast(c);
      applyFont(f);
      applyContrast(c);
    } catch {
      /* ignore */
    }
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  // Спира четенето при смяна на страницата.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [pathname]);

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
      return next;
    });
  }, []);

  const toggleSpeak = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const main = document.getElementById("main");
    const text = (main?.innerText || document.body.innerText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000); // разумна горна граница
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "bg-BG";
    const bg = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("bg"));
    if (bg) u.voice = bg;
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }, [speaking]);

  // Скрий лентата в админ зоната.
  if (pathname?.startsWith("/admin")) return null;

  const fontBtn = (level: string, label: string, cls: string) => (
    <button
      type="button"
      onClick={() => chooseFont(level)}
      aria-pressed={font === level}
      className={
        "rounded px-2 py-0.5 font-bold leading-none transition " +
        cls +
        " " +
        (font === level
          ? "bg-brand-700 text-white"
          : "bg-white text-slate-700 hover:bg-slate-100")
      }
      title={`Размер на текста: ${label}`}
    >
      А
    </button>
  );

  return (
    <div className="border-b border-slate-200 bg-slate-50 no-print">
      <div className="container-content flex flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-600">
          <Type className="h-4 w-4" aria-hidden />
          Достъпност:
        </span>

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Размер на текста"
        >
          <span className="mr-0.5 text-slate-500">Текст</span>
          {fontBtn("1", "нормален", "text-sm")}
          {fontBtn("2", "голям", "text-base")}
          {fontBtn("3", "много голям", "text-lg")}
        </div>

        <button
          type="button"
          onClick={toggleContrast}
          aria-pressed={contrast}
          className={
            "inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-medium transition " +
            (contrast
              ? "bg-brand-700 text-white"
              : "bg-white text-slate-700 hover:bg-slate-100")
          }
          title="Висок контраст за по-добра четимост"
        >
          <Contrast className="h-4 w-4" aria-hidden />
          Контраст
        </button>

        {canSpeak && (
          <button
            type="button"
            onClick={toggleSpeak}
            aria-pressed={speaking}
            className={
              "inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-medium transition " +
              (speaking
                ? "bg-crimson-600 text-white hover:bg-crimson-700"
                : "bg-white text-slate-700 hover:bg-slate-100")
            }
            title="Чете съдържанието на страницата на глас"
          >
            {speaking ? (
              <>
                <Square className="h-4 w-4" aria-hidden />
                Спри четенето
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" aria-hidden />
                Чети на глас
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
