import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata, canonical, newsArticleLd, breadcrumbLd } from "@/lib/seo";
import { getPostBySlug } from "@/lib/data";
import { markdownToHtml } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { CalendarDays } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return buildMetadata({ title: "Новината не е намерена", noindex: true });
  return buildMetadata({
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt || undefined,
    path: `/novini/${post.slug}`,
    type: "article",
    images: post.coverUrl ? [post.coverUrl] : undefined,
  });
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const html = markdownToHtml(post.body);

  return (
    <>
      <PageHero
        eyebrow="Новини"
        title={post.title}
        crumbs={[
          { name: "Новини", path: "/novini" },
          { name: post.title, path: `/novini/${post.slug}` },
        ]}
      />
      <JsonLd
        data={[
          newsArticleLd({
            title: post.title,
            description: post.excerpt || undefined,
            url: canonical(`/novini/${post.slug}`),
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            image: post.coverUrl || undefined,
          }),
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Новини", path: "/novini" },
            { name: post.title, path: `/novini/${post.slug}` },
          ]),
        ]}
      />
      <article className="container-content max-w-3xl py-10">
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <CalendarDays className="h-4 w-4" aria-hidden />
          {formatDate(post.publishedAt)}
        </p>
        {post.coverUrl && (
          <div className="mt-4 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.coverUrl} alt="" className="w-full object-cover" />
          </div>
        )}
        {post.excerpt && (
          <p className="mt-5 text-lg font-medium text-slate-700">{post.excerpt}</p>
        )}
        <div className="mt-5">
          <Prose html={html} />
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6">
          <Link href="/novini" className="text-sm font-semibold text-brand-800 hover:underline">
            ← Всички новини
          </Link>
        </div>
      </article>
    </>
  );
}
