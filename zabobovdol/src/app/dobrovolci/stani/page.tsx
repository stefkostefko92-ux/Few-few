import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { VolunteerForm } from "./VolunteerForm";

// Сървърна обвивка (B29): собствено заглавие и описание; формата — noindex.
export const metadata: Metadata = buildMetadata({
  title: "Станете доброволец",
  description:
    "Помогнете на възрастен човек в Бобов дол — с телефон, документи, пазар или компания. Запишете се като доброволец.",
  path: "/dobrovolci/stani",
  noindex: true,
  follow: true,
  keywords: [
    "доброволец Бобов дол",
    "помощ за възрастни хора",
    "доброволчество Бобов дол",
    "помощ с документи и пазар",
    "взаимопомощ Бобов дол",
    "Carbon Stealth",
  ],
});

const CRUMBS = [
  { name: "Доброволци", path: "/dobrovolci" },
  { name: "Станете доброволец", path: "/dobrovolci/stani" },
];

export default function BecomeVolunteerPage() {
  return (
    <>
      <PageHero
        title="Станете доброволец"
        intro="Отделете малко време, за да помогнете на възрастен човек — с телефон, документи, пазар или просто компания. Записването минава през кратък преглед."
        crumbs={CRUMBS}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме записването ви.",
                "Свързваме се с вас по телефон или имейл.",
                "След кратък преглед ви включваме в списъка на доброволците.",
              ]}
            />
          }
        >
          <VolunteerForm />
        </FormLayout>
      </div>
    </>
  );
}
