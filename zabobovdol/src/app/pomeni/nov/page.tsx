import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { CONSENT_TEXT, CONTACT_RETENTION_DAYS, friendlyPhone } from "@/lib/obituary";
import { ObituaryForm } from "./ObituaryForm";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Подайте некролог или помен — Бобов дол",
    description:
      "Близките на починалия могат да подадат некролог или помен (40 дни, 6 месеца, година) за Бобов дол. Преглеждаме всяка обява и я публикуваме до 24 часа.",
    path: "/pomeni/nov",
  }),
  keywords: [
    "подай некролог",
    "некролог Бобов дол",
    "помен 40 дни",
    "възпоменание онлайн",
    "тъжна вест Бобов дол",
    "Carbon Stealth",
  ],
};

export default function NewObituaryPage() {
  return (
    <>
      <PageHero
        title="Подайте некролог или помен"
        intro="Попълнете формата или ни се обадете. Преглеждаме всяка обява, преди да се появи на сайта — обикновено до 24 часа."
        crumbs={[
          { name: "Некролози и помени", path: "/pomeni" },
          { name: "Подайте обява", path: "/pomeni/nov" },
        ]}
      />
      <div className="container-content py-10">
        <ObituaryForm
          phone={friendlyPhone(SITE.contact.phone)}
          consentText={CONSENT_TEXT}
          retentionDays={CONTACT_RETENTION_DAYS}
        />
      </div>
    </>
  );
}
