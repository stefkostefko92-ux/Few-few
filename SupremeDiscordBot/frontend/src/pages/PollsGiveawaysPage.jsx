// frontend/src/pages/PollsGiveawaysPage.jsx
// Анкети и раздавания — двете неща, с които екипът занимава общността.
// До 12.11.2026 бяха два от шестте раздела на „Автоматизация“.
import { BarChart3, Gift } from "lucide-react";
import PageHeader from "../components/PageHeader";
import PageTabs, { TabPanel, useTab } from "../components/PageTabs";
import PollsTab from "../components/automation/PollsTab";
import GiveawaysTab from "../components/automation/GiveawaysTab";
import { useT } from "../contexts/I18nContext";

const TAB_IDS = ["polls", "giveaways"];

export default function PollsGiveawaysPage() {
  const { t } = useT();
  const [tab, setTab] = useTab(TAB_IDS);
  const tabs = [
    { id: "polls", label: t("auto.tab.polls"), icon: BarChart3 },
    { id: "giveaways", label: t("auto.tab.giveaways"), icon: Gift },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <PageHeader title={t("nav.pollsGiveaways")} subtitle={t("polls.subtitle")} />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} label={t("nav.pollsGiveaways")} />
      <TabPanel id={tab}>
        {tab === "polls" && <PollsTab />}
        {tab === "giveaways" && <GiveawaysTab />}
      </TabPanel>
    </div>
  );
}
