import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/JsonLd';
import { prisma } from '@/lib/db';
import { getDictionary, resolveLocale } from '@/i18n';
import { articleJsonLd, breadcrumbJsonLd, pageMetadata } from '@/lib/seo';

export const revalidate = 300;

type Params = { params: Promise<{ locale: string; slug: string }> };

async function getPost(slug: string, locale: string) {
  try {
    return await prisma.post.findFirst({
      where: { slug, locale, publishedAt: { not: null, lte: new Date() } },
    });
  } catch (error) {
    console.error('[post] статията не се прочете', error);
    return null;
  }
}

export async function generateMetadata({ params }: Params) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const post = await getPost(slug, locale);
  if (!post) return pageMetadata({ locale, title: t.news.notFound, description: '', noindex: true });

  return pageMetadata({
    locale,
    title: post.title,
    description: post.excerpt,
    path: `/news/${post.slug}`,
    keywords: [post.title],
    singleLocale: true,
  });
}

export default async function PostPage({ params }: Params) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const post = await getPost(slug, locale);
  if (!post) notFound();

  // Абзаците са празните редове в текста. Чист текст и пак — без HTML:
  // разделянето е само за ритъма на четене (отстояние между абзаците).
  // Резюмето стои отгоре като въвеждащ абзац — повтаря ли го текстът дословно
  // в началото, първият абзац пада, иначе читателят го чете два пъти.
  const parts = post.body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const paragraphs = post.excerpt && parts[0] === post.excerpt.trim() ? parts.slice(1) : parts;

  return (
    <article className="mx-auto max-w-[68ch]">
      <nav aria-label={t.common.breadcrumbLabel} className="text-sm text-silver-400">
        <Link
          href={`/${locale}/news`}
          className="inline-flex min-h-6 items-center underline underline-offset-4 hover:text-cyan-300"
        >
          {t.news.h1}
        </Link>
      </nav>

      <h1 className="page-title mt-4">{post.title}</h1>
      <p className="mt-3 text-sm text-silver-400">
        {post.author}
        {post.publishedAt && (
          <>
            <span aria-hidden="true" className="mx-2 text-silver-500">·</span>
            <time dateTime={post.publishedAt.toISOString()}>
              {post.publishedAt.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </>
        )}
      </p>
      {post.excerpt && <p className="mt-6 text-lg leading-relaxed text-silver-200">{post.excerpt}</p>}

      {/* Съдържанието е наше и се рендира като чист текст — без dangerouslySetInnerHTML. */}
      <div className="mt-8 space-y-5 border-t border-white/10 pt-8 text-[1.0625rem] leading-[1.75] text-silver-300">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>

      <JsonLd data={articleJsonLd(locale, post)} />
      <JsonLd
        data={breadcrumbJsonLd(locale, [
          { name: t.news.h1, path: '/news' },
          { name: post.title, path: `/news/${post.slug}` },
        ])}
      />
    </article>
  );
}
