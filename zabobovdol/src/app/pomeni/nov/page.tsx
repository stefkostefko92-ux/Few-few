import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { FormLayout } from "@/components/FormLayout";
import { TelLink } from "@/components/TelLink";
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
          { name: "Подайте некролог или помен", path: "/pomeni/nov" },
        ]}
      />
      <div className="container-content py-10">
        <FormLayout aside={<PublishInfo />} asideFirst>
          <ObituaryForm
            phone={friendlyPhone(SITE.contact.phone)}
            consentText={CONSENT_TEXT}
            retentionDays={CONTACT_RETENTION_DAYS}
          />
        </FormLayout>
      </div>
    </>
  );
}

// Какво се публикува, снимката и свалянето — до формата, не в нея. На телефон
// е над формата: на тези бележки се основава съгласието преди „Изпратете“.
function PublishInfo() {
  const [user, domain] = SITE.contact.email.split("@");
  const tel = (
    <TelLink phone={SITE.contact.phone} className="link whitespace-nowrap">
      {friendlyPhone(SITE.contact.phone)}
    </TelLink>
  );
  return (
    <section aria-labelledby="pomen-publikuvane" className="panel space-y-4 text-base text-slate-700">
      <div>
        <h2 id="pomen-publikuvane" className="h-card">
          Какво публикуваме
        </h2>
        <p className="mt-1">
          Името, годините, датата, погребението или помена (кога и къде), текста и подписа.
          Обявата се появява едва след като я прегледаме — обикновено до 24 часа.
        </p>
      </div>
      <div>
        <h3 className="h-card">Снимка</h3>
        <p className="mt-1">Не я качвайте тук. Ако желаете, изпратете я по Viber на {tel}, след като ви се обадим.</p>
      </div>
      <div>
        <h3 className="h-card">Сваляне</h3>
        <p className="mt-1">
          По молба на близките сваляме или поправяме обявата до 72 часа — на {tel} или на{" "}
          <a href={`mailto:${SITE.contact.email}`} className="link [overflow-wrap:anywhere]">
            {user}@<wbr />
            {domain}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
