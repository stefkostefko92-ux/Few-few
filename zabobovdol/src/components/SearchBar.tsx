"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "@/components/icons";
import { UI_LABEL } from "@/lib/ui-labels";

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

export function SearchBar({
  compact = false,
  initialQuery = "",
  onSearch,
}: {
  compact?: boolean;
  /** Търсеното досега — на /tarsene полето показва думата от адреса. */
  initialQuery?: string;
  /**
   * След изпращане (и с глас). В мобилното меню го затваря — на /tarsene
   * адресът сменя само ?q=, pathname остава и менюто иначе покрива резултатите.
   */
  onSearch?: () => void;
}) {
  const router = useRouter();
  // На страницата може да има няколко търсачки (хедър, герой, менюто) —
  // всяка със свой id, за да сочи <label> към своето поле.
  const id = useId();
  const [q, setQ] = useState(initialQuery);
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
    if (v.length < 2) return;
    router.push(`/tarsene?q=${encodeURIComponent(v)}`);
    onSearch?.();
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
      // Некомпактната търсачка (герой, меню, 404, /tarsene) е контейнер:
      // според ширината си в em сама решава дали бутонът е с надпис, само с
      // лупата или под полето (globals.css, .search-form).
      className={"flex w-full items-center gap-2" + (compact ? "" : " search-form flex-wrap")}
    >
      <label htmlFor={id} className="sr-only">
        Търсене в сайта
      </label>
      <div className="search-field relative min-w-0 flex-1">
        <input
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          // Кратко, за да се чете цяло и на телефон (дългото се режеше по
          // средата на дума); примери има в текста около полето.
          placeholder="Какво търсите?"
          // Отдясно стои бутонът за глас — оставяме му място, за да не минава
          // текстът под него на тесен екран.
          className={"input w-full" + (voiceSupported ? " pr-12" : "")}
          autoComplete="off"
          enterKeyHint="search"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={startVoice}
            className={`absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg ${
              listening ? "animate-pulse text-crimson-600" : "text-slate-600 hover:text-brand-700"
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
      {/* Когато полето стане твърде тясно, надписът „Търсете“ остава само за
          екранния четец (иначе подсказката се реже: „Каквс“), а още по-тясно
          бутонът минава под полето на цяла ширина — globals.css. */}
      <button
        type="submit"
        className={compact ? "search-submit btn-secondary px-3" : "search-submit btn-primary"}
        aria-label={UI_LABEL.search}
      >
        <Search className="h-5 w-5 shrink-0" aria-hidden />
        {!compact && <span className="search-submit-label">{UI_LABEL.search}</span>}
      </button>
    </form>
  );
}
