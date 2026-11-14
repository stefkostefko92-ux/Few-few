// frontend/src/components/settings/ServerCards.jsx
// Картите на страницата „Настройки“: канали за тикетите, език на бота,
// разпределяне на тикети и собствен бот. Всичко друго, което живееше тук до
// 12.11.2026, има своя страница (Посрещане и роли, Дневник, AI отговори).
import { Hash, Globe, RefreshCw, Bot } from "lucide-react";
import DiscordChannelSelect, { DiscordRoleSelect } from "../DiscordPicker";
import SettingsCard from "./SettingsCard";
import { useT } from "../../contexts/I18nContext";
import { LANGUAGE_OPTIONS } from "../../i18n/dashboard";

export function TicketChannelsCard({ form, set }) {
  const { t } = useT();
  return (
    <SettingsCard icon={Hash} title={t("settings.general")} description={t("settings.general.desc")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="cs-label">{t("settings.logChannel")}</span>
          <DiscordChannelSelect kind="text" value={form.logChannelId} onChange={(v) => set("logChannelId", v)} />
          <p className="text-xs text-cs-dim mt-1">{t("settings.logChannel.hint")}</p>
        </label>
        <label className="block">
          <span className="cs-label">{t("settings.archiveChannel")}</span>
          <DiscordChannelSelect kind="text" value={form.archiveChannelId} onChange={(v) => set("archiveChannelId", v)} />
          <p className="text-xs text-cs-dim mt-1">{t("settings.archiveChannel.hint")}</p>
        </label>
      </div>
    </SettingsCard>
  );
}

export function BotLanguageCard({ form, set }) {
  const { t } = useT();
  return (
    <SettingsCard icon={Globe} title={t("language.botForServer")} description={t("language.botForServer.hint")}>
      <label className="block max-w-xs">
        <span className="cs-label">{t("language.label")}</span>
        <select className="cs-input" value={form.language} onChange={(e) => set("language", e.target.value)}>
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>{o.label}</option>
          ))}
        </select>
      </label>
    </SettingsCard>
  );
}

export function RoundRobinCard({ form, set, isPremium }) {
  const { t } = useT();
  return (
    <SettingsCard
      icon={RefreshCw}
      iconClass="text-blue-400"
      title={t("settings.rr.title")}
      lockedLabel={isPremium ? null : t("verify.premiumOnly")}
    >
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded accent-discord-500"
          checked={form.roundRobinEnabled}
          onChange={(e) => set("roundRobinEnabled", e.target.checked)}
          disabled={!isPremium}
          tabIndex={isPremium ? undefined : -1}
        />
        <span className="text-sm text-cs-text">{t("settings.rr.toggle")}</span>
      </label>

      {form.roundRobinEnabled && (
        <label className="block max-w-md">
          <span className="cs-label">{t("ui.supportRole")}</span>
          <DiscordRoleSelect value={form.roundRobinRoleId} onChange={(v) => set("roundRobinRoleId", v)} requireAssignable={false} />
          <p className="text-xs text-cs-muted mt-1">{t("settings.rr.hint")}</p>
        </label>
      )}
    </SettingsCard>
  );
}

// Заключваше се по плана Premium, а полетата се пращат (и бекендът ги приема)
// само при hasWhiteLabel — Premium клиент попълваше токен, виждаше „Saved“ и
// нищо не се записваше (одит 26.09.2026).
export function WhiteLabelCard({ form, set, hasWhiteLabel }) {
  const { t } = useT();
  const off = !hasWhiteLabel;
  return (
    <SettingsCard
      icon={Bot}
      iconClass="text-purple-400"
      title={t("settings.wl.title")}
      description={t("settings.wl.desc")}
      lockedLabel={off ? t("settings.wl.plan") : null}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="cs-label">{t("settings.customBotName")}</span>
          <input
            className="cs-input"
            placeholder={t("ui.ph.botName")}
            value={form.customBotName}
            onChange={(e) => set("customBotName", e.target.value)}
            disabled={off}
            tabIndex={off ? -1 : undefined}
          />
        </label>
        <label className="block">
          <span className="cs-label">{t("settings.customBotAvatar")}</span>
          <input
            className="cs-input"
            placeholder="https://example.com/avatar.png"
            value={form.customBotAvatar}
            onChange={(e) => set("customBotAvatar", e.target.value)}
            disabled={off}
            tabIndex={off ? -1 : undefined}
          />
        </label>
      </div>
      <label className="block">
        <span className="cs-label">{t("settings.customBotToken")}</span>
        <input
          className="cs-input font-mono text-sm"
          type="password"
          placeholder={t("ui.ph.tokenUpdate")}
          value={form.customBotToken}
          onChange={(e) => set("customBotToken", e.target.value)}
          autoComplete="off"
          disabled={off}
          tabIndex={off ? -1 : undefined}
        />
        <p className="text-xs text-cs-muted mt-1">{t("settings.wl.tokenHint")}</p>
      </label>
    </SettingsCard>
  );
}
