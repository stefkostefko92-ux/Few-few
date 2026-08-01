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
  });
}

export default async function PostPage({ params }: Params) {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const post = await getPost(slug, locale);
  if (!post) notFound();

  return (
    <article className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
      <p className="mt-2 text-sm text-silver-500">
        {post.author}
        {post.publishedAt && (
          <>
            {' · '}
            <time dateTime={post.publishedAt.toISOString()}>
              {post.publishedAt.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB')}
            </time>
          </>
        )}
      </p>
      {/* Съдържанието е наше и се рендира като чист текст — без dangerouslySetInnerHTML. */}
      <div className="mt-6 whitespace-pre-line text-silver-300">{post.body}</div>

      <JsonLd data={articleJsonLd(locale, post)} />
      <JsonLd data={breadcrumbJsonLd(locale, [
              { name: t.news.h1, path: '/news' },
              { name: post.title, path: `/news/${post.slug}` },
            ])} />
    </article>
  );
}
