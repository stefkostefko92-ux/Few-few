// frontend/src/components/backups/backupText.js
// Общите малки помощници за резервните копия — грешка от сървъра като преведен текст и дата.

const KNOWN = new Set([
  "BACKUP_LIMIT", "BACKUP_COOLDOWN", "BOT_UNAVAILABLE",
  "RESTORE_RUNNING", "ADMIN_REQUIRED", "OWN_RIGHTS_REQUIRED", "NOT_FOUND", "RESTORE_BLOCKED", "NOT_RUNNING",
]);

/** Кодът от backend-а → преведен текст; непознатото → общото „опитай пак“. */
export function backupError(err, t) {
  const d = err?.response?.data || {};
  if (!KNOWN.has(d.code)) return t("backups.error.generic");
  return t(`backups.error.${d.code}`, {
    limit: d.limit ?? "",
    minutes: Math.max(1, Math.ceil((d.retryAfterSec || 60) / 60)),
  });
}

export const fmtDate = (d, lang) => (d ? new Date(d).toLocaleString(lang || undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

export const isActive = (r) => r && (r.status === "PENDING" || r.status === "RUNNING");
