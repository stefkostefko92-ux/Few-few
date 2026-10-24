import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { ListingForm } from "./ListingForm";

// Сървърна обвивка (B29): собствено заглавие и описание. Формата не е
// съдържание за търсачките — noindex, но връзките се следват.
export const metadata: Metadata = buildMetadata({
  title: "Подайте безплатна обява",
  description:
    "Продавате, търсите или подарявате нещо в Бобов дол? Подайте безплатна обява — публикува се след кратък преглед.",
  path: "/obyavi/nova",
  noindex: true,
  follow: true,
  keywords: [
    "безплатна обява Бобов дол",
    "подай обява Бобов дол",
    "продавам Бобов дол",
    "търся работа Бобов дол",
    "обяви Бобов дол",
    "Carbon Stealth",
  ],
});

const CRUMBS = [
  { name: "Обяви", path: "/obyavi" },
  { name: "Подайте безплатна обява", path: "/obyavi/nova" },
];

export default function NewListingPage() {
  return (
    <>
      <PageHero
        title="Подайте безплатна обява"
        intro="Попълнете формата. Обявата се публикува след кратък преглед, за да няма спам."
        crumbs={CRUMBS}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме обявата.",
                "Преглеждаме я, за да няма спам и измами.",
                "Публикуваме я за 60 дни с вашия телефон или имейл.",
              ]}
            >
              Внимавайте с плащания предварително — не превеждайте пари на непознати.
            </NextSteps>
          }
        >
          <ListingForm />
        </FormLayout>
      </div>
    </>
  );
}
