import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { RideForm } from "./RideForm";

// Сървърна обвивка: собствено заглавие и описание; формата — noindex.
export const metadata: Metadata = buildMetadata({
  title: "Споделено пътуване — нова обява",
  description:
    "Пътувате редовно от Бобов дол? Предложете място в колата или потърсете спътници и споделете разходите.",
  path: "/spodeleno-patuvane/nova",
  noindex: true,
  follow: true,
  keywords: [
    "споделено пътуване Бобов дол",
    "превоз Бобов дол Дупница",
    "кола до София от Бобов дол",
    "търся превоз",
    "спътници за път",
    "Carbon Stealth",
  ],
});

const CRUMBS = [
  { name: "Споделено пътуване", path: "/spodeleno-patuvane" },
  { name: "Нова обява", path: "/spodeleno-patuvane/nova" },
];

export default function NewRidePage() {
  return (
    <>
      <PageHero
        title="Споделено пътуване — нова обява"
        intro="Пътувате редовно по даден маршрут? Предложете място в колата или потърсете спътници и споделете разходите. Публикува се след кратък преглед."
        crumbs={CRUMBS}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме обявата.",
                "Преглеждаме я, за да няма спам.",
                "Публикуваме я за 60 дни с вашия телефон или имейл.",
              ]}
            >
              За сигурност се уговаряйте предварително и не плащайте на непознати без яснота.
            </NextSteps>
          }
        >
          <RideForm />
        </FormLayout>
      </div>
    </>
  );
}
