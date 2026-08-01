import Link from 'next/link';

import { prisma } from '@/lib/db';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 300;

export const metadata = pageMetadata({
  title: 'Новини и туториали за FiveM',
  description:
    'Новини от FiveM света и туториали на български: как се инсталира клиентът, как се влиза в сървър, какво е ESX и QBCore.',
  path: '/news',
  keywords: ['FiveM туториали', 'как да играя FiveM', 'FiveM новини'],
});

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

export default async function NewsPage() {
  const posts = await listPosts();

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Новини и туториали</h1>
      {posts.length === 0 ? (
        <p className="mt-6 text-slate-300">Още няма публикувани статии.</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {posts.map((post) => (
            <li key={post.slug}>
              <h2 className="text-lg font-medium">
                <Link href={`/news/${post.slug}`} className="hover:text-fivem-400">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-1 text-slate-300">{post.excerpt}</p>
              {post.publishedAt && (
                <time dateTime={post.publishedAt.toISOString()} className="text-sm text-slate-400">
                  {post.publishedAt.toLocaleDateString('bg-BG')}
                </time>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
