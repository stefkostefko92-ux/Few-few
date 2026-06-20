"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Минимална типизация на Web Speech API (не е в стандартните DOM типове).
type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: RecognitionEvent) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  // Проверката за поддръжка става след монтиране (за да няма разлика сървър/клиент).
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    if (w.SpeechRecognition || w.webkitSpeechRecognition) setVoiceSupported(true);
  }, []);

  function go(query: string) {
    const v = query.trim();
    if (v.length >= 2) router.push(`/tarsene?q=${encodeURIComponent(v)}`);
  }

  function startVoice() {
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "bg-BG";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) {
        setQ(text);
        go(text);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className="flex items-center gap-2"
    >
      <label htmlFor="site-search" className="sr-only">
        Търсене в сайта
      </label>
      <div className="relative flex-1">
        <input
          id="site-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Търсете услуга, телефон, обява…"
          className="input w-full"
          autoComplete="off"
          enterKeyHint="search"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={startVoice}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 ${
              listening ? "animate-pulse text-crimson-600" : "text-slate-400 hover:text-brand-700"
            }`}
            aria-label={listening ? "Слушам…" : "Търсене с глас"}
            title={listening ? "Слушам…" : "Търсене с глас"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path
                d="M5 11a7 7 0 0014 0M12 18v3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
      <button
        type="submit"
        className={compact ? "btn-secondary px-3" : "btn-primary"}
        aria-label="Търси"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="M20 20l-3.5-3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {!compact && <span>Търси</span>}
      </button>
    </form>
  );
}
