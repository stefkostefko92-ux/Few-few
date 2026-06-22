import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout, ResourceCard } from "@/components/content";
import { getPublishedBusinesses } from "@/lib/queries";

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
            <div className="mt-8">
              <EmptyState
                title="Все още няма добавени фирми"
                hint="Каталогът ще се попълва постепенно с проверени местни търговци и услуги."
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
