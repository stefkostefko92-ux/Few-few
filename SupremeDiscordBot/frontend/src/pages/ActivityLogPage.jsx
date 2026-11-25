// frontend/src/pages/ActivityLogPage.jsx
// Дневник на сървъра — своя страница в група „Защита“ (до 12.11.2026 беше карта
// по средата на „Настройки“).
import PageHeader from "../components/PageHeader";
import { SaveBar, SettingsSkeleton } from "../components/settings/SettingsCard";
import ActivityLogCard from "../components/settings/ActivityLogCard";
import { useServerSettings } from "../hooks/useServerSettings";
import { useT } from "../contexts/I18nContext";

const KEYS = ["activityLog"];

export default function ActivityLogPage() {
  const { t } = useT();
  const { form, set, save, mutation, dirty, ready, isError } = useServerSettings(KEYS);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <PageHeader title={t("nav.activityLog")} subtitle={t("log.subtitle")} />

      {isError && <div role="alert" className="cs-card text-center py-10 text-danger">{t("settings.loadFailed")}</div>}
      {!isError && !ready && <SettingsSkeleton rows={1} />}
      {ready && (
        <form onSubmit={save} className="space-y-6">
          <ActivityLogCard form={form} set={set} />
          <SaveBar mutation={mutation} dirty={dirty} />
        </form>
      )}
    </div>
  );
}
