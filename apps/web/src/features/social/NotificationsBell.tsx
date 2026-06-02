import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type NotificationItem } from "../../lib/api";

const POLL_MS = 30_000;

/** Header bell: unread count + a dropdown of recent notifications. */
export function NotificationsBell() {
  const { t } = useTranslation();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    api
      .notifications()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      api.notificationsRead().then(() => setUnread(0)).catch(() => undefined);
    }
  }

  function label(n: NotificationItem): string {
    if (n.type === "friend_request") return t("notif.friendRequest");
    if (n.type === "friend_accepted") return t("notif.friendAccepted");
    return t("notif.system");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t("notif.title")}
        className="relative grid size-9 place-items-center rounded-full border border-brass-400/20 text-ink-300 hover:border-brass-300 hover:text-ink-100"
      >
        🔔
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-panel border border-brass-400/20 bg-felt-900/95 p-2 shadow-lift backdrop-blur">
          <div className="px-2 py-1 text-xs uppercase tracking-wide text-ink-muted">{t("notif.title")}</div>
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-ink-muted">{t("notif.empty")}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-2 rounded-card px-2 py-2 text-sm ${
                    n.readAt ? "text-ink-300" : "text-ink-100"
                  }`}
                >
                  {!n.readAt ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brass-300" /> : <span className="mt-1.5 size-1.5 shrink-0" />}
                  <div>
                    <div>{label(n)}</div>
                    <div className="text-[11px] text-ink-muted">
                      {new Date(n.createdAt).toLocaleString("bg-BG")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
