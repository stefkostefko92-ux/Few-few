import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { PrintButton } from "@/components/PrintButton";

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
        title={m.title}
        crumbs={[
          { name: "Спомени", path: "/spomeni" },
          { name: m.title, path: `/spomeni/${m.slug}` },
        ]}
      />
      <article className="container-content max-w-3xl py-10">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          {m.period && <span className="badge">{m.period}</span>}
          {m.author && <span>Разказва: {m.author}</span>}
        </div>
        {m.imageUrl && (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.imageUrl} alt={m.title} className="w-full rounded-xl" loading="lazy" />
          </div>
        )}
        <div className="mt-4">
          <Prose html={renderMarkdown(m.content)} />
        </div>
        <div className="mt-6 no-print">
          <PrintButton variant="secondary" />
        </div>
      </article>
    </>
  );
}
