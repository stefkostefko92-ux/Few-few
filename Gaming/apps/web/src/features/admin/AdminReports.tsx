import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Panel, cn } from "../../ui";
import { useAuthStore } from "../../lib/store";
import { adminApi, type ChatReportItem } from "./adminApi";
import { ErrorPanel, errorMessage } from "./load";
import { UserDetailModal } from "./AdminUsers";

const STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
const TRIAGE = new Set(["MODERATOR", "ADMIN", "OWNER"]); // SUPPORT is read-only

/** Chat reports moderation queue (list + resolve/dismiss/reopen). */
export function AdminReports() {
  const { t, i18n } = useTranslation();
  const meRole = useAuthStore((s) => s.user?.role);
  const canTriage = TRIAGE.has(meRole ?? "");

  const [status, setStatus] = useState<(typeof STATUSES)[number]>("OPEN");
  const [items, setItems] = useState<ChatReportItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  async function load(c?: string) {
    setLoading(true);
    if (!c) setError(null);
    try {
      const r = await adminApi.reports(status, c);
      setItems((prev) => (c ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    void load();
  }, [status]);

  async function review(id: string, next: "RESOLVED" | "DISMISSED" | "OPEN") {
    setBusy(id);
    try {
      await adminApi.resolveReport(id, next);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              status === s
                ? "border-brass-400/40 bg-brass-400/15 text-brass-300"
                : "border-brass-400/10 text-ink-300 hover:text-ink-100",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {error && items.length === 0 ? (
        <ErrorPanel error={error} onRetry={() => void load()} />
      ) : loading && items.length === 0 ? (
        <p className="text-ink-muted">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Panel className="py-10 text-center text-ink-muted">{t("admin.noReports", "Няма доклади.")}</Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r) => (
            <Panel key={r.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-100">
                  <Badge tone="felt">
                    {t("admin.match", "Мач")} {r.matchId.slice(0, 8)}…
                  </Badge>
                  {r.targetSeat !== null ? (
                    <Badge tone="felt">
                      {t("admin.seat", "Място")} {r.targetSeat}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-ink-muted">
                    {t("admin.reportedBy", "Докладвано от")}{" "}
                    <button
                      type="button"
                      className="text-brass-300 underline"
                      onClick={() => setOpenUser(r.fromUserId)}
                    >
                      {r.fromName ?? `${r.fromUserId.slice(0, 8)}…`}
                    </button>{" "}
                    · {new Date(r.createdAt).toLocaleString(i18n.language)}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-ink-300">{r.text}</p>
              </div>
              {canTriage ? (
                <div className="flex gap-2">
                  {r.status === "OPEN" ? (
                    <>
                      <Button variant="ghost" loading={busy === r.id} onClick={() => review(r.id, "DISMISSED")}>
                        {t("admin.dismiss")}
                      </Button>
                      <Button loading={busy === r.id} onClick={() => review(r.id, "RESOLVED")}>
                        {t("admin.resolve", "Реши")}
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" loading={busy === r.id} onClick={() => review(r.id, "OPEN")}>
                      {t("admin.reopen", "Отвори пак")}
                    </Button>
                  )}
                </div>
              ) : null}
            </Panel>
          ))}
        </ul>
      )}

      {error && items.length > 0 ? <p className="text-center text-sm text-loss">{errorMessage(error)}</p> : null}
      {cursor && !loading ? (
        <Button variant="ghost" onClick={() => void load(cursor)}>
          {t("admin.loadMore")}
        </Button>
      ) : null}

      {openUser ? (
        <UserDetailModal id={openUser} onClose={() => setOpenUser(null)} onChanged={() => undefined} />
      ) : null}
    </div>
  );
}
