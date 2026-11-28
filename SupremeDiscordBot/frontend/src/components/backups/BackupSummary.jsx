// frontend/src/components/backups/BackupSummary.jsx
// Какво има в едно копие: категориите с каналите им и ролите — само имена (Б2).
import { useQuery } from "@tanstack/react-query";
import { getBackupSummary } from "../../api";
import { useT } from "../../contexts/I18nContext";

const hex = (n) => `#${Number(n || 0).toString(16).padStart(6, "0")}`;

export default function BackupSummary({ serverId, backupId }) {
  const { t } = useT();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["backupSummary", serverId, backupId],
    queryFn: () => getBackupSummary(serverId, backupId),
    staleTime: 5 * 60 * 1000,
  });
  if (isLoading) return <p className="text-sm text-cs-muted" role="status">{t("common.loading")}</p>;
  if (isError || !data) {
    return (
      <div role="alert" className="text-sm text-danger">
        {t("backups.error.generic")}{" "}
        <button type="button" className="underline" onClick={() => refetch()}>{t("common.retry")}</button>
      </div>
    );
  }
  const { tree, uncategorized, roles } = data.summary;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold text-cs-text mb-2">{t("backups.channelsTitle")}</h3>
        <ul className="space-y-3 text-sm">
          {uncategorized.length > 0 && (
            <li>
              <p className="text-cs-dim">{t("backups.uncategorized")}</p>
              <ul className="mt-1 space-y-0.5 pl-3">
                {uncategorized.map((c) => <li key={c.id} className="text-cs-muted break-words">{c.name}</li>)}
              </ul>
            </li>
          )}
          {tree.map((cat) => (
            <li key={cat.id}>
              <p className="text-cs-text font-medium break-words">{cat.name}</p>
              <ul className="mt-1 space-y-0.5 pl-3">
                {cat.channels.map((c) => <li key={c.id} className="text-cs-muted break-words">{c.name}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-cs-text mb-2">{t("backups.rolesTitle")}</h3>
        <ul className="space-y-1 text-sm">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-none border border-cs-border" style={{ backgroundColor: r.color ? hex(r.color) : "transparent" }} aria-hidden="true" />
              <span className="text-cs-muted break-words min-w-0">{r.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
