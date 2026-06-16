import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { HELP_KIND_LABELS, labelFor } from "@/lib/categories";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Зов за помощ — взаимопомощ и благотворителност за възрастните в Бобов дол",
  description:
    "Място, където жителите на Бобов дол могат да потърсят помощ за възрастен човек или да предложат своята помощ и дарение. Заедно за по-добра грижа.",
  path: "/zov-za-pomosht",
});

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const validKind = kind === "NEED" || kind === "OFFER" ? kind : undefined;

  const causes = await prisma.helpCause.findMany({
    where: { published: true, ...(validKind ? { kind: validKind as never } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHero
        title="Зов за помощ"
        intro="Взаимопомощ и грижа за възрастните хора в Бобов дол. Потърсете помощ за някого или предложете своята — малките жестове променят много."
        crumbs={[{ name: "Зов за помощ", path: "/zov-za-pomosht" }]}
      />
      <div className="container-content py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/zov-za-pomosht"
              className={"rounded-full px-4 py-2 text-sm font-medium " + (!validKind ? "bg-brand-700 text-white" : "border border-slate-300 bg-white text-slate-700")}
            >
              Всички
            </Link>
            {Object.entries(HELP_KIND_LABELS).map(([k, label]) => (
              <Link
                key={k}
                href={`/zov-za-pomosht?kind=${k}`}
                className={"rounded-full px-4 py-2 text-sm font-medium " + (validKind === k ? "bg-brand-700 text-white" : "border border-slate-300 bg-white text-slate-700")}
              >
                {label}
              </Link>
            ))}
          </div>
          <Link href="/zov-za-pomosht/nova" className="btn-primary">
            + Подай зов
          </Link>
        </div>

        {causes.length === 0 ? (
          <EmptyState
            title="Все още няма публикувани каузи."
            hint="Бъдете първите — подайте зов за помощ или предложете подкрепа."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {causes.map((c) => (
              <Link key={c.id} href={`/zov-za-pomosht/${c.slug}`} className="card">
                <span
                  className={
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                    (c.kind === "OFFER" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")
                  }
                >
                  {labelFor(HELP_KIND_LABELS, c.kind)}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{c.title}</h3>
                {c.location && <div className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {c.location}</div>}
                <p className="mt-1 text-sm text-slate-600">{plainText(c.description, 120)}</p>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-8 max-w-3xl text-sm text-slate-500">
          Внимание: при дарения и помощ внимавайте с измами. Не превеждайте пари на
          непознати без проверка. Проектът не носи отговорност за договорки между
          хора.
        </p>
      </div>
    </>
  );
}
