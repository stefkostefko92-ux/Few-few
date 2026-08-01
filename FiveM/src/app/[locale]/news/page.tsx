import Link from 'next/link';

import { getDictionary } from '@/i18n';
import { isLocale } from '@/i18n/config';
import { prisma } from '@/lib/db';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.news.title,
    description: t.news.description,
    path: '/news',
    keywords: ['FiveM туториали', 'FiveM новини', 'FiveM tutorials'],
  });
}

async function listPosts() {
  try {
    return await prisma.post.findMany({
      where: { publishedAt: { not: null, lte: new Date() } },
      select: { slug: true, title: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
  } catch (error) {
    console.error('[news] списъкът не се прочете', error);
    return [];
  }
}

export default async function NewsPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  const posts = await listPosts();

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{t.news.h1}</span>
      </h1>
      {posts.length === 0 ? (
        <p className="mt-6 text-silver-400">{t.news.empty}</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {posts.map((post) => (
            <li key={post.slug}>
              <h2 className="text-lg font-medium">
                <Link href={`/${locale}/news/${post.slug}`} className="hover:text-cyan-300">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-1 text-silver-400">{post.excerpt}</p>
              {post.publishedAt && (
                <time dateTime={post.publishedAt.toISOString()} className="text-sm text-silver-500">
                  {post.publishedAt.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB')}
                </time>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
