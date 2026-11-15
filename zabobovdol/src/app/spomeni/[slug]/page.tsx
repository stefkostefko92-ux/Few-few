import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailActions, PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { ReportContent } from "@/components/ReportContent";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

async function getMemory(slug: string) {
  return prisma.memory.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMemory(slug);
  if (!m) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: m.title,
    description: plainText(m.content, 155),
    path: `/spomeni/${m.slug}`,
    type: "article",
    keywords: [
      m.title,
      "спомени Бобов дол",
      "история на Бобов дол",
      m.period ? `Бобов дол ${m.period}` : "стари снимки Бобов дол",
      "жива памет Бобов дол",
    ],
  });
}

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const m = await getMemory(slug);
  if (!m) notFound();

  return (
    <>
      <PageHero
        eyebrow={SECTION.city}
        title={m.title}
        crumbs={[
          { name: "Спомени от Бобов дол", path: "/spomeni" },
          { name: m.title, path: `/spomeni/${m.slug}` },
        ]}
      />
      {/* Статията започва от лявата линия на H1 (не центрирана). */}
      <div className="container-content py-10">
        <article className="max-w-3xl">
          {(m.period || m.author) && (
            <div className="flex flex-wrap items-center gap-3">
              {m.period && <span className="badge">{m.period}</span>}
              {m.author && <p className="text-meta">Разказва: {m.author}</p>}
            </div>
          )}
          {m.imageUrl && (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.imageUrl} alt={m.title} className="w-full rounded-2xl" loading="lazy" />
            </div>
          )}
          <div className="mt-4">
            <Prose html={renderMarkdown(m.content)} />
          </div>
          <DetailActions
            shareTitle={`${m.title} — спомен от Бобов дол`}
            sharePath={`/spomeni/${m.slug}`}
          />
          <ReportContent subject={m.title} path={`/spomeni/${m.slug}`} />
        </article>
      </div>
    </>
  );
}
