import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, Plus } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, FilterChips, ListToolbar } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { PhoneButton } from "@/components/PhoneButton";
import { buildMetadata, itemListLd } from "@/lib/seo";
import { BUSINESS_CATEGORY_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";
import { formatPhoneBg } from "@/lib/phone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Местен бизнес в Бобов дол — каталог на търговци и услуги",
  description:
    "Каталог на магазини, заведения, занаятчии и услуги в Бобов дол. Подкрепете местния бизнес — намерете телефон, адрес и работно време.",
  path: "/biznes",
  keywords: [
    "местен бизнес Бобов дол",
    "магазини Бобов дол",
    "заведения Бобов дол",
    "услуги Бобов дол",
    "каталог фирми Бобов дол",
  ],
});

function placesLabel(n: number): string {
  return `${n.toLocaleString("bg-BG")} ${n === 1 ? "обект" : "обекта"}`;
}

const addAction = (
  <Link href="/biznes/nova" className="btn-primary">
    <Plus className="h-5 w-5" aria-hidden />
    Добавете бизнес
  </Link>
);

export default async function BiznesPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const validCat = cat && cat in BUSINESS_CATEGORY_LABELS ? cat : undefined;

  const [businesses, counts] = await Promise.all([
    prisma.business.findMany({
      where: {
        published: true,
        ...(validCat ? { category: validCat as never } : {}),
      },
      // Подредбата „featured“ остава, но без значка „Препоръчано“ — гражданският
      // сайт не препоръчва търговци.
      orderBy: [{ featured: "desc" }, { order: "asc" }, { name: "asc" }],
    }),
    prisma.business.groupBy({
      by: ["category"],
      where: { published: true },
      _count: { _all: true },
    }),
  ]);

  const countOf = new Map(counts.map((c) => [c.category as string, c._count._all]));
  const total = counts.reduce((n, c) => n + c._count._all, 0);
  const catLabel = validCat ? labelFor(BUSINESS_CATEGORY_LABELS, validCat) : "";
  // Празните категории не са чипове — не водят до „няма нищо“.
  const chips = [
    { href: "/biznes", label: "Всички", active: !validCat, count: total },
    ...Object.entries(BUSINESS_CATEGORY_LABELS)
      .filter(([k]) => (countOf.get(k) ?? 0) > 0 || k === validCat)
      .map(([k, label]) => ({
        href: `/biznes?cat=${k}#rezultati`,
        label,
        active: validCat === k,
        count: countOf.get(k) ?? 0,
      })),
  ];

  return (
    <>
      {businesses.length > 0 && (
        <JsonLd
          data={itemListLd(
            businesses.slice(0, 50).map((b) => ({
              name: b.name,
              path: `/biznes/${b.slug}`,
            })),
            "Местен бизнес в Бобов дол",
          )}
        />
      )}
      <PageHero
        title="Местен бизнес"
        intro="Каталог на търговци, заведения, занаятчии и услуги в Бобов дол. Имате бизнес в града? Добавете го безплатно чрез формата."
        crumbs={[{ name: "Местен бизнес", path: "/biznes" }]}
      />
      <div className="container-content py-10">
        {total > 0 && <FilterChips items={chips} label="Категории бизнес" className="mb-6" />}

        <div id="rezultati">
          {businesses.length > 0 && (
            <ListToolbar
              count={
                validCat
                  ? `${placesLabel(businesses.length)} в „${catLabel}“`
                  : placesLabel(businesses.length)
              }
              action={addAction}
            />
          )}

          {businesses.length === 0 ? (
            <EmptyState
              title={validCat ? `Няма обекти в „${catLabel}“.` : "Каталогът се попълва."}
              hint="Имате бизнес в града? Добавете го безплатно — отнема около 3 минути."
              action={
                <>
                  {addAction}
                  {validCat && (
                    <Link href="/biznes" className="btn-secondary">
                      Покажете всички
                    </Link>
                  )}
                </>
              }
            />
          ) : (
            <ul role="list" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {businesses.map((b) => (
                <li key={b.id} className="card relative flex h-full flex-col">
                  <h2 className="h-card">
                    {/* Цялата карта води към детайла; телефонът е над връзката. */}
                    <Link
                      href={`/biznes/${b.slug}`}
                      className="after:absolute after:inset-0 after:rounded-2xl hover:text-brand-700 hover:underline"
                    >
                      {b.name}
                    </Link>
                  </h2>
                  {!validCat && (
                    <span className="badge mt-2">{labelFor(BUSINESS_CATEGORY_LABELS, b.category)}</span>
                  )}
                  {b.description && (
                    <p className="mt-2 text-base text-slate-700">{plainText(b.description, 110)}</p>
                  )}
                  {b.address && (
                    <p className="mt-2 flex items-start gap-1.5 text-base text-slate-700">
                      <MapPin className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      <span>{b.address}</span>
                    </p>
                  )}
                  <OpenNowBadge hours={b.hours} className="mt-2" />
                  {b.phone && (
                    <div className="relative z-10 mt-auto pt-4">
                      <PhoneButton
                        phone={b.phone}
                        full
                        aria-label={`Обадете се на ${b.name}: ${formatPhoneBg(b.phone)}`}
                      />
                    </div>
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
