import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { getPublishedListings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Обяви",
  description:
    "Безплатни местни обяви за Дупница — продава се, купува се, работа, имоти, подаръци.",
  path: "/obyavi",
});

const TYPE_LABELS: Record<string, string> = {
  OFFER: "Предлага се",
  WANTED: "Търси се",
  JOB: "Работа",
  REALESTATE: "Имоти",
  FREE: "Подарява се",
  OTHER: "Друго",
};

export default async function ObyaviPage() {
  const listings = await getPublishedListings();

  return (
    <>
      <JsonLd data={webPageLd({ name: "Обяви", path: "/obyavi", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Пазар"
        title="Обяви"
        intro="Безплатни местни обяви. Подайте своя — преглеждаме я и я публикуваме."
        crumbs={[{ name: "Обяви", path: "/obyavi" }]}
      />

      <div className="container-content py-10">
        <Link href="/obyavi/nova" className="btn-primary">
          Подай обява
        </Link>

        <div className="mt-8">
          {listings.length === 0 ? (
            <EmptyState
              title="Все още няма публикувани обяви"
              hint="Бъдете първи — подайте обява и тя ще се появи тук след преглед."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {listings.map((l) => (
                <li key={l.id} className="card">
                  <span className="badge">{TYPE_LABELS[l.type] ?? "Обява"}</span>
                  <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                    {l.title}
                  </h2>
                  {l.price && (
                    <p className="mt-1 font-semibold text-brand-700">{l.price}</p>
                  )}
                  {l.description && (
                    <p className="mt-2 text-base text-slate-700">{l.description}</p>
                  )}
                  {l.contactPhone && (
                    <a
                      href={"tel:" + l.contactPhone.replace(/\s+/g, "")}
                      className="mt-2 inline-block font-semibold text-brand-700 hover:underline"
                    >
                      {l.contactPhone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
