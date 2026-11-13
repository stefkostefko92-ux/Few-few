// frontend/src/pages/SettingsPage.jsx
// Настройки на сървъра — само това, което е за целия сървър: каналите за
// тикетите, езикът на бота, разпределянето на тикети и собственият бот.
// До 12.11.2026 тук живееха седем несвързани карти в една дълга форма;
// посрещането, ролите, дневникът и AI отговорите вече са при функцията си.
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { SaveBar, SettingsSkeleton } from "../components/settings/SettingsCard";
import { TicketChannelsCard, BotLanguageCard, RoundRobinCard, WhiteLabelCard } from "../components/settings/ServerCards";
import { useServerSettings } from "../hooks/useServerSettings";
import { useT } from "../contexts/I18nContext";

const KEYS = ["general", "language", "roundRobin", "whiteLabel"];

export default function SettingsPage() {
  const { t } = useT();
  const { server, form, set, save, mutation, dirty, ready, isError } = useServerSettings(KEYS);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      {isError && <div role="alert" className="cs-card text-center py-10 text-danger">{t("settings.loadFailed")}</div>}
      {!isError && !ready && <SettingsSkeleton rows={4} />}
      {ready && (
        <form onSubmit={save} className="space-y-6">
          <TicketChannelsCard form={form} set={set} />
          <BotLanguageCard form={form} set={set} />
          <RoundRobinCard form={form} set={set} isPremium={!!server.isPremium} />
          <WhiteLabelCard form={form} set={set} hasWhiteLabel={!!server.hasWhiteLabel} />
          <SaveBar mutation={mutation} dirty={dirty} />
        </form>
      )}

      <MovedSettings />
    </div>
  );
}

// Настройките, които вече са при функцията си — за човек, който ги търси тук.
function MovedSettings() {
  const { t } = useT();
  const { serverId } = useParams();
  const base = `/dashboard/${serverId}`;
  const links = [
    { to: `${base}/welcome`, label: t("nav.welcomeRoles"), hint: t("settings.elsewhere.welcome") },
    { to: `${base}/activity-log`, label: t("nav.activityLog"), hint: t("settings.elsewhere.log") },
    { to: `${base}/kb?tab=ai`, label: t("settings.ai.title"), hint: t("settings.elsewhere.ai") },
    { to: `${base}/bait`, label: t("nav.bait"), hint: t("settings.elsewhere.bait") },
  ];
  return (
    <section className="mt-10" aria-labelledby="settings-elsewhere">
      <h2 id="settings-elsewhere" className="font-semibold text-cs-text">{t("settings.elsewhere.title")}</h2>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="cs-card !p-4 flex items-center gap-3 hover:border-cs-cyan/50 transition-colors">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-cs-text">{l.label}</span>
                <span className="block text-xs text-cs-muted mt-0.5">{l.hint}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-cs-dim flex-none" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
