import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Panel, cn } from "../../ui";
import { useAuthStore } from "../../lib/store";
import { isAdmin } from "../../app/RequireRole";
import { adminApi, type AdminAnnouncement } from "./adminApi";
import { ErrorPanel, errorMessage, useLoad } from "./load";

const field =
  "rounded-card border border-brass-400/20 bg-felt-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brass-300";

/** In-app announcements editor (§14, ADMIN/OWNER). Player-facing banner content,
 *  separate from the Discord broadcast. */
export function AdminAnnouncements() {
  const { t, i18n } = useTranslation();
  const meRole = useAuthStore((s) => s.user?.role);
  const canWrite = isAdmin(meRole);

  const { data, error, loading, reload } = useLoad(() => adminApi.announcements(), []);
  const [rows, setRows] = useState<AdminAnnouncement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (data) setRows(data.items);
  }, [data]);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading) return <p className="text-ink-muted">{t("common.loading")}</p>;

  async function create() {
    if (!title.trim() || !body.trim()) return;
    setBusy("new");
    setNotice(null);
    try {
      const r = await adminApi.createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setRows((prev) => [r.announcement, ...prev]);
      setTitle("");
      setBody("");
      setExpiresAt("");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(a: AdminAnnouncement) {
    setBusy(a.id);
    setNotice(null);
    try {
      const r = await adminApi.setAnnouncementActive(a.id, !a.active);
      setRows((prev) => prev.map((x) => (x.id === a.id ? r.announcement : x)));
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <Panel className="flex flex-col gap-3">
          <h3 className="text-lg text-ink-100">{t("admin.annNew", "Нова обява")}</h3>
          <input
            className={field}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("admin.annTitle", "Заглавие")}
          />
          <textarea
            className={field}
            value={body}
            maxLength={2000}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("admin.annBody", "Текст на обявата")}
          />
          <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
            <span className="text-ink-muted">{t("admin.annExpires", "Изтича (по избор)")}</span>
            <input
              type="datetime-local"
              className={field}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <div>
            <Button loading={busy === "new"} disabled={!title.trim() || !body.trim()} onClick={create}>
              {t("admin.annPublish", "Публикувай")}
            </Button>
          </div>
        </Panel>
      ) : (
        <p className="text-sm text-ink-muted">{t("admin.readOnly")}</p>
      )}

      {rows.length === 0 ? (
        <Panel className="py-10 text-center text-ink-muted">{t("admin.annEmpty", "Няма обяви.")}</Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((a) => (
            <Panel key={a.id} className={cn("flex flex-wrap items-start justify-between gap-3", !a.active && "opacity-60")}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-100">{a.title}</span>
                  <Badge tone={a.active ? "brass" : "felt"}>
                    {a.active ? t("admin.annActive", "Активна") : t("admin.annInactive", "Спряна")}
                  </Badge>
                </div>
                <p className="mt-1 break-words text-sm text-ink-300">{a.body}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {new Date(a.createdAt).toLocaleString(i18n.language)}
                  {a.expiresAt ? ` · ${t("admin.annExpiresAt", "изтича")} ${new Date(a.expiresAt).toLocaleString(i18n.language)}` : ""}
                </p>
              </div>
              {canWrite ? (
                <Button variant="ghost" loading={busy === a.id} onClick={() => toggle(a)}>
                  {a.active ? t("admin.annDeactivate", "Спри") : t("admin.annActivate", "Пусни")}
                </Button>
              ) : null}
            </Panel>
          ))}
        </ul>
      )}

      {notice ? <p className="text-center text-sm text-loss">{notice}</p> : null}
    </div>
  );
}
