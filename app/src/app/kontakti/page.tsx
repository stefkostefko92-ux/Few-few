import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata, webPageLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = buildMetadata({
  title: "Контакти",
  description: "Свържете се с екипа на За Дупница.",
  path: "/kontakti",
});

export default function ContactsPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageLd({
            name: "Контакти",
            description: "Свържете се с екипа на За Дупница.",
            path: "/kontakti",
            type: "ContactPage",
          }),
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Контакти", path: "/kontakti" },
          ]),
        ]}
      />
      <PageHero
        title="Контакти"
        intro="Имате въпрос, предложение или искате да добавим ваша услуга/бизнес? Пишете ни."
        crumbs={[{ name: "Контакти", path: "/kontakti" }]}
      />
      <div className="container-content max-w-2xl space-y-6 py-10">
        <div className="card space-y-4">
          {SITE.contact.email && (
            <div>
              <div className="text-xs uppercase text-slate-600">Имейл</div>
              <a
                href={`mailto:${SITE.contact.email}`}
                className="text-lg font-semibold text-brand-700"
              >
                {SITE.contact.email}
              </a>
            </div>
          )}
          {SITE.contact.phone && (
            <div>
              <div className="text-xs uppercase text-slate-600">Телефон</div>
              <a
                href={`tel:${SITE.contact.phone}`}
                className="text-lg font-semibold text-brand-700"
              >
                {SITE.contact.phone}
              </a>
            </div>
          )}
          <div>
            <div className="text-xs uppercase text-slate-600">Населено място</div>
            <div className="text-slate-700">
              {SITE.geo.city}, {SITE.geo.region}, {SITE.geo.country}
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Отговаряме в рамките на няколко работни дни.
          </p>
        </div>

        <ContactForm />
      </div>
    </>
  );
}
