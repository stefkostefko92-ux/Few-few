import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Plus } from "@/components/icons";
import { PageHero, EmptyState, ListToolbar } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Спомени от Бобов дол — споделени от жителите истории и снимки",
  description:
    "Жива памет на Бобов дол: спомени, истории и стари снимки, споделени от жителите — за мините, училището, празниците и хората на града.",
  path: "/spomeni",
  keywords: [
    "спомени Бобов дол",
    "история на Бобов дол",
    "стари снимки Бобов дол",
    "миньорски град спомени",
    "жива памет Бобов дол",
  ],
});

function memoriesLabel(n: number): string {
  return `${n.toLocaleString("bg-BG")} ${n === 1 ? "спомен" : "спомена"}`;
}

const addAction = (
  <Link href="/spomeni/nov" className="btn-primary">
    <Plus className="h-5 w-5" aria-hidden />
    Споделете спомен
  </Link>
);

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
        {memories.length === 0 ? (
          <EmptyState
            title="Все още няма споделени спомени."
            hint="Бъдете първите — разкажете спомен от стария Бобов дол."
            action={addAction}
          />
        ) : (
          <>
            <ListToolbar count={memoriesLabel(memories.length)} action={addAction} />
            <ul role="list" className="grid gap-4 md:grid-cols-2">
              {memories.map((m) => (
                <li key={m.id}>
                  <Link href={`/spomeni/${m.slug}`} className="card group flex h-full flex-col">
                    {m.period && <span className="badge mb-2">{m.period}</span>}
                    <h2 className="h-card group-hover:text-brand-700 group-hover:underline">
                      {m.title}
                    </h2>
                    <p className="mt-1 text-base text-slate-700">{plainText(m.content, 130)}</p>
                    {m.author && <p className="text-meta mt-auto pt-3">Разказва: {m.author}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
