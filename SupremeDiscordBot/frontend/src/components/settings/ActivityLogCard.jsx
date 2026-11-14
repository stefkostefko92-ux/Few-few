// frontend/src/components/settings/ActivityLogCard.jsx
// Дневник на сървъра: кои събития отиват в кой канал на Discord. Нищо от това
// не се пази при нас — ботът само публикува в избрания канал.
import { Activity } from "lucide-react";
import DiscordChannelSelect from "../DiscordPicker";
import SettingsCard from "./SettingsCard";
import { LOG_CATEGORIES } from "./fields";
import { useT } from "../../contexts/I18nContext";

export default function ActivityLogCard({ form, set }) {
  const { t } = useT();
  return (
    <SettingsCard
      icon={Activity}
      title={t("settings.logging.title")}
      description={`${t("settings.logging.desc")} ${t("settings.logging.controllerLegal")}`}
    >
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded accent-cs-cyan"
          checked={form.eventLogEnabled}
          onChange={(e) => set("eventLogEnabled", e.target.checked)}
        />
        <span className="text-sm text-cs-text">{t("settings.enableLogging")}</span>
      </label>

      {form.eventLogEnabled && (
        <div className="space-y-4">
          <label className="block max-w-md">
            <span className="cs-label">{t("ui.eventLogChannel")}</span>
            <DiscordChannelSelect kind="text" value={form.eventLogChannelId} onChange={(v) => set("eventLogChannelId", v)} />
          </label>
          <div>
            <span className="cs-label">{t("settings.categoriesToLog")}</span>
            <p className="text-xs text-cs-dim mt-1 mb-2">{t("settings.perCategoryHint")}</p>
            <div className="flex flex-col gap-2 mt-1">
              {LOG_CATEGORIES.map((cat) => {
                const key = `eventLogCat_${cat}`;
                const label = t(`settings.cat.${cat}`);
                return (
                  <div key={cat} className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-cs-text flex-1 min-w-[220px]">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-cs-cyan"
                        checked={form[key]}
                        onChange={(e) => set(key, e.target.checked)}
                      />
                      {label}
                    </label>
                    {/* Собствен канал за категорията. Празно = общият по-горе,
                        затова празната опция го казва изрично.

                        ИЗБОР ОТ СПИСЪК, не изписан snowflake: бекендът пази само
                        валидни ID-та (`sanitizeEventLogChannels`), тоест една
                        сгрешена цифра се ИЗХВЪРЛЯ мълчаливо — човекът вижда
                        запазена настройка, а логовете отиват в общия канал. */}
                    <div className="w-full sm:w-56">
                      <DiscordChannelSelect
                        kind="text"
                        value={form[`eventLogCh_${cat}`] || ""}
                        onChange={(v) => set(`eventLogCh_${cat}`, v)}
                        disabled={!form[key]}
                        ariaLabel={t("settings.channelForCategory", { category: label })}
                        emptyLabel={t("settings.useMainChannel")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
