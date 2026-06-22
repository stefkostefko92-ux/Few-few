import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = buildMetadata({
  title: "Контакти",
  description:
    "Свържете се с екипа на „За Дупница“ — предложения, поправки, липсваща информация.",
  path: "/kontakti",
});

export default function KontaktiPage() {
  return (
    <>
      <JsonLd
        data={webPageLd({ name: "Контакти", path: "/kontakti", type: "ContactPage" })}
      />
      <PageHero
        eyebrow="Връзка"
        title="Контакти"
        intro="Имате предложение, забелязали сте грешка или липсва нещо важно? Пишете ни."
        crumbs={[{ name: "Контакти", path: "/kontakti" }]}
      />

      <div className="container-content py-10">
        <p className="mb-6 max-w-2xl text-base text-slate-700">
          Това е независим граждански проект. За официални услуги и преписки се
          обръщайте към Община Дупница. За спешни случаи: 112.
        </p>
        <ContactForm />
      </div>
    </>
  );
}
