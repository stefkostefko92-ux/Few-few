import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { RIDE_KIND_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Споделено пътуване от Бобов дол — спътници и споделяне на разходите",
  description:
    "Пътувате по същия маршрут? Предложете място в колата или потърсете спътници и споделете разходите. Безплатни обяви за съвместно пътуване от/до Бобов дол.",
  path: "/spodeleno-patuvane",
});

export default async function RidesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const validKind = kind === "OFFER" || kind === "NEED" ? kind : undefined;

  const rides = await prisma.rideshare.findMany({
    where: {
      published: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      ...(validKind ? { kind: validKind as never } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHero
        title="Споделено пътуване"
        intro="Хора, които пътуват по същия маршрут, споделят колата и разходите. Предложете място или потърсете спътници — спестявате пари и помагате на съседите си."
        crumbs={[{ name: "Споделено пътуване", path: "/spodeleno-patuvane" }]}
      />
      <div className="container-content py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/spodeleno-patuvane"
              className={"rounded-full px-4 py-2 text-sm font-medium " + (!validKind ? "bg-brand-700 text-white" : "border border-slate-300 bg-white text-slate-700")}
            >
              Всички
            </Link>
            {Object.entries(RIDE_KIND_LABELS).map(([k, label]) => (
              <Link
                key={k}
                href={`/spodeleno-patuvane?kind=${k}`}
                className={"rounded-full px-4 py-2 text-sm font-medium " + (validKind === k ? "bg-brand-700 text-white" : "border border-slate-300 bg-white text-slate-700")}
              >
                {label}
              </Link>
            ))}
          </div>
          <Link href="/spodeleno-patuvane/nova" className="btn-primary">
            + Пусни обява
          </Link>
        </div>

        {rides.length === 0 ? (
          <EmptyState
            title="Все още няма обяви."
            hint="Бъдете първите — предложете място в колата или потърсете спътници."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rides.map((r) => (
              <Link key={r.id} href={`/spodeleno-patuvane/${r.slug}`} className="card">
                <span
                  className={
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                    (r.kind === "OFFER" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")
                  }
                >
                  {labelFor(RIDE_KIND_LABELS, r.kind)}
                </span>
                <h3 className="mt-2 font-display text-lg font-bold text-slate-900">
                  {r.routeFrom} → {r.routeTo}
                </h3>
                <div className="mt-1 text-sm text-slate-600">
                  {r.schedule && <>🕐 {r.schedule} </>}
                  {r.costNote && <> · 💰 {r.costNote}</>}
                </div>
                {r.description && (
                  <p className="mt-1 text-sm text-slate-600">{plainText(r.description, 100)}</p>
                )}
              </Link>
            ))}
          </div>
        )}

        <p className="mt-8 max-w-3xl text-sm text-slate-500">
          За сигурност: уговаряйте се предварително, споделяйте плана с близък и не
          плащайте на непознати без яснота. Проектът само свързва хората и не носи
          отговорност за пътуванията.
        </p>
      </div>
    </>
  );
}
