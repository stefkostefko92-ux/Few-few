"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X, Send, RefreshCw } from "@/components/icons";
import { ChatFab } from "@/components/ChatFab";
import { linkifySegments } from "@/lib/linkify";

type Msg = {
  role: "user" | "bot";
  text: string;
  sources?: { title: string; url: string }[];
};

const STORAGE_KEY = "zbd_chat_v2";

const GREETING: Msg = {
  role: "bot",
  text:
    "Здравейте! Аз съм автоматизиран помощник с изкуствен интелект — не съм " +
    "човек. Попитайте ме за телефон, услуга или как да свършите нещо онлайн — " +
    "отговарям спокойно и стъпка по стъпка. Винаги проверявайте важното от " +
    "официален източник.",
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

// initialOpen: обвивката ChatWidgetLazy зарежда чата след клик и го отваря веднага.
export function ChatWidget({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(initialOpen);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(initialOpen);

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
    // Само поздравът — без превъртане: обявяването, че това е ИИ, остава
    // най-отгоре и се чете първо.
    if (messages.length <= 1) return;
    // Уважаваме „по-малко движение“ — без плавен скрол при reduced-motion.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, [messages, open, loading]);

  // Достъпност: при отваряне фокусът влиза в прозореца, Escape затваря, а
  // при затваряне фокусът се връща на плаващия бутон. На тъч екран полето НЕ
  // се фокусира само — клавиатурата би закрила половината панел и поздрава.
  // На телефон панелът е долен лист: страницата отдолу не се превърта.
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) fabRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    if (fine) inputRef.current?.focus();
    else dialogRef.current?.focus();
    const html = document.documentElement;
    html.classList.add("chat-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.classList.remove("chat-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      <ChatFab ref={fabRef} open={open} onClick={() => setOpen((v) => !v)} />

      {/* На телефон — затъмнена страница зад долния лист; докосване затваря. */}
      {open && (
        <div
          aria-hidden
          className="no-print fixed inset-0 z-50 bg-slate-900/40 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="chat-panel no-print fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-20 sm:right-4 sm:h-[32rem] sm:max-h-[calc(100dvh-6rem)] sm:w-[24rem] sm:rounded-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-title"
        >
          <div className="flex items-center gap-2 bg-brand-700 py-2 pl-4 pr-2 text-white">
            <div className="min-w-0 flex-1">
              <h2 id="chat-title" className="font-sans text-lg font-semibold leading-tight">
                Дигитален помощник
              </h2>
              <p className="text-sm leading-snug text-brand-100">
                Автоматизиран · с изкуствен интелект
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-brand-100 hover:bg-brand-800 hover:text-white"
              aria-label="Нов разговор"
              title="Нов разговор"
            >
              <RefreshCw className="h-5 w-5" aria-hidden />
            </button>
            {/* На телефон — с надпис (плаващият бутон е скрит под листа); от sm
                плаващият бутон отдолу също затваря, тук остава иконка 44px. */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/50 px-3 text-base font-semibold text-white hover:bg-brand-800 sm:px-0"
            >
              <X className="h-5 w-5" aria-hidden />
              <span className="sm:sr-only">Затворете</span>
            </button>
          </div>

          {/* Отделна, скрита зона за екранни четци: обявява ГОТОВИЯ отговор
              веднъж, вместо да чете потока буква по буква. */}
          <p className="sr-only" aria-live="polite">
            {!loading && messages[messages.length - 1]?.role === "bot"
              ? messages[messages.length - 1].text
              : ""}
          </p>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={
                    "inline-block max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-base leading-relaxed " +
                    (m.role === "user"
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-800")
                  }
                >
                  {m.role === "bot" ? <BotText text={m.text} /> : m.text}
                  {m.role === "bot" && m.text === "" && loading && (
                    <span className="text-slate-600">пише…</span>
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
                        <span aria-hidden="true">→ </span>
                        {s.title}
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
                    className="inline-flex min-h-[44px] items-center rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
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
          <p className="px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm leading-snug text-slate-600">
            Това е <strong>автоматизиран отговор от изкуствен интелект</strong>,
            не от човек, и може да греши. Не пишете пароли или лични данни.{" "}
            <Link href="/poveritelnost" className="underline hover:text-brand-700">
              Поверителност
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
