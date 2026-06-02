import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CHAT_MAX_LEN } from "@aso/shared";
import { useMatchStore } from "../../../lib/store";
import { useChat } from "./useChat";

/**
 * In-match chat, mounted once in GameView so it appears in every game. Reads the
 * active match from the store, so no per-view wiring is needed. Collapsible, with
 * per-opponent mute and tap-to-send quick phrases.
 */
export function ChatDock() {
  const { t } = useTranslation();
  const matchId = useMatchStore((s) => s.matchId);
  const mySeat = useMatchStore((s) => s.seat);
  const players = useMatchStore((s) => s.players);
  const phase = useMatchStore((s) => s.phase);

  const { messages, send, muted, toggleMute } = useChat(matchId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const seenRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Track unread while collapsed; clear when opened.
  useEffect(() => {
    if (open) {
      seenRef.current = messages.length;
      setUnread(0);
    } else {
      setUnread(messages.length - seenRef.current);
    }
  }, [messages.length, open]);

  // Auto-scroll to newest when open.
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, open]);

  const opponents = useMemo(
    () => players.filter((p) => p.seat !== mySeat && !p.isBot),
    [players, mySeat],
  );

  const quick = useMemo(
    () => [
      t("chat.quick.hi"),
      t("chat.quick.gl"),
      t("chat.quick.nice"),
      t("chat.quick.gg"),
      t("chat.quick.oops"),
      t("chat.quick.thanks"),
    ],
    [t],
  );

  // Hidden until a match is live.
  if (!matchId || phase === "searching") return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    send(v);
    setText("");
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open ? (
        <div
          className="flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-panel border border-brass-400/25 shadow-lift"
          style={{ backgroundColor: "#0a120e" }}
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-brass-400/15 px-3 py-2">
            <span className="text-sm font-semibold text-brass-300">{t("chat.title")}</span>
            <div className="flex items-center gap-2">
              {opponents.map((o) => (
                <button
                  key={o.seat}
                  type="button"
                  onClick={() => toggleMute(o.seat)}
                  title={muted.has(o.seat) ? t("chat.unmute") : t("chat.mute")}
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    muted.has(o.seat)
                      ? "text-loss"
                      : "text-ink-muted hover:text-ink-100"
                  }`}
                >
                  {muted.has(o.seat) ? "🔇" : "🔊"} {o.displayName.slice(0, 8)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("common.dismiss")}
                className="text-ink-muted hover:text-ink-100"
              >
                ✕
              </button>
            </div>
          </div>

          {/* messages */}
          <div ref={listRef} className="flex h-56 flex-col gap-1.5 overflow-y-auto px-3 py-2">
            {messages.length === 0 ? (
              <p className="m-auto text-center text-xs text-ink-muted">{t("chat.empty")}</p>
            ) : (
              messages.map((m, i) => {
                const mine = m.seat === mySeat;
                return (
                  <div key={i} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    {!mine ? (
                      <span className="px-1 text-[10px] text-ink-muted">{m.displayName}</span>
                    ) : null}
                    <span
                      className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                        mine
                          ? "bg-brass-400/90 text-charcoal-900"
                          : "bg-felt-700 text-ink-100"
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* quick phrases */}
          <div className="flex flex-wrap gap-1 border-t border-brass-400/10 px-2 py-1.5">
            {quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="rounded-full border border-brass-400/20 px-2 py-0.5 text-xs text-ink-300 hover:border-brass-300 hover:text-brass-100"
              >
                {q}
              </button>
            ))}
          </div>

          {/* input */}
          <form onSubmit={submit} className="flex items-center gap-2 border-t border-brass-400/15 p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={CHAT_MAX_LEN}
              placeholder={t("chat.placeholder")}
              className="flex-1 rounded-card border border-brass-400/20 bg-felt-900/60 px-3 py-1.5 text-sm text-ink-100 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brass-300"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="rounded-card bg-gradient-to-b from-brass-300 to-brass-400 px-3 py-1.5 text-sm font-semibold text-charcoal-900 disabled:opacity-50"
            >
              {t("chat.send")}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 rounded-full border border-brass-400/30 bg-felt-800/90 px-4 py-2 text-sm font-semibold text-brass-300 shadow-lift backdrop-blur hover:border-brass-300"
      >
        💬 {t("chat.title")}
        {!open && unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-loss px-1 text-xs font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    </div>
  );
}
