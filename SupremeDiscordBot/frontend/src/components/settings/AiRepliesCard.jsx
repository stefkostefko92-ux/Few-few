// frontend/src/components/settings/AiRepliesCard.jsx
// AI отговори: първият отговор в нов тикет, написан от модел по указанията на
// сървъра. НЕ чете статиите от базата знания (services/aiReply.js праща само
// указанията и съобщението) — стои до тях, защото и двете са „автоматичен първи
// отговор“, и текстът на картата го казва изрично.
import { Zap } from "lucide-react";
import SettingsCard, { SaveBar, SettingsSkeleton } from "./SettingsCard";
import { useServerSettings } from "../../hooks/useServerSettings";
import { useT } from "../../contexts/I18nContext";

const PROMPT_MAX = 1000;

export default function AiRepliesCard({ form, set, isPremium }) {
  const { t } = useT();
  return (
    <SettingsCard
      icon={Zap}
      iconClass="text-cs-gold"
      title={t("settings.ai.title")}
      description={t("settings.ai.desc")}
      lockedLabel={isPremium ? null : t("verify.premiumOnly")}
    >
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded accent-discord-500"
          checked={form.aiRepliesEnabled}
          onChange={(e) => set("aiRepliesEnabled", e.target.checked)}
          disabled={!isPremium}
          tabIndex={isPremium ? undefined : -1}
        />
        <span className="text-sm text-cs-text">{t("settings.ai.toggle")}</span>
      </label>

      {form.aiRepliesEnabled && (
        <label className="block">
          <span className="cs-label">{t("ui.customSystemPrompt")}</span>
          <textarea
            className="cs-input text-sm"
            rows={4}
            maxLength={PROMPT_MAX}
            placeholder={t("settings.ai.promptPh")}
            value={form.aiRepliesPrompt}
            onChange={(e) => set("aiRepliesPrompt", e.target.value)}
            disabled={!isPremium}
            tabIndex={isPremium ? undefined : -1}
          />
          <p className="text-xs text-cs-muted mt-1">
            {t("settings.charCount", { count: form.aiRepliesPrompt.length, max: PROMPT_MAX })}
          </p>
        </label>
      )}
    </SettingsCard>
  );
}

const KEYS = ["aiReplies"];

/** Картата със своята форма — за раздела „AI отговори“ в „База знания“. */
export function AiRepliesForm() {
  const { t } = useT();
  const { server, form, set, save, mutation, dirty, ready, isError } = useServerSettings(KEYS);
  if (isError) return <div role="alert" className="cs-card text-center py-10 text-danger">{t("settings.loadFailed")}</div>;
  if (!ready) return <SettingsSkeleton rows={1} />;
  return (
    <form onSubmit={save} className="space-y-6">
      <AiRepliesCard form={form} set={set} isPremium={!!server.isPremium} />
      {server.isPremium && <SaveBar mutation={mutation} dirty={dirty} />}
    </form>
  );
}
