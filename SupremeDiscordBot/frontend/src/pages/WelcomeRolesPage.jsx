// frontend/src/pages/WelcomeRolesPage.jsx
// Посрещане и роли — всичко, което се случва, когато някой влезе в сървъра:
// поздравът, автоматичните роли, запазването на роли и ролите с реакция.
// До 12.11.2026 първите три бяха дъното на „Настройки“, а четвъртото — раздел
// на „Автоматизация“.
import { MessageSquareHeart, UserPlus, History, SmilePlus } from "lucide-react";
import PageHeader from "../components/PageHeader";
import PageTabs, { TabPanel, useTab } from "../components/PageTabs";
import { SaveBar, SettingsSkeleton } from "../components/settings/SettingsCard";
import { GreetingCard, AutoRolesCard, RoleSaverCard } from "../components/settings/WelcomeCards";
import ReactionRolesTab from "../components/automation/ReactionRolesTab";
import { useServerSettings } from "../hooks/useServerSettings";
import { useT } from "../contexts/I18nContext";

const KEYS = ["welcome", "autoroles", "roleSaver"];
const TAB_IDS = ["greeting", "autoroles", "role-saver", "reaction-roles"];

export default function WelcomeRolesPage() {
  const { t } = useT();
  // Една форма за трите раздела с настройки: смяната на раздел не губи
  // незапазеното, а „Запази“ праща само полетата на тази страница.
  const { form, set, save, mutation, dirty, ready, isError } = useServerSettings(KEYS);
  const [tab, setTab] = useTab(TAB_IDS);
  const tabs = [
    { id: "greeting", label: t("welcome.greeting.title"), icon: MessageSquareHeart },
    { id: "autoroles", label: t("welcome.autoroles.title"), icon: UserPlus },
    { id: "role-saver", label: t("roleSaver.title"), icon: History },
    { id: "reaction-roles", label: t("auto.tab.reactionRoles"), icon: SmilePlus },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <PageHeader title={t("nav.welcomeRoles")} subtitle={t("welcome.subtitle")} />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} label={t("nav.welcomeRoles")} />

      <TabPanel id={tab}>
        {tab === "reaction-roles" && <ReactionRolesTab />}
        {tab !== "reaction-roles" && (
          <div className="max-w-3xl">
            {isError && <div role="alert" className="cs-card text-center py-10 text-danger">{t("settings.loadFailed")}</div>}
            {!isError && !ready && <SettingsSkeleton rows={1} />}
            {ready && (
              <form onSubmit={save} className="space-y-6">
                {tab === "greeting" && <GreetingCard form={form} set={set} />}
                {tab === "autoroles" && <AutoRolesCard form={form} set={set} />}
                {tab === "role-saver" && <RoleSaverCard form={form} set={set} />}
                <SaveBar mutation={mutation} dirty={dirty} />
              </form>
            )}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
