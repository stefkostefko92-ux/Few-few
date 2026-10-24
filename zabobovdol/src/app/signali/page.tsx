import type { Metadata } from "next";
import { PageHero, Notice } from "@/components/ui";
import { PhoneButton } from "@/components/PhoneButton";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { SECTION } from "@/lib/section-names";
import { SignaliForm } from "./SignaliForm";

// Сървърна обвивка: заглавие, описание и ключови думи на страницата (формата
// е клиентски компонент и сама не може да ги даде — B29).
export const metadata: Metadata = buildMetadata({
  title: "Сигнали до общината",
  description:
    "Подайте сигнал за проблем в Бобов дол — дупки, осветление, отпадъци, ВиК, шум. Препращаме го към общината и ви даваме код за проследяване.",
  path: "/signali",
  keywords: [
    "сигнал до общината Бобов дол",
    "подай сигнал Бобов дол",
    "оплакване община Бобов дол",
    "дупки и улично осветление Бобов дол",
    "код за проследяване на сигнал",
    "Carbon Stealth",
  ],
});

export default function SignaliPage() {
  return (
    <>
      <PageHero
        eyebrow={SECTION.signals}
        title="Сигнали до общината"
        intro="Подайте сигнал или оплакване за проблем в града. Препращаме го към съответната институция и ви даваме код за проследяване."
        crumbs={[{ name: "Сигнали до общината", path: "/signali" }]}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме сигнала и ви показваме код за проследяване (BD-…).",
                "Препращаме го към общината или към съответната институция.",
                "С кода можете да питате за сигнала — нас или общината.",
              ]}
            />
          }
        >
          <Notice
            tone="danger"
            title="Спешен случай? Не пишете тук."
            className="mb-6"
            action={<PhoneButton phone="112" label="Спешност" variant="danger" />}
          >
            <p>
              Тази форма не е за спешни случаи. При опасност за живота, пожар или произшествие
              звъннете на 112 — безплатно и денонощно.
            </p>
          </Notice>
          <SignaliForm />
        </FormLayout>
      </div>
    </>
  );
}
