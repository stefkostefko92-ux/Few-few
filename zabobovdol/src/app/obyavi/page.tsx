import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { LISTING_TYPE_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Обяви в Бобов дол — безплатни местни обяви",
  description:
    "Безплатни местни обяви в Бобов дол: продажби, търсене, работа, имоти и подаръци. Подайте своя обява безплатно.",
  path: "/obyavi",
});

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const validType = type && type in LISTING_TYPE_LABELS ? type : undefined;

  const listings = await prisma.listing.findMany({
    where: {
      published: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      ...(validType ? { type: validType as never } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHero
        title="Обяви"
        intro="Безплатни местни обяви. Всяка обява се преглежда преди публикуване."
        crumbs={[{ name: "Обяви", path: "/obyavi" }]}
      />
      <div className="container-content py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/obyavi"
              className={
                "rounded-full px-4 py-2 text-sm font-medium " +
                (!validType
                  ? "bg-brand-700 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:border-brand-400")
              }
            >
              Всички
            </Link>
            {Object.entries(LISTING_TYPE_LABELS).map(([key, label]) => (
              <Link
                key={key}
                href={`/obyavi?type=${key}`}
                className={
                  "rounded-full px-4 py-2 text-sm font-medium " +
                  (validType === key
                    ? "bg-brand-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:border-brand-400")
                }
              >
                {label}
              </Link>
            ))}
          </div>
          <Link href="/obyavi/nova" className="btn-primary">
            + Подай обява
          </Link>
        </div>

        {listings.length === 0 ? (
          <EmptyState
            title="Още няма обяви."
            hint="Бъдете първите — подайте безплатна обява."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <Link key={l.id} href={`/obyavi/${l.slug}`} className="card">
                <div className="text-xs uppercase tracking-wide text-slate-600">
                  {labelFor(LISTING_TYPE_LABELS, l.type)}
                </div>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {l.title}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {plainText(l.description, 110)}
                </p>
                {l.price && (
                  <div className="mt-2 font-semibold text-brand-700">{l.price}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
