import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailActions, PageHero, Prose, safeHttpUrl } from "@/components/ui";
import { buildMetadata, newsArticleLd, canonical } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { newsDate } from "@/lib/news";
import { formatDate, isoDate } from "@/lib/format-date";

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
    keywords: [
      "новини Бобов дол",
      "Бобов дол днес",
      "съобщения Бобов дол",
      p.source ? `${p.source} съобщение` : "За Бобов дол новини",
      "граждански портал Бобов дол",
    ],
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
  const d = newsDate(p);
  const sourceUrl = safeHttpUrl(p.sourceUrl);

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
      {/* Статията започва от лявата линия на H1 (не центрирана), колона ~70 знака. */}
      <div className="container-content py-10">
        <article className="max-w-3xl">
          <p className="text-meta">
            {/* Внесена новина → източникът ѝ; иначе — нашата редакция. */}
            {p.source ? `Източник: ${p.source}` : "Редакция „За Бобов дол“"}
            {"\u00a0· "}
            <time dateTime={isoDate(d)}>{formatDate(d)}</time>
          </p>
          <div className="mt-4">
            <Prose html={renderMarkdown(p.content)} />
          </div>
          {p.source && (
            <p className="mt-8 border-t border-slate-200 pt-5 text-base text-slate-700">
              Източник: <strong className="font-semibold text-slate-900">{p.source}</strong>
              {sourceUrl && (
                <>
                  {" — "}
                  <a
                    href={sourceUrl.toString()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    прочетете оригинала
                    <span className="sr-only"> (отваря се в нов раздел)</span>
                  </a>
                </>
              )}
            </p>
          )}
          <DetailActions
            shareTitle={p.title}
            shareText={`${p.title} — „За Бобов дол“`}
            sharePath={`/novini/${p.slug}`}
            printLabel="Отпечатайте новината"
          />
        </article>
      </div>
    </>
  );
}
