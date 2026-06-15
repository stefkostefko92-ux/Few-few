import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "Контакти",
  description: "Свържете се с екипа на За Бобов дол.",
  path: "/kontakti",
});

export default function ContactsPage() {
  return (
    <>
      <PageHero
        title="Контакти"
        intro="Имате въпрос, предложение или искате да добавим ваша услуга/бизнес? Пишете ни."
        crumbs={[{ name: "Контакти", path: "/kontakti" }]}
      />
      <div className="container-content max-w-2xl py-10">
        <div className="card space-y-4">
          {SITE.contact.email && (
            <div>
              <div className="text-xs uppercase text-slate-400">Имейл</div>
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
              <div className="text-xs uppercase text-slate-400">Телефон</div>
              <a
                href={`tel:${SITE.contact.phone}`}
                className="text-lg font-semibold text-brand-700"
              >
                {SITE.contact.phone}
              </a>
            </div>
          )}
          <div>
            <div className="text-xs uppercase text-slate-400">Населено място</div>
            <div className="text-slate-700">
              {SITE.geo.city}, {SITE.geo.region}, {SITE.geo.country}
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Отговаряме в рамките на няколко работни дни.
          </p>
        </div>
      </div>
    </>
  );
}
