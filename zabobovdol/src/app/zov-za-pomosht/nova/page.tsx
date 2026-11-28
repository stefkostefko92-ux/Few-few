import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { HelpForm } from "./HelpForm";

// Сървърна обвивка: собствено заглавие и описание; формата — noindex.
export const metadata: Metadata = buildMetadata({
  title: "Подайте зов за помощ",
  description:
    "Потърсете помощ за възрастен човек в Бобов дол или предложете своята помощ или дарение. Публикува се след кратък преглед.",
  path: "/zov-za-pomosht/nova",
  noindex: true,
  follow: true,
  keywords: [
    "зов за помощ Бобов дол",
    "помощ за възрастен човек",
    "дарение Бобов дол",
    "взаимопомощ Бобов дол",
    "търся помощ Бобов дол",
    "Carbon Stealth",
  ],
});

const CRUMBS = [
  { name: "Зов за помощ", path: "/zov-za-pomosht" },
  { name: "Подайте зов за помощ", path: "/zov-za-pomosht/nova" },
];

export default function NewHelpCausePage() {
  return (
    <>
      <PageHero
        title="Подайте зов за помощ"
        intro="Потърсете помощ за възрастен човек или предложете своята помощ или дарение. Публикува се след кратък преглед."
        crumbs={CRUMBS}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме зова.",
                "Преглеждаме го, преди да се покаже публично.",
                "Публикуваме го с вашия телефон или имейл, за да се свържат с вас.",
              ]}
            >
              Внимавайте при дарения — не превеждайте пари на непознати без проверка.
            </NextSteps>
          }
        >
          <HelpForm />
        </FormLayout>
      </div>
    </>
  );
}
