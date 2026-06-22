import type { Metadata } from "next";
import { buildMetadata, webPageLd, itemListLd, localBusinessLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Phone, Globe, MapPin, AlertTriangle } from "@/components/icons";
import {
  SERVICES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Service,
  type ServiceCategory,
} from "@/data/services";

export const metadata: Metadata = buildMetadata({
  title: "Услуги и телефони в Дупница",
  description:
    "Важните местни телефони и услуги за Дупница на едно място: болница, спешна помощ, ВиК, ток, автогара и община. Проверени данни с източници.",
  path: "/uslugi",
});

// Превръща показвания номер в стойност за tel: (маха интервали).
function telHref(number: string): string {
  return "tel:" + number.replace(/\s+/g, "");
}

function ServiceCard({ s }: { s: Service }) {
  return (
    <article className="card">
      <h3 className="font-display text-xl font-bold text-slate-900">{s.name}</h3>
      {s.description && (
        <p className="mt-2 text-base text-slate-600">{s.description}</p>
      )}

      {s.address && (
        <p className="mt-3 flex items-start gap-2 text-base text-slate-700">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
          <span>{s.address}</span>
        </p>
      )}

      {s.phones.length > 0 && (
        <ul className="mt-3 space-y-2">
          {s.phones.map((p) => (
            <li key={p.number}>
              <a
                href={telHref(p.number)}
                className="inline-flex items-center gap-2 text-lg font-semibold text-brand-700 hover:underline"
              >
                <Phone className="h-5 w-5" aria-hidden />
                {p.number}
              </a>
              {p.label && (
                <span className="ml-2 text-sm text-slate-500">{p.label}</span>
              )}
              {!p.verified && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  непотвърден
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {s.website && (
        <p className="mt-3">
          <a
            href={s.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-base font-medium text-brand-700 hover:underline"
          >
            <Globe className="h-5 w-5" aria-hidden />
            Отвори сайта
          </a>
        </p>
      )}
    </article>
  );
}

export default function UslugiPage() {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: SERVICES.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  const listLd = itemListLd(
    SERVICES.map((s) => ({ name: s.name, path: `/uslugi#${s.slug}` })),
    "Услуги и телефони в Дупница",
  );
  const businessLd = SERVICES.filter((s) => s.phones.some((p) => p.verified) || s.website).map(
    (s) =>
      localBusinessLd({
        name: s.name,
        description: s.description,
        address: s.address,
        website: s.website,
        phone: s.phones.find((p) => p.verified)?.number.replace(/\s+/g, ""),
        schemaType:
          s.category === "HEALTH"
            ? "MedicalOrganization"
            : s.category === "ADMIN"
              ? "GovernmentOffice"
              : "LocalBusiness",
      }),
  );

  return (
    <>
      <JsonLd
        data={[
          webPageLd({
            name: "Услуги и телефони в Дупница",
            path: "/uslugi",
            type: "CollectionPage",
          }),
          listLd,
          ...businessLd,
        ]}
      />
      <PageHero
        eyebrow="Указател"
        title="Услуги и телефони"
        intro="Важните местни телефони и услуги за Дупница на едно място. Натиснете върху номер, за да се обадите направо. Непотвърдените номера са обозначени."
        crumbs={[{ name: "Услуги и телефони", path: "/uslugi" }]}
      />

      <div className="container-content py-10">
        {/* Бърз скок по категории. */}
        <nav aria-label="Категории" className="mb-8 flex flex-wrap gap-2">
          {grouped.map(({ cat }) => (
            <a key={cat} href={`#${cat}`} className="badge hover:bg-brand-100">
              {CATEGORY_LABELS[cat as ServiceCategory]}
            </a>
          ))}
        </nav>

        <div className="space-y-12">
          {grouped.map(({ cat, items }) => (
            <section key={cat} id={cat} className="scroll-mt-24">
              <h2 className="section-title mb-6">
                {CATEGORY_LABELS[cat as ServiceCategory]}
              </h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {items.map((s) => (
                  <div key={s.slug} id={s.slug} className="scroll-mt-24">
                    <ServiceCard s={s} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-slate-500">
          Данните се поддържат ръчно и се проверяват периодично. Ако забележите
          грешка или липсващ телефон, ще се радваме да ни кажете. Информацията не
          замества официалните източници.
        </p>
      </div>
    </>
  );
}
