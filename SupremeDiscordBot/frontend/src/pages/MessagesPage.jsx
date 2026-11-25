// frontend/src/pages/MessagesPage.jsx
// Съобщения — това, което ботът публикува сам: закачено на дъното на канал или
// по график. До 12.11.2026 бяха два от шестте раздела на „Автоматизация“.
import { Pin, CalendarClock } from "lucide-react";
import PageHeader from "../components/PageHeader";
import PageTabs, { TabPanel, useTab } from "../components/PageTabs";
import StickyTab from "../components/automation/StickyTab";
import ScheduledTab from "../components/automation/ScheduledTab";
import { PremiumBadge, PremiumLockCard } from "../components/PremiumBadge";
import { usePremium } from "../hooks/usePremium";
import { useT } from "../contexts/I18nContext";

const TAB_IDS = ["sticky", "scheduled"];

export default function MessagesPage() {
  const { t } = useT();
  const { isPremium, isLoading } = usePremium();
  const [tab, setTab] = useTab(TAB_IDS);
  const badge = !isLoading && !isPremium ? <PremiumBadge small /> : null;
  const tabs = [
    { id: "sticky", label: t("auto.sticky.title"), icon: Pin, badge },
    { id: "scheduled", label: t("auto.sched.title"), icon: CalendarClock, badge },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <PageHeader title={t("nav.messages")} subtitle={t("messages.subtitle")} />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} label={t("nav.messages")} />
      <TabPanel id={tab}>
        {isLoading && <div className="cs-card h-32 animate-pulse" />}
        {!isLoading && tab === "sticky" && (isPremium
          ? <StickyTab />
          : <PremiumLockCard feature={t("auto.sticky.title")} description={t("auto.sticky.desc")} />)}
        {!isLoading && tab === "scheduled" && (isPremium
          ? <ScheduledTab />
          : <PremiumLockCard feature={t("auto.sched.title")} description={t("auto.sched.desc")} />)}
      </TabPanel>
    </div>
  );
}
