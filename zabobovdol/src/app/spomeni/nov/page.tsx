import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { MemoryForm } from "./MemoryForm";

// Сървърна обвивка: собствено заглавие и описание; формата — noindex.
export const metadata: Metadata = buildMetadata({
  title: "Споделете спомен",
  description:
    "Разкажете спомен от стария Бобов дол — за мините, училището, празниците и хората. Публикува се след кратък преглед.",
  path: "/spomeni/nov",
  noindex: true,
  follow: true,
  keywords: [
    "спомени Бобов дол",
    "история на Бобов дол",
    "стар Бобов дол",
    "миньорски спомени",
    "сподели спомен",
    "Carbon Stealth",
  ],
});

const CRUMBS = [
  { name: "Спомени", path: "/spomeni" },
  { name: "Споделете спомен", path: "/spomeni/nov" },
];

export default function NewMemoryPage() {
  return (
    <>
      <PageHero
        title="Споделете спомен"
        intro="Разкажете спомен от стария Бобов дол — за мините, училището, празниците, хората. Публикува се след кратък преглед."
        crumbs={CRUMBS}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме спомена.",
                "Преглеждаме го.",
                "Публикуваме го в „Спомени“ с вашето име, ако сте го написали.",
              ]}
            />
          }
        >
          <MemoryForm />
        </FormLayout>
      </div>
    </>
  );
}
