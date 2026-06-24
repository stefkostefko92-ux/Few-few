import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata, newsArticleLd, canonical } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

async function getPost(slug: string) {
  return prisma.post.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: p.seoTitle || p.title,
    description: p.seoDescription || p.excerpt || plainText(p.content, 155),
    path: `/novini/${p.slug}`,
    type: "article",
  });
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) notFound();

  return (
    <>
      <JsonLd
        data={newsArticleLd({
          title: p.title,
          description: p.excerpt || plainText(p.content, 200),
          url: canonical(`/novini/${p.slug}`),
          publishedAt: p.publishedAt,
          updatedAt: p.updatedAt,
          image: p.coverImage || undefined,
        })}
      />
      <PageHero
        title={p.title}
        crumbs={[
          { name: "Новини", path: "/novini" },
          { name: p.title, path: `/novini/${p.slug}` },
        ]}
      />
      <article className="container-content max-w-3xl py-10">
        {p.publishedAt && (
          <div className="text-sm text-slate-500">
            {new Intl.DateTimeFormat("bg-BG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(p.publishedAt)}
          </div>
        )}
        <div className="mt-4">
          <Prose html={renderMarkdown(p.content)} />
        </div>
        {p.source && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Източник: <strong>{p.source}</strong>
            {p.sourceUrl && (
              <>
                {" — "}
                <a
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 underline"
                >
                  прочетете оригинала
                </a>
              </>
            )}
          </div>
        )}
        <div className="mt-8 border-t border-slate-200 pt-5">
          <PrintButton variant="secondary" label="Принтирай новината" />
        </div>
      </article>
    </>
  );
}
