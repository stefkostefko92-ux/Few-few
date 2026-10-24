import Link from "next/link";
import { Clock, Coins, Plus, ShieldCheck } from "@/components/icons";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, FilterChips, ListToolbar, Notice } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { RIDE_KIND_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Споделено пътуване от Бобов дол — спътници и споделяне на разходите",
  description:
    "Пътувате по същия маршрут? Предложете място в колата или потърсете спътници и споделете разходите. Безплатни обяви за съвместно пътуване от/до Бобов дол.",
  path: "/spodeleno-patuvane",
  keywords: [
    "споделено пътуване Бобов дол",
    "превоз Бобов дол Дупница",
    "спътници Бобов дол",
    "пътуване от Бобов дол",
    "споделяне на разходи за път",
  ],
});

function ridesLabel(n: number): string {
  return `${n.toLocaleString("bg-BG")} ${n === 1 ? "обява" : "обяви"}`;
}

const addAction = (
  <Link href="/spodeleno-patuvane/nova" className="btn-primary">
    <Plus className="h-5 w-5" aria-hidden />
    Предложете пътуване
  </Link>
);

/** „Бобов дол → Дупница“ — стрелката е за окото, четецът чува „до“. */
function Route({ from, to }: { from: string; to: string }) {
  return (
    <>
      {from} <span aria-hidden="true">→</span>
      <span className="sr-only">до</span> {to}
    </>
  );
}

export default async function RidesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const validKind = kind === "OFFER" || kind === "NEED" ? kind : undefined;

  const kindLabel = validKind ? labelFor(RIDE_KIND_LABELS, validKind) : "";
  const active = {
    published: true,
    OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
  };
  const [rides, counts] = await Promise.all([
    prisma.rideshare.findMany({
      where: { ...active, ...(validKind ? { kind: validKind as never } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rideshare.groupBy({ by: ["kind"], where: active, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.kind as string, c._count._all]));
  const total = counts.reduce((n, c) => n + c._count._all, 0);

  return (
    <>
      <PageHero
        title="Споделено пътуване"
        intro="Хора, които пътуват по същия маршрут, споделят колата и разходите. Предложете място или потърсете спътници — спестявате пари и помагате на съседите си."
        crumbs={[{ name: "Споделено пътуване", path: "/spodeleno-patuvane" }]}
      />
      <div className="container-content py-10">
        <FilterChips
          items={[
            { href: "/spodeleno-patuvane", label: "Всички", active: !validKind, count: total },
            ...Object.entries(RIDE_KIND_LABELS).map(([k, label]) => ({
              href: `/spodeleno-patuvane?kind=${k}#rezultati`,
              label,
              active: validKind === k,
              count: countOf.get(k) ?? 0,
            })),
          ]}
          label="Вид обява"
          className="mb-6"
        />

        <div id="rezultati">
          {rides.length === 0 ? (
            <EmptyState
              title={validKind ? `Няма обяви в „${kindLabel}“.` : "Все още няма обяви."}
              hint="Бъдете първите — предложете място в колата или потърсете спътници."
              action={
                <>
                  {addAction}
                  {validKind && (
                    <Link href="/spodeleno-patuvane" className="btn-secondary">
                      Покажете всички
                    </Link>
                  )}
                </>
              }
            />
          ) : (
            <>
              <ListToolbar count={ridesLabel(rides.length)} action={addAction} />
              <ul role="list" className="grid gap-4 md:grid-cols-2">
                {rides.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/spodeleno-patuvane/${r.slug}`}
                      className="card group flex h-full flex-col"
                    >
                      <span className={r.kind === "OFFER" ? "badge-success" : "badge"}>
                        {labelFor(RIDE_KIND_LABELS, r.kind)}
                      </span>
                      <h2 className="h-card mt-2 group-hover:text-brand-700 group-hover:underline">
                        <Route from={r.routeFrom} to={r.routeTo} />
                      </h2>
                      {r.schedule && (
                        <p className="mt-1 flex items-start gap-1.5 text-base text-slate-700">
                          <Clock className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                          <span>{r.schedule}</span>
                        </p>
                      )}
                      {r.costNote && (
                        <p className="mt-1 flex items-start gap-1.5 text-base text-slate-700">
                          <Coins className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                          <span>{r.costNote}</span>
                        </p>
                      )}
                      {r.description && (
                        <p className="mt-2 text-base text-slate-600">{plainText(r.description, 100)}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <Notice title="За сигурност" icon={ShieldCheck} className="mt-10 max-w-3xl">
          <p>
            Уговаряйте се предварително, споделяйте плана с близък и не плащайте на непознати
            без яснота. Проектът само свързва хората и не носи отговорност за пътуванията.
          </p>
        </Notice>
      </div>
    </>
  );
}
