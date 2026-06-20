"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Type, Contrast, Volume2, Square, Hand, Info, Moon } from "@/components/icons";

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
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      applyFont(f);
      applyContrast(c);
      applyBigTouch(t);
      applyDark(d);
    } catch {
      /* ignore */
    }
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  // Спира четенето (глас и аудио) при смяна на страницата.
  useEffect(() => {
    return () => {
      try {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [pathname]);

  // Зарежда списъка с гласове рано (на някои браузъри е празен при старт).
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
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

  const stopAll = useCallback(() => {
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setSpeaking(false);
    setPreparing(false);
  }, []);

  // Резервен глас на браузъра — избира ЖЕНСКИ български глас и по-топла интонация.
  const speakWithBrowser = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const bg = voices.filter((v) => v.lang?.toLowerCase().startsWith("bg"));
    const female =
      bg.find((v) => /female|жена|daria|kalina|elena|silvia|google/i.test(v.name)) ||
      bg.find((v) => !/ivan|male|мъж/i.test(v.name)) ||
      bg[0];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "bg-BG";
    if (female) u.voice = female;
    u.rate = 0.9; // по-бавно и по-ясно
    u.pitch = 1.1; // малко по-висок, по-топъл тон
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }, []);

  const toggleSpeak = useCallback(async () => {
    if (speaking || preparing) {
      stopAll();
      return;
    }
    const main = document.getElementById("main");
    const text = (main?.innerText || document.body.innerText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    if (!text) return;

    setPreparing(true);
    // 1) Опит за топъл невронен глас (ако е настроен на сървъра).
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok && (res.headers.get("content-type") || "").includes("audio")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
        };
        setPreparing(false);
        setSpeaking(true);
        await audio.play();
        return;
      }
    } catch {
      /* пада към браузърния глас */
    }
    // 2) Резервен вариант — гласът на браузъра.
    setPreparing(false);
    speakWithBrowser(text);
  }, [speaking, preparing, stopAll, speakWithBrowser]);

  // Скрий лентата в админ зоната.
  if (pathname?.startsWith("/admin")) return null;

  const fontBtn = (level: string, label: string, cls: string) => (
    <button
      type="button"
      onClick={() => chooseFont(level)}
      aria-pressed={font === level}
      className={
        "a11y-btn rounded px-3 py-1.5 font-bold leading-none transition " +
        cls +
        " " +
        (font === level
          ? "bg-brand-700 text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
      }
      title={`Размер на текста: ${label}`}
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

        <div
          className="flex items-center gap-1.5"
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

        {canSpeak && (
          <button
            type="button"
            onClick={() => void toggleSpeak()}
            aria-pressed={speaking}
            className={
              "a11y-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition " +
              (speaking || preparing
                ? "bg-crimson-600 text-white hover:bg-crimson-700"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100")
            }
            title="Чете съдържанието на страницата на глас с топъл женски глас"
          >
            {preparing ? (
              <>
                <Volume2 className="h-4 w-4 animate-pulse" aria-hidden />
                Подготвям…
              </>
            ) : speaking ? (
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

        <Link
          href="/dostapnost"
          className="a11y-btn ml-auto inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-medium text-brand-700 underline-offset-2 hover:underline"
          title="Помощ за достъпността и връзка без обаждане"
        >
          <Info className="h-4 w-4" aria-hidden />
          Помощ за достъпността
        </Link>
      </div>
    </div>
  );
}
