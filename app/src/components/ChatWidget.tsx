"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content:
    "Здравейте! Мога да помогна с информация за Дупница — телефони, услуги, дежурна аптека и др. С какво да помогна?",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // изпращаме само последните няколко реплики, без поздрава
          messages: next.slice(-12).filter((m, i) => !(i === 0 && m === GREETING)),
        }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? "Грешка." },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Връзката се разпадна. Опитайте пак." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="no-print">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-brand-700 px-5 py-3 font-semibold text-white shadow-lg hover:bg-brand-800"
          aria-label="Отвори помощника"
        >
          💬 Попитай
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[32rem] w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-brand-700 px-4 py-3 text-white">
            <span className="font-display font-bold">Помощник за Дупница</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Затвори"
              className="text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <span
                  className={
                    "inline-block max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-base " +
                    (m.role === "user"
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-800")
                  }
                >
                  {m.content}
                </span>
              </div>
            ))}
            {pending && (
              <div className="text-left">
                <span className="inline-block rounded-2xl bg-slate-100 px-3 py-2 text-slate-500">
                  пише…
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-slate-200 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Напишете въпрос…"
              className="input"
              aria-label="Съобщение"
            />
            <button type="submit" className="btn-primary" disabled={pending}>
              Прати
            </button>
          </form>
          <p className="px-3 pb-2 text-center text-xs text-slate-400">
            Може да греши. При спешност: 112.
          </p>
        </div>
      )}
    </div>
  );
}
