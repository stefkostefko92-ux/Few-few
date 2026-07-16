import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type AnnouncementItem } from "../../lib/api";
import { useAuthStore } from "../../lib/store";

const DISMISS_KEY = "aso_dismissed_announcements";

/** Read the set of dismissed announcement ids (per-id, per-browser). */
function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Player-facing in-app announcement banner (§14). Shows the newest active,
 * unexpired announcement the player hasn't dismissed; dismissal is per-id and
 * stored in localStorage so it stays hidden across reloads. Distinct from the
 * email-verify nudge and the staff Discord broadcast.
 */
export function AnnouncementBanner() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let alive = true;
    api
      .announcements()
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return null;
  const current = items.find((a) => !dismissed.has(a.id));
  if (!current) return null;

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      // best-effort; a private-mode failure just re-shows on next load
    }
  }

  return (
    <div
      role="status"
      aria-label={t("announcements.label", "Обява")}
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-brass-400/20 bg-brass-300/10 px-4 py-2 text-center text-sm text-ink-100"
    >
      <span className="font-semibold text-brass-300">{current.title}</span>
      <span className="text-ink-200">{current.body}</span>
      <button
        type="button"
        onClick={() => dismiss(current.id)}
        aria-label={t("announcements.dismiss", "Затвори обявата")}
        className="text-ink-muted hover:text-ink-100"
      >
        ✕
      </button>
    </div>
  );
}
