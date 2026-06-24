import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { ContactForm } from "./ContactForm";
import { Phone, Mail, MapPin } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Контакти",
  description: "Свържете се с ФК „Миньор“ Бобов дол — адрес, телефон и форма за връзка.",
  path: "/kontakti",
});

export default function ContactPage() {
  const phoneHref = SITE.contact.phone.replace(/\s/g, "");
  return (
    <>
      <PageHero
        eyebrow="Връзка с нас"
        title="Контакти"
        intro="Пишете ни или ни посетете на стадиона."
        crumbs={[{ name: "Контакти", path: "/kontakti" }]}
      />
      <JsonLd
        data={webPageLd({
          name: "Контакти",
          description: "Контакти на ФК „Миньор“ Бобов дол.",
          path: "/kontakti",
          type: "ContactPage",
        })}
      />
      <div className="container-content grid gap-10 py-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="section-title mb-5">Данни за връзка</h2>
          <ul className="space-y-4 text-slate-700">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <span>
                {SITE.stadium.name}
                <br />
                {SITE.contact.address}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <a href={`tel:${phoneHref}`} className="font-semibold text-brand-800 hover:underline">
                {SITE.contact.phone}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <a href={`mailto:${SITE.contact.email}`} className="break-all text-brand-800 hover:underline">
                {SITE.contact.email}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="section-title mb-5">Изпратете съобщение</h2>
          <ContactForm />
        </div>
      </div>
    </>
  );
}
