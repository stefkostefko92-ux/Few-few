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
        intro="Подайте сигнал или оплакване за проблем в града. Препращаме го от ваше име към общината или съответната институция и ви даваме наш код за проследяване."
        crumbs={[{ name: "Сигнали до общината", path: "/signali" }]}
      />
      <div className="container-content py-10">
        <FormLayout
          aside={
            <NextSteps
              steps={[
                "Получаваме сигнала и ви показваме наш код за проследяване (BD-…).",
                "Препращаме го от ваше име към общината или към съответната институция.",
                "С кода можете да питате нас за сигнала. Кодът не е входящ номер на общината.",
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
          {/* Колкото по-институционален е видът, толкова по-ясно: това не е
              общината и не е официално подаване (няма входящ номер, не тече
              срок за отговор по АПК). */}
          <Notice tone="info" title="Ние не сме общината." className="mb-6">
            <p>
              Препращаме сигнала от ваше име, но това не е официално подаване и не получавате
              входящ номер от общината. За официален сигнал пишете на{" "}
              <span className="[overflow-wrap:anywhere]">
                obshtina@<wbr />
                bobovdol.egov.bg
              </span>{" "}
              или го подайте в деловодството на общината.
            </p>
          </Notice>
          <SignaliForm />
        </FormLayout>
      </div>
    </>
  );
}
