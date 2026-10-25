import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, FilterChips, ListToolbar } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { LISTING_TYPE_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Обяви в Бобов дол — безплатни местни обяви",
  description:
    "Безплатни местни обяви в Бобов дол: продажби, търсене, работа, имоти и подаръци. Подайте своя обява безплатно.",
  path: "/obyavi",
  keywords: [
    "обяви Бобов дол",
    "безплатни обяви Бобов дол",
    "продавам Бобов дол",
    "работа Бобов дол",
    "имоти Бобов дол",
  ],
});

function listingsLabel(n: number): string {
  return `${n.toLocaleString("bg-BG")} ${n === 1 ? "обява" : "обяви"}`;
}

const addAction = (
  <Link href="/obyavi/nova" className="btn-primary">
    <Plus className="h-5 w-5" aria-hidden />
    Подайте обява
  </Link>
);

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const validType = type && type in LISTING_TYPE_LABELS ? type : undefined;
  const active = {
    published: true,
    OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
  };

  const [listings, counts] = await Promise.all([
    prisma.listing.findMany({
      where: { ...active, ...(validType ? { type: validType as never } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.groupBy({ by: ["type"], where: active, _count: { _all: true } }),
  ]);

  const countOf = new Map(counts.map((c) => [c.type as string, c._count._all]));
  const total = counts.reduce((n, c) => n + c._count._all, 0);
  const typeLabel = validType ? labelFor(LISTING_TYPE_LABELS, validType) : "";
  // Празните видове не са чипове — не водят до „няма нищо“.
  const chips = [
    { href: "/obyavi", label: "Всички", active: !validType, count: total },
    ...Object.entries(LISTING_TYPE_LABELS)
      .filter(([k]) => (countOf.get(k) ?? 0) > 0 || k === validType)
      .map(([k, label]) => ({
        href: `/obyavi?type=${k}#rezultati`,
        label,
        active: validType === k,
        count: countOf.get(k) ?? 0,
      })),
  ];

  return (
    <>
      <PageHero
        eyebrow={SECTION.community}
        title="Обяви"
        intro="Безплатни местни обяви. Всяка обява се преглежда преди публикуване."
        crumbs={[{ name: "Обяви", path: "/obyavi" }]}
      />
      <div className="container-content py-10">
        {total > 0 && <FilterChips items={chips} label="Видове обяви" className="mb-6" />}

        <div id="rezultati">
          {listings.length === 0 ? (
            <EmptyState
              title={validType ? `Няма обяви в „${typeLabel}“.` : "Още няма обяви."}
              hint="Бъдете първите — подайте безплатна обява."
              action={
                <>
                  {addAction}
                  {validType && (
                    <Link href="/obyavi" className="btn-secondary">
                      Покажете всички
                    </Link>
                  )}
                </>
              }
            />
          ) : (
            <>
              <ListToolbar
                count={
                  validType
                    ? `${listingsLabel(listings.length)} в „${typeLabel}“`
                    : listingsLabel(listings.length)
                }
                action={addAction}
              />
              <ul role="list" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {listings.map((l) => (
                  <li key={l.id}>
                    <Link href={`/obyavi/${l.slug}`} className="card group flex h-full flex-col">
                      {!validType && (
                        <span className="badge mb-2">{labelFor(LISTING_TYPE_LABELS, l.type)}</span>
                      )}
                      <h2 className="h-card group-hover:text-brand-700 group-hover:underline">
                        {l.title}
                      </h2>
                      {l.description && (
                        <p className="mt-1 text-base text-slate-700">{plainText(l.description, 110)}</p>
                      )}
                      {l.price && (
                        <p className="mt-auto pt-3 text-lg font-semibold tabular-nums text-brand-800">
                          {l.price}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
