import Link from "next/link";
import type { Metadata } from "next";
import { Phone, Clock } from "@/components/icons";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, itemListLd } from "@/lib/seo";
import { SERVICE_CATEGORY_LABELS, labelFor } from "@/lib/categories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Услуги и важни телефони в Бобов дол",
  description:
    "Указател с важни местни телефони и услуги в Бобов дол: здраве, администрация, комунални услуги, транспорт, социални и спешни телефони.",
  path: "/uslugi",
});

export default async function UslugiPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const validCat = cat && cat in SERVICE_CATEGORY_LABELS ? cat : undefined;

  const services = await prisma.service.findMany({
    where: {
      published: true,
      ...(validCat ? { category: validCat as never } : {}),
    },
    orderBy: [{ category: "asc" }, { order: "asc" }, { name: "asc" }],
  });

  return (
    <>
      {services.length > 0 && (
        <JsonLd
          data={itemListLd(
            services.slice(0, 50).map((s) => ({
              name: s.name,
              path: `/uslugi/${s.slug}`,
            })),
            "Услуги и важни телефони в Бобов дол",
          )}
        />
      )}
      <PageHero
        title="Услуги и важни телефони"
        intro="Намерете бързо телефон, адрес и работно време на важните услуги в града."
        crumbs={[{ name: "Услуги и телефони", path: "/uslugi" }]}
      />
      <div className="container-content py-10">
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            href="/uslugi"
            className={
              "rounded-full px-4 py-2 text-sm font-medium " +
              (!validCat
                ? "bg-brand-700 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:border-brand-400")
            }
          >
            Всички
          </Link>
          {Object.entries(SERVICE_CATEGORY_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={`/uslugi?cat=${key}`}
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

        {services.length === 0 ? (
          <EmptyState title="Няма услуги в тази категория все още." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <div key={s.id} className="card flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/uslugi/${s.slug}`} className="text-lg font-semibold text-slate-900 hover:text-brand-700">
                    {s.name}
                  </Link>
                  {s.isEmergency && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      спешен
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-slate-600">
                  {labelFor(SERVICE_CATEGORY_LABELS, s.category)}
                </div>
                {s.address && (
                  <div className="mt-2 text-sm text-slate-600">{s.address}</div>
                )}
                {s.hours && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                    <Clock className="h-4 w-4 shrink-0" aria-hidden /> {s.hours}
                  </div>
                )}
                <OpenNowBadge hours={s.hours} className="mt-1.5" />
                {s.phone && (
                  <a
                    href={`tel:${s.phone}`}
                    className="btn-secondary mt-3 w-full"
                  >
                    <Phone className="h-4 w-4" aria-hidden /> {s.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
