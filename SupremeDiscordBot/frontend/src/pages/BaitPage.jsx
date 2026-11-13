// frontend/src/pages/BaitPage.jsx
// Канал-стръв за спам ботове — своя страница в група „Защита“ (до 12.11.2026
// беше карта над панелите за верификация и хората не я намираха).
import { useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import BaitCard from "../components/BaitCard";
import { useT } from "../contexts/I18nContext";

export default function BaitPage() {
  const { t } = useT();
  const { serverId } = useParams();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <PageHeader title={t("nav.bait")} subtitle={t("bait.intro")} />
      <BaitCard serverId={serverId} />
    </div>
  );
}
