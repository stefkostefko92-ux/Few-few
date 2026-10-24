import type { Metadata } from "next";
import { Mail, MapPin } from "@/components/icons";
import { PageHero } from "@/components/ui";
import { PhoneButton } from "@/components/PhoneButton";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";
import { SECTION } from "@/lib/section-names";
import { ContactForm } from "./ContactForm";

const DESCRIPTION =
  "Свържете се с екипа на „За Бобов дол“ — въпрос, предложение, нова услуга или бизнес за каталога. Телефон, имейл и форма за съобщение.";

export const metadata: Metadata = buildMetadata({
  title: "Контакти",
  description: DESCRIPTION,
  path: "/kontakti",
  keywords: [
    "контакти За Бобов дол",
    "връзка с екипа на сайта",
    "добавете услуга в Бобов дол",
    "предложение за граждански портал",
    "телефон и имейл За Бобов дол",
    "Carbon Stealth",
  ],
});

// Имейлът се пренася само след „@“ (никога насред домейна).
function EmailText({ email }: { email: string }) {
  const at = email.indexOf("@");
  if (at < 0) return <>{email}</>;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

export default function ContactsPage() {
  return (
    <>
      {/* BreadcrumbList идва от PageHero (crumbs) — тук само ContactPage (B28). */}
      <JsonLd
        data={webPageLd({
          name: "Контакти",
          description: DESCRIPTION,
          path: "/kontakti",
          type: "ContactPage",
        })}
      />
      <PageHero
        eyebrow={SECTION.site}
        title="Контакти"
        intro="Имате въпрос, предложение или искате да добавим ваша услуга или бизнес? Обадете се или ни пишете."
        crumbs={[{ name: "Контакти", path: "/kontakti" }]}
      />
      <div className="container-content py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          {/* На телефон данните са първи — едно докосване до обаждане. */}
          <aside aria-labelledby="kontakti-danni" className="panel min-w-0 space-y-4 lg:order-2">
            <h2 id="kontakti-danni" className="h-card">
              Екипът на сайта
            </h2>
            {SITE.contact.phone && (
              <PhoneButton phone={SITE.contact.phone} label="Обадете се:" full className="justify-start" />
            )}
            {SITE.contact.email && (
              <a
                href={`mailto:${SITE.contact.email}`}
                className="btn-secondary w-full justify-start text-left [overflow-wrap:anywhere]"
              >
                <Mail className="h-5 w-5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  Пишете ни: <EmailText email={SITE.contact.email} />
                </span>
              </a>
            )}
            <p className="flex items-start gap-2 text-base text-slate-700">
              <MapPin className="mt-1 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <span>
                {SITE.geo.city}, {SITE.geo.region}, {SITE.geo.country}
              </span>
            </p>
            <p className="border-t border-slate-200 pt-4 text-base text-slate-600">
              Отговаряме в рамките на няколко работни дни. Това е независим граждански сайт — за
              услуги на общината се обръщайте към самата община.
            </p>
          </aside>

          <div className="min-w-0 lg:order-1">
            <ContactForm />
          </div>
        </div>
      </div>
    </>
  );
}
