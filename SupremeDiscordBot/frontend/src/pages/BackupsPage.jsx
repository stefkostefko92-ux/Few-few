// frontend/src/pages/BackupsPage.jsx
// Резервни копия на сървъра — група „Защита“ (docs/BACKUP_SPEC.md).
// Едно място за трите неща, които човек прави тук: копие сега, какво има в копието, връщане.
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/PageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import { getBackups, createBackup, deleteBackup, getServer } from "../api";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import BackupSummary from "../components/backups/BackupSummary";
import RestoreDialog from "../components/backups/RestoreDialog";
import RestoreProgress from "../components/backups/RestoreProgress";
import { backupError, fmtDate, isActive } from "../components/backups/backupText";

export default function BackupsPage() {
  const { t, lang } = useT();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [openId, setOpenId] = useState(null);
  const [restoreOf, setRestoreOf] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["backups", serverId], queryFn: () => getBackups(serverId) });
  const { data: server } = useQuery({ queryKey: ["server", serverId], queryFn: () => getServer(serverId) });
  const reload = () => qc.invalidateQueries({ queryKey: ["backups", serverId] });

  const create = useMutation({
    mutationFn: () => createBackup(serverId),
    onSuccess: () => { toast.success(t("backups.created")); reload(); },
    onError: (e) => toast.error(backupError(e, t)),
  });
  const remove = useMutation({
    mutationFn: (id) => deleteBackup(serverId, id),
    onSuccess: () => { toast.success(t("backups.deleted")); setDeleting(null); reload(); },
    onError: (e) => { setDeleting(null); toast.error(backupError(e, t)); },
  });

  const limits = data?.limits;
  const usage = data?.usage;
  const backups = data?.backups || [];
  const last = data?.lastRestore;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <PageHeader
        title={t("nav.backups")}
        subtitle={t("backups.intro")}
        actions={(
          <button type="button" className="cs-btn-primary" onClick={() => create.mutate()} disabled={create.isPending || isLoading}>
            {create.isPending ? t("backups.creating") : t("backups.create")}
          </button>
        )}
      />

      <div className="cs-card mb-6 space-y-2 text-sm">
        <p className="text-cs-text">{t("backups.included")}</p>
        <p className="text-cs-muted">{t("backups.notIncluded")}</p>
        {limits && usage && (
          <p className="text-cs-muted pt-2">
            {t("backups.usage", { used: usage.manual, limit: limits.manual })}{" "}
            {limits.autoEveryDays === 1 ? t("backups.autoEveryDay") : t("backups.autoEvery", { days: limits.autoEveryDays })}{" "}
            {t("backups.autoKeep", { keep: limits.autoKeep })}
          </p>
        )}
        <p className="text-cs-muted">
          {t("backups.deletedServerHint")}{" "}
          <Link to="/dashboard/backups" className="text-cs-cyan underline">{t("nav.myBackups")}</Link>
        </p>
      </div>

      {last && (
        <section className="cs-card mb-6" aria-labelledby="last-restore">
          <h2 id="last-restore" className="text-base font-semibold text-cs-text mb-3">{t("restore.lastTitle")}</h2>
          <RestoreProgress key={last.id} targetId={serverId} restore={last} />
        </section>
      )}

      {isLoading ? (
        <div className="cs-card h-32 animate-pulse" role="status"><span className="sr-only">{t("common.loading")}</span></div>
      ) : isError ? (
        <div className="cs-card" role="alert">
          <p className="text-sm text-danger">{t("backups.error.generic")}</p>
          <button type="button" className="cs-btn-secondary mt-3" onClick={() => refetch()}>{t("common.retry")}</button>
        </div>
      ) : backups.length === 0 ? (
        <div className="cs-card text-sm text-cs-muted">{t("backups.empty")}</div>
      ) : (
        <ul className="space-y-3">
          {backups.map((b) => (
            <li key={b.id} className="cs-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cs-text font-semibold">{fmtDate(b.createdAt, lang)}</p>
                  <p className="text-sm text-cs-muted">
                    <span className={b.kind === "AUTO" ? "cs-badge-cyan" : "cs-badge-manual"}>{t(`backups.kind.${b.kind}`)}</span>{" "}
                    {t("backups.counts", { roles: b.roleCount, categories: b.categoryCount, channels: b.channelCount })}
                  </p>
                  {b.expiresAt && <p className="text-xs text-warning mt-1">{t("backups.expires", { date: fmtDate(b.expiresAt, lang) })}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="cs-btn-ghost cs-btn-sm" aria-expanded={openId === b.id} onClick={() => setOpenId(openId === b.id ? null : b.id)}>
                    {openId === b.id ? t("backups.hide") : t("backups.view")}
                  </button>
                  <button type="button" className="cs-btn-secondary cs-btn-sm" onClick={() => setRestoreOf(b)} disabled={isActive(last)}>
                    {t("backups.restore")}
                  </button>
                  <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" onClick={() => setDeleting(b)}>
                    {t("backups.delete")}
                  </button>
                </div>
              </div>
              {openId === b.id && <div className="mt-4 pt-4 border-t border-cs-border"><BackupSummary serverId={serverId} backupId={b.id} /></div>}
            </li>
          ))}
        </ul>
      )}

      {restoreOf && (
        <RestoreDialog
          targetId={serverId}
          targetName={server?.name || restoreOf.guildName}
          backup={restoreOf}
          onClose={() => { setRestoreOf(null); reload(); }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={t("backups.deleteTitle")}
        message={deleting ? t("backups.deleteBody", { date: fmtDate(deleting.createdAt, lang) }) : ""}
        confirmLabel={t("backups.delete")}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
