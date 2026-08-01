import { notFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { articleJsonLd, breadcrumbJsonLd, jsonLdString, pageMetadata } from '@/lib/seo';

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

async function getPost(slug: string) {
  try {
    return await prisma.post.findFirst({
      where: { slug, publishedAt: { not: null, lte: new Date() } },
    });
  } catch (error) {
    console.error('[post] статията не се прочете', error);
    return null;
  }
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return pageMetadata({ title: 'Статията не е намерена', description: '', noindex: true });

  return pageMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/news/${post.slug}`,
    keywords: [post.title],
  });
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <article className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {post.author}
        {post.publishedAt && (
          <>
            {' · '}
            <time dateTime={post.publishedAt.toISOString()}>
              {post.publishedAt.toLocaleDateString('bg-BG')}
            </time>
          </>
        )}
      </p>
      {/* Съдържанието е наше и се рендира като чист текст — без dangerouslySetInnerHTML. */}
      <div className="mt-6 whitespace-pre-line text-slate-200">{post.body}</div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(articleJsonLd(post)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd([
              { name: 'Новини и туториали', path: '/news' },
              { name: post.title, path: `/news/${post.slug}` },
            ]),
          ),
        }}
      />
    </article>
  );
}
