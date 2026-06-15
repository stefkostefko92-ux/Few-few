import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { BUSINESS_CATEGORY_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Местен бизнес в Бобов дол — каталог на търговци и услуги",
  description:
    "Каталог на магазини, заведения, занаятчии и услуги в Бобов дол. Подкрепете местния бизнес — намерете телефон, адрес и работно време.",
  path: "/biznes",
});

export default async function BiznesPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const validCat = cat && cat in BUSINESS_CATEGORY_LABELS ? cat : undefined;

  const businesses = await prisma.business.findMany({
    where: {
      published: true,
      ...(validCat ? { category: validCat as never } : {}),
    },
    orderBy: [{ featured: "desc" }, { order: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHero
        title="Местен бизнес"
        intro="Каталог на търговци, заведения, занаятчии и услуги в Бобов дол. Искате да добавите своя бизнес? Пишете ни."
        crumbs={[{ name: "Местен бизнес", path: "/biznes" }]}
      />
      <div className="container-content py-10">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/biznes"
            className={
              "rounded-full px-4 py-2 text-sm font-medium " +
              (!validCat
                ? "bg-brand-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:border-brand-400")
            }
          >
            Всички
          </Link>
          {Object.entries(BUSINESS_CATEGORY_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={`/biznes?cat=${key}`}
              className={
                "rounded-full px-4 py-2 text-sm font-medium " +
                (validCat === key
                  ? "bg-brand-700 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:border-brand-400")
              }
            >
              {label}
            </Link>
          ))}
        </div>

        {businesses.length === 0 ? (
          <EmptyState
            title="Каталогът се попълва."
            hint="Ако имате местен бизнес, свържете се с нас, за да ви добавим безплатно."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b) => (
              <Link key={b.id} href={`/biznes/${b.slug}`} className="card">
                {b.featured && (
                  <span className="badge mb-2">Препоръчано</span>
                )}
                <div className="text-lg font-semibold text-slate-900">{b.name}</div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {labelFor(BUSINESS_CATEGORY_LABELS, b.category)}
                </div>
                {b.description && (
                  <p className="mt-2 text-sm text-slate-600">
                    {plainText(b.description, 110)}
                  </p>
                )}
                {b.address && (
                  <div className="mt-2 text-sm text-slate-500">{b.address}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
