"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageCircle, X, Send, RefreshCw } from "@/components/icons";
import { linkifySegments } from "@/lib/linkify";

type Msg = {
  role: "user" | "bot";
  text: string;
  sources?: { title: string; url: string }[];
};

const STORAGE_KEY = "zd_chat_v2";

const GREETING: Msg = {
  role: "bot",
  text:
    "Здравейте! Аз съм дигиталният помощник на Дупница. Попитайте ме за " +
    "телефон, услуга или как да свършите нещо онлайн — отговарям спокойно и " +
    "стъпка по стъпка.",
};

const SUGGESTIONS = [
  "Телефон на общината",
  "Дежурна аптека",
  "Как да платя данък онлайн",
  "Кога идва еврото",
  "Пенсия и помощ за отопление",
  "Пази се от телефонни измами",
];

// Рендира текста на помощника, като прави телефоните и имейлите кликаеми.
function BotText({ text }: { text: string }) {
  return (
    <>
      {linkifySegments(text).map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        return (
          <a
            key={i}
            href={seg.href}
            className="font-semibold text-brand-700 underline underline-offset-2"
          >
            {seg.text}
          </a>
        );
      })}
    </>
  );
}

export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Възстановяване на разговора в рамките на сесията.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Msg[];
        if (Array.isArray(saved) && saved.length) setMessages(saved);
      }
    } catch {
      /* без възстановяване */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* без запис */
    }
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, loading]);

  const ask = useCallback(
    async (q: string) => {
      if (q.length < 2 || loading) return;
      // Историята е разговорът ДО този въпрос (без началния поздрав).
      const history = messages
        .filter((m, i) => !(i === 0 && m === GREETING))
        .map((m) => ({ role: m.role, text: m.text }));

      setMessages((m) => [...m, { role: "user", text: q }, { role: "bot", text: "" }]);
      setInput("");
      setLoading(true);

      const setLastBot = (fn: (prev: Msg) => Msg) =>
        setMessages((m) => {
          const copy = [...m];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "bot") {
              copy[i] = fn(copy[i]);
              break;
            }
          }
          return copy;
        });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: q, history }),
        });

        // Грешки (429/400/500) се връщат като обикновен JSON.
        const ctype = res.headers.get("content-type") || "";
        if (!res.ok || !res.body || ctype.includes("application/json")) {
          const data = await res.json().catch(() => ({}));
          setLastBot((p) => ({
            ...p,
            text: data.answer || "Извинявам се, възникна грешка. Опитайте отново.",
            sources: data.sources,
          }));
          return;
        }

        // Поточно четене на NDJSON.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let acc = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let evt: {
              type: string;
              text?: string;
              sources?: { title: string; url: string }[];
              message?: string;
            };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.type === "delta" && evt.text) {
              acc += evt.text;
              setLastBot((p) => ({ ...p, text: acc }));
            } else if (evt.type === "sources" && evt.sources) {
              setLastBot((p) => ({ ...p, sources: evt.sources }));
            } else if (evt.type === "error") {
              if (!acc) {
                setLastBot((p) => ({
                  ...p,
                  text: evt.message || "Възникна грешка. Опитайте отново.",
                }));
              }
            }
          }
        }
        if (!acc) {
          setLastBot((p) => ({
            ...p,
            text: "Извинявам се, не получих отговор. Опитайте отново.",
          }));
        }
      } catch {
        setLastBot((p) => ({
          ...p,
          text: "Извинявам се, възникна грешка. Опитайте отново след малко.",
        }));
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, messages],
  );

  function send(e: React.FormEvent) {
    e.preventDefault();
    ask(input.trim());
  }

  function reset() {
    setMessages([GREETING]);
    setInput("");
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* няма какво да чистим */
    }
    inputRef.current?.focus();
  }

  if (pathname?.startsWith("/admin")) return null;

  const showSuggestions = !loading && messages.length <= 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="no-print fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800"
        aria-label={open ? "Затвори помощника" : "Отвори дигиталния помощник"}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-6 w-6" aria-hidden />}
      </button>

      {open && (
        <div
          className="no-print fixed bottom-20 right-4 z-50 flex h-[32rem] max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-label="Дигитален помощник"
        >
          <div className="flex items-center justify-between gap-2 bg-brand-700 px-4 py-3 text-white">
            <div>
              <div className="font-semibold">Дигитален помощник</div>
              <div className="text-xs text-brand-100">Дупница · отговаря веднага</div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg p-1.5 text-brand-100 hover:bg-brand-800 hover:text-white"
              aria-label="Нов разговор"
              title="Нов разговор"
            >
              <RefreshCw className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div
            className="flex-1 space-y-3 overflow-y-auto p-3"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={
                    "inline-block max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed " +
                    (m.role === "user"
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-800")
                  }
                >
                  {m.role === "bot" ? <BotText text={m.text} /> : m.text}
                  {m.role === "bot" && m.text === "" && loading && (
                    <span className="text-slate-400">пише…</span>
                  )}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-left text-sm">
                    {m.sources.map((s) => (
                      <Link
                        key={s.url}
                        href={s.url}
                        className="block font-medium text-brand-700 hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        → {s.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {showSuggestions && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Напишете въпрос…"
              className="input"
              aria-label="Въпрос към помощника"
              enterKeyHint="send"
            />
            <button
              type="submit"
              className="btn-primary px-3"
              disabled={loading || input.trim().length < 2}
              aria-label="Изпрати"
            >
              <Send className="h-5 w-5" aria-hidden />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
