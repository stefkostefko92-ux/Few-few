// frontend/src/components/settings/SettingsCard.jsx
// Една карта с настройки: икона, заглавие, изречение какво прави, и полетата.
// Заключена карта (план, който не носи функцията) остава четима и води към
// страницата с плановете — преди беше само избледняла, без изход.
import { Link, useParams } from "react-router-dom";
import { Star, Save } from "lucide-react";
import { useT } from "../../contexts/I18nContext";

export default function SettingsCard({ icon: Icon, iconClass = "text-cs-cyan", title, description = null, lockedLabel = null, children }) {
  const { serverId } = useParams();
  const locked = !!lockedLabel;
  return (
    <section className="cs-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-semibold text-cs-text flex items-center gap-2">
            {Icon && <Icon className={`w-5 h-5 flex-none ${iconClass}`} aria-hidden="true" />}
            {title}
          </h2>
          {description && <p className="text-sm text-cs-muted mt-1">{description}</p>}
        </div>
        {locked && (
          <Link
            to={`/dashboard/${serverId}/premium`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cs-gold/10 hover:bg-cs-gold/20 text-cs-gold text-xs font-bold border border-cs-gold/30 transition-colors"
          >
            <Star className="w-3 h-3 fill-current" aria-hidden="true" /> {lockedLabel}
          </Link>
        )}
      </div>
      <div aria-disabled={locked || undefined} className={`space-y-4 ${locked ? "opacity-50 pointer-events-none" : ""}`}>
        {children}
      </div>
    </section>
  );
}

/** Редът под формата: какво е състоянието и бутонът „Запази“. */
export function SaveBar({ mutation, dirty }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {mutation.isError && (
        <p role="alert" className="text-danger text-sm mr-auto">
          {mutation.error?.response?.data?.error || t("settings.saveFailed")}
        </p>
      )}
      {!mutation.isError && dirty && <p className="text-cs-muted text-sm mr-auto">{t("settings.unsaved")}</p>}
      {!mutation.isError && !dirty && mutation.isSuccess && (
        <p role="status" className="text-success text-sm mr-auto">{t("settings.saved")}</p>
      )}
      <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={mutation.isPending || !dirty}>
        <Save className="w-4 h-4" aria-hidden="true" />
        {mutation.isPending ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}

/** Скелетът, докато настройките се зареждат. */
export function SettingsSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="cs-card h-24 animate-pulse bg-cs-panel" />
      ))}
    </div>
  );
}
