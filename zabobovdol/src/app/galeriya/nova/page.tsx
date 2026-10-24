import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { formatPhoneBg } from "@/lib/phone";
import { SITE } from "@/lib/site";
import { PhotoForm } from "./PhotoForm";

// Сървърна обвивка: собствено заглавие и описание; формата — noindex.
export const metadata: Metadata = buildMetadata({
  title: "Споделете снимка на Бобов дол",
  description:
    "Имате хубава снимка на Бобов дол — стара или нова? Споделете я и ще я покажем в галерията с вашето име като автор.",
  path: "/galeriya/nova",
  noindex: true,
  follow: true,
  keywords: [
    "снимки Бобов дол",
    "галерия Бобов дол",
    "стари снимки Бобов дол",
    "сподели снимка",
    "фотографии на града",
    "Carbon Stealth",
  ],
});

const CRUMBS = [
  { name: "Галерия", path: "/galeriya" },
  { name: "Споделете снимка", path: "/galeriya/nova" },
];

export default function NewPhotoPage() {
  const sendHint = `Ако не можете да качите файл, изпратете ни снимката по Viber на ${formatPhoneBg(SITE.contact.phone)} или на ${SITE.contact.email} — ние ще я качим.`;
  return (
    <>
      <PageHero
        title="Споделете снимка на Бобов дол"
        intro="Имате хубава снимка на града — стара или нова? Споделете я и ще я покажем в галерията с вашето име като автор."
        crumbs={CRUMBS}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме снимката.",
                "Преглеждаме я, преди да се покаже публично.",
                "Публикуваме я в галерията с името на автора.",
              ]}
            />
          }
        >
          <PhotoForm sendHint={sendHint} />
        </FormLayout>
      </div>
    </>
  );
}
