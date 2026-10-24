import Link from "next/link";
import { MapPin, Plus } from "@/components/icons";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, FilterChips, ListToolbar, Notice } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { HELP_KIND_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Зов за помощ — взаимопомощ и благотворителност за възрастните в Бобов дол",
  description:
    "Място, където жителите на Бобов дол могат да потърсят помощ за възрастен човек или да предложат своята помощ и дарение. Заедно за по-добра грижа.",
  path: "/zov-za-pomosht",
  keywords: [
    "зов за помощ Бобов дол",
    "взаимопомощ Бобов дол",
    "помощ за възрастни Бобов дол",
    "дарения Бобов дол",
    "благотворителност Бобов дол",
  ],
});

function causesLabel(n: number): string {
  return `${n.toLocaleString("bg-BG")} ${n === 1 ? "кауза" : "каузи"}`;
}

const addAction = (
  <Link href="/zov-za-pomosht/nova" className="btn-primary">
    <Plus className="h-5 w-5" aria-hidden />
    Подайте зов за помощ
  </Link>
);

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const validKind = kind === "NEED" || kind === "OFFER" ? kind : undefined;

  const kindLabel = validKind ? labelFor(HELP_KIND_LABELS, validKind) : "";
  const [causes, counts] = await Promise.all([
    prisma.helpCause.findMany({
      where: { published: true, ...(validKind ? { kind: validKind as never } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.helpCause.groupBy({ by: ["kind"], where: { published: true }, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.kind as string, c._count._all]));
  const total = counts.reduce((n, c) => n + c._count._all, 0);
  // Празните видове не са чипове — не водят до „няма нищо“ (както в /obyavi).
  const chips = [
    { href: "/zov-za-pomosht", label: "Всички", active: !validKind, count: total },
    ...Object.entries(HELP_KIND_LABELS)
      .filter(([k]) => (countOf.get(k) ?? 0) > 0 || k === validKind)
      .map(([k, label]) => ({
        href: `/zov-za-pomosht?kind=${k}#rezultati`,
        label,
        active: validKind === k,
        count: countOf.get(k) ?? 0,
      })),
  ];

  return (
    <>
      <PageHero
        title="Зов за помощ"
        intro="Взаимопомощ и грижа за възрастните хора в Бобов дол. Потърсете помощ за някого или предложете своята — малките жестове променят много."
        crumbs={[{ name: "Зов за помощ", path: "/zov-za-pomosht" }]}
      />
      <div className="container-content py-10">
        {total > 0 && <FilterChips items={chips} label="Вид зов" className="mb-6" />}

        <div id="rezultati">
          {causes.length === 0 ? (
            <EmptyState
              title={validKind ? `Няма каузи в „${kindLabel}“.` : "Все още няма публикувани каузи."}
              hint="Бъдете първите — подайте зов за помощ или предложете подкрепа."
              action={
                <>
                  {addAction}
                  {validKind && (
                    <Link href="/zov-za-pomosht" className="btn-secondary">
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
                  validKind
                    ? `${causesLabel(causes.length)} в „${kindLabel}“`
                    : causesLabel(causes.length)
                }
                action={addAction}
              />
              <ul role="list" className="grid gap-4 md:grid-cols-2">
                {causes.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/zov-za-pomosht/${c.slug}`}
                      className="card group flex h-full flex-col"
                    >
                      <span className={c.kind === "OFFER" ? "badge-success" : "badge"}>
                        {labelFor(HELP_KIND_LABELS, c.kind)}
                      </span>
                      <h2 className="h-card mt-2 group-hover:text-brand-700 group-hover:underline">
                        {c.title}
                      </h2>
                      {c.location && (
                        <p className="mt-1 flex items-start gap-1.5 text-base text-slate-700">
                          <MapPin className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                          <span>{c.location}</span>
                        </p>
                      )}
                      <p className="mt-2 text-base text-slate-600">{plainText(c.description, 120)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <Notice tone="scam" title="Внимавайте с измами" className="mt-10 max-w-3xl">
          <p>
            При дарения и помощ не превеждайте пари на непознати без проверка. Проектът не носи
            отговорност за договорки между хора.
          </p>
        </Notice>
      </div>
    </>
  );
}
