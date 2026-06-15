"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type Msg = {
  role: "user" | "bot";
  text: string;
  sources?: { title: string; url: string }[];
};

export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "bot",
      text:
        "Здравейте! Аз съм дигиталният помощник на Бобов дол. Попитайте ме за " +
        "телефон, услуга или как да свършите нещо онлайн.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  if (pathname?.startsWith("/admin")) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (q.length < 2 || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "bot", text: data.answer, sources: data.sources },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: "Извинявам се, възникна грешка. Опитайте отново след малко.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800"
        aria-label={open ? "Затвори помощника" : "Отвори помощника"}
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-label="Дигитален помощник"
        >
          <div className="bg-brand-700 px-4 py-3 text-white">
            <div className="font-semibold">Дигитален помощник</div>
            <div className="text-xs text-brand-100">Бобов дол · отговаря веднага</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <div
                  className={
                    "inline-block max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm " +
                    (m.role === "user"
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-800")
                  }
                >
                  {m.text}
                </div>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-left text-xs">
                    {m.sources.map((s) => (
                      <Link
                        key={s.url}
                        href={s.url}
                        className="block text-brand-700 hover:underline"
                      >
                        → {s.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-left text-sm text-slate-400">пише…</div>
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-2">
            <input
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
              disabled={loading}
              aria-label="Изпрати"
            >
              →
            </button>
          </form>
        </div>
      )}
    </>
  );
}
