import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Panel, cn } from "../../ui";
import { useAuthStore } from "../../lib/store";
import { isAdmin } from "../../app/RequireRole";
import { adminApi, type AdminSeason } from "./adminApi";
import { ConfirmButton } from "./ConfirmButton";
import { ErrorPanel, errorMessage, useLoad } from "./load";

const field =
  "rounded-card border border-brass-400/20 bg-felt-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brass-300";

/** ISO → стойност за `<input type="datetime-local">` (местно време). */
export const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
/** `datetime-local` (местно време) → ISO; празно → undefined. */
export const fromLocalInput = (v: string): string | undefined => (v ? new Date(v).toISOString() : undefined);

/** Сезони (§12): списък, нов, смяна на датите, активиране (единствен активен), изтриване. */
export function AdminSeasons() {
  const { t, i18n } = useTranslation();
  const canWrite = isAdmin(useAuthStore((s) => s.user?.role));
  const { data, error, loading, reload } = useLoad(() => adminApi.seasons(), []);
  const [rows, setRows] = useState<AdminSeason[]>([]);
  const [index, setIndex] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setRows(data.items);
      const max = data.items.reduce((m, s) => Math.max(m, s.index), 0);
      setIndex(String(max + 1));
    }
  }, [data]);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading && !data) return <p className="text-ink-muted">{t("common.loading")}</p>;

  async function run(key: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: "ok", text: okText });
      setEditId(null);
      reload();
    } catch (e) {
      setNotice({ tone: "err", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language);
  const now = Date.now();
  const createValid = Number(index) >= 1 && startsAt && endsAt && new Date(endsAt) > new Date(startsAt);

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <Panel className="flex flex-col gap-3">
          <h3 className="text-lg text-ink-100">{t("admin.seasonNew", "Нов сезон")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.seasonIndex", "Номер")}</span>
              <input type="number" min={1} className={field} value={index} onChange={(e) => setIndex(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.seasonStarts", "Начало")}</span>
              <input type="datetime-local" className={field} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">{t("admin.seasonEnds", "Край")}</span>
              <input type="datetime-local" className={field} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-ink-muted">
            {t("admin.seasonHint", "Новият сезон е неактивен, докато не го активираш. Активен може да е само един.")}
          </p>
          <div>
            <Button
              loading={busy === "new"}
              disabled={!createValid}
              onClick={() =>
                run(
                  "new",
                  () =>
                    adminApi.createSeason({
                      index: Number(index),
                      startsAt: fromLocalInput(startsAt)!,
                      endsAt: fromLocalInput(endsAt)!,
                    }),
                  t("admin.saved"),
                ).then(() => {
                  setStartsAt("");
                  setEndsAt("");
                })
              }
            >
              {t("admin.seasonCreate", "Създай сезон")}
            </Button>
          </div>
        </Panel>
      ) : (
        <p className="text-sm text-ink-muted">{t("admin.readOnly")}</p>
      )}

      {notice ? (
        <p className={cn("text-center text-sm", notice.tone === "ok" ? "text-win" : "text-loss")}>{notice.text}</p>
      ) : null}

      {rows.length === 0 ? (
        <Panel className="py-10 text-center text-ink-muted">{t("admin.seasonsEmpty", "Няма сезони.")}</Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => {
            const current = new Date(s.startsAt).getTime() <= now && new Date(s.endsAt).getTime() > now;
            const ended = new Date(s.endsAt).getTime() <= now;
            return (
              <Panel key={s.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg text-ink-100">
                      {t("admin.seasonLabel", "Сезон")} {s.index}
                    </span>
                    {s.active ? <Badge tone="brass">{t("admin.seasonActive", "Активен")}</Badge> : null}
                    {current && !s.active ? <Badge tone="felt">{t("admin.seasonCurrent", "Текущ период")}</Badge> : null}
                    {ended ? <Badge tone="felt">{t("admin.seasonEnded", "Приключил")}</Badge> : null}
                  </div>
                  <span className="text-xs text-ink-muted">
                    {fmt(s.startsAt)} → {fmt(s.endsAt)}
                  </span>
                </div>

                {canWrite && editId === s.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs text-ink-muted">
                      {t("admin.seasonStarts", "Начало")}
                      <input type="datetime-local" className={field} value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-ink-muted">
                      {t("admin.seasonEnds", "Край")}
                      <input type="datetime-local" className={field} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                    </label>
                    <Button
                      loading={busy === s.id}
                      onClick={() =>
                        run(
                          s.id,
                          () => adminApi.updateSeason(s.id, { startsAt: fromLocalInput(editStart), endsAt: fromLocalInput(editEnd) }),
                          t("admin.saved"),
                        )
                      }
                    >
                      {t("admin.save")}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditId(null)}>
                      {t("admin.cancel", "Отказ")}
                    </Button>
                  </div>
                ) : canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditId(s.id);
                        setEditStart(toLocalInput(s.startsAt));
                        setEditEnd(toLocalInput(s.endsAt));
                      }}
                    >
                      {t("admin.edit", "Редактирай")}
                    </Button>
                    {!s.active && !ended ? (
                      <Button
                        variant="felt"
                        loading={busy === s.id}
                        onClick={() => run(s.id, () => adminApi.activateSeason(s.id), t("admin.saved"))}
                      >
                        {t("admin.seasonActivate", "Активирай")}
                      </Button>
                    ) : null}
                    {!s.active && !current ? (
                      <ConfirmButton
                        label={t("admin.delete", "Изтрий")}
                        busy={busy === s.id}
                        onConfirm={() => void run(s.id, () => adminApi.deleteSeason(s.id), t("admin.deleted", "Изтрито."))}
                      />
                    ) : null}
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </ul>
      )}
    </div>
  );
}
