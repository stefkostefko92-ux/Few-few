// frontend/src/components/backups/RestoreProgress.jsx
// Прогресът на едно възстановяване — чете се на живо, докато тече (Б14).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRestore, cancelRestore } from "../../api";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";
import { backupError, fmtDate, isActive } from "./backupText";

const WARN_KEYS = new Set(["TYPE_FALLBACK", "PARENT_MISSING", "BOT_NOT_ADMIN", "BOT_NOT_IN_SERVER", "BACKUP_GONE"]);

export default function RestoreProgress({ targetId, restore: initial }) {
  const { t, lang } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["restore", targetId, initial.id],
    queryFn: () => getRestore(targetId, initial.id),
    initialData: { restore: initial },
    refetchInterval: (q) => (isActive(q.state.data?.restore) ? 2500 : false),
  });
  const r = data?.restore || initial;
  const stop = useMutation({
    mutationFn: () => cancelRestore(targetId, r.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restore", targetId, r.id] }),
    onError: (e) => toast.error(backupError(e, t)),
  });

  const c = r.counts || {};
  const total = (c.planned?.roles || 0) + (c.planned?.channels || 0);
  const done = (c.rolesCreated || 0) + (c.channelsCreated || 0);
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : (r.status === "DONE" ? 100 : 0);
  const warnings = Array.isArray(r.warnings) ? r.warnings : [];
  const tone = r.status === "DONE" ? "text-success" : r.status === "FAILED" ? "text-danger" : "text-cs-text";

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`font-semibold ${tone}`}>{t(`restore.status.${r.status}`)}</p>
        <p className="text-xs text-cs-dim">{fmtDate(r.startedAt || r.createdAt, lang)}</p>
      </div>
      <div className="h-2 rounded-full bg-cs-panel overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("restore.progress", { done, total })}>
        <div className="h-full bg-cs-cyan transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-cs-muted">{t("restore.progress", { done, total })}</p>
      {!isActive(r) && (
        <p className="text-sm text-cs-muted">
          {t("restore.result", { roles: c.rolesCreated || 0, channels: c.channelsCreated || 0, failed: c.failed || 0 })}
        </p>
      )}
      {warnings.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-cs-muted">{t("restore.warningsTitle")} ({warnings.length})</summary>
          <ul className="mt-2 space-y-1 text-cs-dim">
            {warnings.slice(0, 50).map((w, i) => (
              <li key={i}>
                {WARN_KEYS.has(w.code)
                  ? t(`restore.warn.${w.code}`, { name: w.name || "" })
                  : t("restore.warn.other", { name: w.name || "", code: w.code })}
              </li>
            ))}
          </ul>
        </details>
      )}
      {isActive(r) && (
        <button type="button" className="cs-btn-secondary" onClick={() => stop.mutate()} disabled={stop.isPending}>
          {t("restore.cancel")}
        </button>
      )}
    </div>
  );
}
