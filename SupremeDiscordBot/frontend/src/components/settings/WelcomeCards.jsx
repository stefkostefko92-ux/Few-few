// frontend/src/components/settings/WelcomeCards.jsx
// Какво става, когато някой влезе в сървъра: поздравът, ролите, които получава,
// и ролите, които му се връщат, ако се е върнал.
import { MessageSquareHeart, UserPlus, History } from "lucide-react";
import DiscordChannelSelect, { DiscordRoleSelect } from "../DiscordPicker";
import SettingsCard from "./SettingsCard";
import { useT } from "../../contexts/I18nContext";

export function GreetingCard({ form, set }) {
  const { t } = useT();
  return (
    <SettingsCard icon={MessageSquareHeart} title={t("welcome.greeting.title")} description={t("settings.welcome.desc")}>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-cs-cyan"
          checked={form.welcomerEnabled}
          onChange={(e) => set("welcomerEnabled", e.target.checked)}
        />
        <span className="text-sm text-cs-text">{t("settings.enableWelcome")}</span>
      </label>

      {form.welcomerEnabled && (
        <div className="space-y-4">
          {/* Канал от СПИСЪК, не 19 цифри на ръка. Сгрешена цифра тук е причина
              №1 за „посрещането не работи“ — и не гърми никъде. Изборът показва
              и дали ботът може да пише там. (08.08.2026) */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <label className="block">
              <span className="cs-label">{t("ui.welcomeChannel")}</span>
              <DiscordChannelSelect kind="text" value={form.welcomerChannelId} onChange={(v) => set("welcomerChannelId", v)} />
            </label>
            <label className="block">
              <span className="cs-label">{t("settings.embedColor")}</span>
              <input
                type="color"
                className="cs-input h-10 w-full sm:w-24"
                value={form.welcomerEmbedColor}
                onChange={(e) => set("welcomerEmbedColor", e.target.value)}
              />
            </label>
          </div>
          <label className="block">
            <span className="cs-label">{t("ui.welcomeMsgVars")}</span>
            <textarea
              className="cs-textarea"
              rows={3}
              maxLength={2000}
              value={form.welcomerMessage}
              onChange={(e) => set("welcomerMessage", e.target.value)}
              placeholder={t("ui.ph.welcomeMember")}
            />
            <p className="text-xs text-cs-dim mt-1">{t("welcome.vars")}</p>
          </label>
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-cs-cyan"
          checked={form.welcomerDmEnabled}
          onChange={(e) => set("welcomerDmEnabled", e.target.checked)}
        />
        <span className="text-sm text-cs-text">{t("settings.alsoDm")}</span>
      </label>

      {form.welcomerDmEnabled && (
        <label className="block">
          <span className="cs-label">{t("ui.welcomeDm")}</span>
          <textarea
            className="cs-textarea"
            rows={3}
            maxLength={2000}
            value={form.welcomerDmMessage}
            onChange={(e) => set("welcomerDmMessage", e.target.value)}
            placeholder={t("ui.ph.welcomeDm")}
          />
        </label>
      )}
    </SettingsCard>
  );
}

export function AutoRolesCard({ form, set }) {
  const { t } = useT();
  return (
    <SettingsCard icon={UserPlus} title={t("welcome.autoroles.title")} description={t("welcome.autoroles.desc")}>
      <label className="block">
        <span className="cs-label">{t("ui.autoroleMembers")}</span>
        <DiscordRoleSelect multi value={form.autoroleIds} onChange={(v) => set("autoroleIds", v)} />
        <p className="text-xs text-cs-dim mt-1">{t("ui.hint.autoroleMembers")}</p>
      </label>
      <label className="block">
        <span className="cs-label">{t("ui.autoroleBots")}</span>
        <DiscordRoleSelect multi value={form.autoroleBotIds} onChange={(v) => set("autoroleBotIds", v)} />
        <p className="text-xs text-cs-dim mt-1">{t("ui.hint.autoroleBots")}</p>
      </label>
    </SettingsCard>
  );
}

// v45 — в базата „sticky roles“. Изрично включване заради тежестта за
// сигурността: напуснал модератор, който се върне, си връща достъпа.
export function RoleSaverCard({ form, set }) {
  const { t } = useT();
  return (
    <SettingsCard icon={History} title={t("roleSaver.title")} description={t("roleSaver.desc")}>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-cs-cyan"
          checked={form.stickyRolesEnabled}
          onChange={(e) => set("stickyRolesEnabled", e.target.checked)}
        />
        <span className="text-sm text-cs-text">{t("roleSaver.toggle")}</span>
      </label>

      <ul className="text-sm text-cs-muted space-y-1.5 list-disc pl-5">
        <li>{t("roleSaver.rule.never")}</li>
        <li>{t("roleSaver.rule.removed")}</li>
        <li>{t("roleSaver.rule.expiry")}</li>
      </ul>

      {form.stickyRolesEnabled && (
        <p className="text-sm text-warning" role="note">{t("ui.hint.stickyRolesWarning")}</p>
      )}
    </SettingsCard>
  );
}
