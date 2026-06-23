import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Спомени от Бобов дол — споделени от жителите истории и снимки",
  description:
    "Жива памет на Бобов дол: спомени, истории и стари снимки, споделени от жителите — за мините, училището, празниците и хората на града.",
  path: "/spomeni",
});

export default async function MemoriesPage() {
  const memories = await prisma.memory.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHero
        title="Спомени от Бобов дол"
        intro="Жива памет на града — споделена от вас. Разкажете спомен или вижте спомените на съседите си. Всеки спомен е частица от историята."
        crumbs={[{ name: "Спомени", path: "/spomeni" }]}
      />
      <div className="container-content py-10">
        <div className="mb-6 flex justify-end">
          <Link href="/spomeni/nov" className="btn-primary">
            + Споделете спомен
          </Link>
        </div>

        {memories.length === 0 ? (
          <EmptyState
            title="Все още няма споделени спомени."
            hint="Бъдете първите — разкажете спомен от стария Бобов дол."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {memories.map((m) => (
              <Link key={m.id} href={`/spomeni/${m.slug}`} className="card">
                {m.period && <div className="badge">{m.period}</div>}
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{m.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{plainText(m.content, 130)}</p>
                {m.author && <div className="mt-2 text-xs text-slate-600">— {m.author}</div>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
