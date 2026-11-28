// frontend/src/components/backups/RestoreDialog.jsx
// Връщане от резервно копие: проверка → потвърждение с името на сървъра → старт → прогрес.
// Какво ще стане се казва ПРЕДИ натискането (Б11): колко ще се създаде, какво пречи и защо.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "../Modal";
import { preflightRestore, startRestore } from "../../api";
import { useT } from "../../contexts/I18nContext";
import { botInviteUrl } from "../../lib/invite";
import { backupError, fmtDate } from "./backupText";
import RestoreProgress from "./RestoreProgress";

const WARNINGS = new Set(["COMMUNITY_REQUIRED", "ROLE_LIMIT", "CHANNEL_LIMIT"]);
const BLOCKERS = new Set(["BOT_NOT_IN_SERVER", "BOT_NOT_ADMIN", "NOTHING_MISSING"]);

export default function RestoreDialog({ targetId, targetName, backup, onClose }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const [started, setStarted] = useState(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["restorePlan", targetId, backup.id],
    queryFn: () => preflightRestore(targetId, backup.id),
    retry: false,
    enabled: !started,
  });
  const plan = data?.plan;
  const start = useMutation({
    mutationFn: () => startRestore(targetId, backup.id),
    onSuccess: (r) => {
      setStarted(r.restore);
      qc.invalidateQueries({ queryKey: ["backups", targetId] });
    },
  });

  const nameOk = typed.trim().toLowerCase() === String(targetName || "").trim().toLowerCase() && typed.trim() !== "";
  const canStart = plan && plan.blockers.length === 0 && nameOk && !start.isPending;

  return (
    <Modal open onClose={onClose} title={t("restore.title")} maxWidth="max-w-xl">
      <p className="text-sm text-cs-muted mb-4">
        {t("restore.from", { name: backup.guildName, date: fmtDate(backup.createdAt, lang) })}
      </p>

      {started ? (
        <RestoreProgress targetId={targetId} restore={started} />
      ) : isLoading ? (
        <p className="text-sm text-cs-muted" role="status">{t("restore.checking")}</p>
      ) : isError ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-danger">{backupError(error, t)}</p>
          <button type="button" className="cs-btn-secondary" onClick={() => refetch()} disabled={isFetching}>{t("common.retry")}</button>
        </div>
      ) : plan ? (
        <div className="space-y-4">
          <p className="text-sm text-cs-text leading-relaxed">{t(plan.mode === "SAME" ? "restore.modeSame" : "restore.modeNew")}</p>
          <p className="text-sm text-cs-text">{t("restore.willCreate", { roles: plan.roles.toCreate, channels: plan.channels.toCreate })}</p>
          {plan.mode === "SAME" && (plan.roles.existing > 0 || plan.channels.existing > 0) && (
            <p className="text-sm text-cs-muted">{t("restore.existing", { roles: plan.roles.existing, channels: plan.channels.existing })}</p>
          )}

          {plan.blockers.filter((b) => BLOCKERS.has(b)).map((b) => (
            <div key={b} className="border border-danger/40 bg-danger/5 rounded-lg px-3 py-2 text-sm text-danger" role="alert">
              <p>{t(`restore.blocker.${b}`)}</p>
              {(b === "BOT_NOT_ADMIN" || b === "BOT_NOT_IN_SERVER") && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <a className="cs-btn-secondary cs-btn-sm" href={botInviteUrl(targetId, { restore: true })} target="_blank" rel="noopener noreferrer">
                    {t("restore.inviteAdmin")}
                  </a>
                  <button type="button" className="cs-btn-ghost cs-btn-sm" onClick={() => refetch()} disabled={isFetching}>{t("restore.recheck")}</button>
                </div>
              )}
            </div>
          ))}
          {plan.warnings.filter((w) => WARNINGS.has(w.code)).map((w) => (
            <p key={w.code} className="border border-warning/40 bg-warning/5 rounded-lg px-3 py-2 text-sm text-warning">
              {t(`restore.warning.${w.code}`, { count: w.count })}
            </p>
          ))}

          {plan.blockers.length === 0 && (
            <div>
              <label className="cs-label" htmlFor="restore-confirm">{t("restore.confirmLabel", { name: targetName })}</label>
              <input id="restore-confirm" className="cs-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
          )}
          {start.isError && <p className="text-sm text-danger" role="alert">{backupError(start.error, t)}</p>}

          <div className="flex justify-end gap-3 pt-2 border-t border-cs-border">
            <button type="button" className="cs-btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
            <button type="button" className="cs-btn-primary" disabled={!canStart} onClick={() => start.mutate()}>
              {start.isPending ? t("restore.starting") : t("restore.start")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
