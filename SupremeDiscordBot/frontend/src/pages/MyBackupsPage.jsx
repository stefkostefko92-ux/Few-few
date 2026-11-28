// frontend/src/pages/MyBackupsPage.jsx
// „Моите резервни копия“ — извън конкретен сървър, защото точно когато трябва, сървърът го няма
// (docs/BACKUP_SPEC.md, Б9–Б10). Показва копията на сървърите, на които човекът е собственик, и
// ги връща в нов сървър, в който вече е поканен ботът.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "../components/PageHeader";
import { getMyBackups, getServers } from "../api";
import { useT } from "../contexts/I18nContext";
import { botInviteUrl } from "../lib/invite";
import RestoreDialog from "../components/backups/RestoreDialog";
import { fmtDate } from "../components/backups/backupText";

export default function MyBackupsPage() {
  const { t, lang } = useT();
  const [target, setTarget] = useState({});
  const [restore, setRestore] = useState(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["myBackups"], queryFn: getMyBackups });
  const { data: servers = [] } = useQuery({ queryKey: ["servers"], queryFn: getServers });
  const targets = (servers || []).filter((s) => s.botAdded);
  const groups = data?.servers || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <PageHeader title={t("nav.myBackups")} subtitle={t("mine.intro")} />

      <ol className="cs-card mb-6 list-decimal list-outside pl-12 space-y-1 text-sm text-cs-text">
        <li>{t("mine.step1")}</li>
        <li>
          {t("mine.step2")}{" "}
          <a className="text-cs-cyan underline" href={botInviteUrl(null, { restore: true })} target="_blank" rel="noopener noreferrer">{t("restore.inviteAdmin")}</a>
        </li>
        <li>{t("mine.step3")}</li>
      </ol>

      {isLoading ? (
        <div className="cs-card h-32 animate-pulse" role="status"><span className="sr-only">{t("common.loading")}</span></div>
      ) : isError ? (
        <div className="cs-card" role="alert">
          <p className="text-sm text-danger">{t("backups.error.generic")}</p>
          <button type="button" className="cs-btn-secondary mt-3" onClick={() => refetch()}>{t("common.retry")}</button>
        </div>
      ) : groups.length === 0 ? (
        <div className="cs-card text-sm text-cs-muted">{t("mine.empty")}</div>
      ) : (
        <ul className="space-y-4">
          {groups.map((g) => (
            <li key={g.serverId} className="cs-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h2 className="text-base font-semibold text-cs-text break-words min-w-0">{g.name}</h2>
                <span className={g.botPresent ? "cs-badge-success" : "cs-badge-danger"}>{g.botPresent ? t("mine.botHere") : t("mine.botGone")}</span>
              </div>
              {g.botPresent && (
                <p className="text-sm mb-3">
                  <Link className="text-cs-cyan underline" to={`/dashboard/${g.serverId}/backups`}>{t("mine.openServer")}</Link>
                </p>
              )}
              <ul className="divide-y divide-cs-border">
                {g.backups.map((b) => (
                  <li key={b.id} className="py-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-cs-text">{fmtDate(b.createdAt, lang)} · {t(`backups.kind.${b.kind}`)}</p>
                      <p className="text-xs text-cs-muted">{t("backups.counts", { roles: b.roleCount, categories: b.categoryCount, channels: b.channelCount })}</p>
                      {b.expiresAt && <p className="text-xs text-warning">{t("backups.expires", { date: fmtDate(b.expiresAt, lang) })}</p>}
                    </div>
                    {targets.length === 0 ? (
                      <p className="text-xs text-cs-muted max-w-xs">{t("mine.noTargets")}</p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="cs-label" htmlFor={`target-${b.id}`}>{t("mine.target")}</label>
                          <select id={`target-${b.id}`} className="cs-input" value={target[b.id] || ""} onChange={(e) => setTarget({ ...target, [b.id]: e.target.value })}>
                            <option value="">{t("mine.pickTarget")}</option>
                            {targets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="cs-btn-secondary"
                          disabled={!target[b.id]}
                          onClick={() => setRestore({ backup: b, target: targets.find((s) => s.id === target[b.id]) })}
                        >
                          {t("backups.restore")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {restore && (
        <RestoreDialog
          targetId={restore.target.id}
          targetName={restore.target.name}
          backup={restore.backup}
          onClose={() => setRestore(null)}
        />
      )}
    </div>
  );
}
