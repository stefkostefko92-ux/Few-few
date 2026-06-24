import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout, ResourceCard } from "@/components/content";
import { getPublishedBusinesses } from "@/lib/queries";
import { businessesByCategory } from "@/data/businesses";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Местен бизнес",
  description:
    "Каталог на местни търговци, услуги и занаятчии в Дупница — на едно място.",
  path: "/biznes",
});

const CAT_LABELS: Record<string, string> = {
  SHOP: "Магазини",
  FOOD: "Храна и заведения",
  SERVICE: "Услуги",
  CRAFT: "Занаяти",
  HEALTH: "Здраве и красота",
  OTHER: "Други",
};

export default async function BiznesPage() {
  const businesses = await getPublishedBusinesses();

  return (
    <>
      <JsonLd data={webPageLd({ name: "Местен бизнес", path: "/biznes", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Каталог"
        title="Местен бизнес"
        intro="Търговци, услуги и занаятчии от Дупница. Подкрепете местните."
        crumbs={[{ name: "Местен бизнес", path: "/biznes" }]}
      />

      <div className="container-content py-10">
        {/* Проверен статичен каталог (фирми и кантори с потвърдени телефони) */}
        {businessesByCategory().map((grp) => (
          <section key={grp.category} className="mb-10">
            <h2 className="section-title mb-4">{grp.category}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {grp.items.map((b) => (
                <li key={b.name} className="card">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {b.name}
                  </h3>
                  {b.description && (
                    <p className="mt-1 text-base text-slate-700">{b.description}</p>
                  )}
                  {b.address && (
                    <p className="mt-1 text-base text-slate-600">{b.address}</p>
                  )}
                  <div className="mt-2 flex flex-col gap-1">
                    {b.phones.map((p) => (
                      <a
                        key={p.number}
                        href={"tel:" + p.number.replace(/\s+/g, "")}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {p.number}
                        {p.label ? ` (${p.label})` : ""}
                      </a>
                    ))}
                  </div>
                  {b.website && (
                    <a
                      href={b.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm text-slate-500 hover:text-brand-700"
                    >
                      {b.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Каталог от базата (модериран през админ) — допълва статичния по-горе */}
        {businesses.length === 0 ? (
          <>
            <Callout tone="info">
              Каталогът тепърва се изгражда. Имате бизнес в Дупница и искате да сте
              тук? Пишете ни през „Контакти“.
            </Callout>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <ResourceCard
                title="Аптеки в Дупница"
                text="Външен указател с аптеки и контакти."
                href="https://dupnitsa.net/аптеки-в-град-дупница/"
                hrefLabel="Виж указателя"
              />
              <ResourceCard
                title="Лекари в Дупница"
                text="Външен указател с контакти на лекари."
                href="https://dupnitsa.net/доктори-в-град-дупница/"
                hrefLabel="Виж указателя"
              />
            </div>
          </>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {businesses.map((b) => (
              <li key={b.id} className="card">
                <span className="badge">{CAT_LABELS[b.category] ?? "Бизнес"}</span>
                <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                  {b.name}
                </h2>
                {b.description && (
                  <p className="mt-2 text-base text-slate-700">{b.description}</p>
                )}
                {b.address && (
                  <p className="mt-1 text-base text-slate-600">{b.address}</p>
                )}
                {b.phone && (
                  <a
                    href={"tel:" + b.phone.replace(/\s+/g, "")}
                    className="mt-2 inline-block font-semibold text-brand-700 hover:underline"
                  >
                    {b.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
