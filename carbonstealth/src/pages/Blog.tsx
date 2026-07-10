// Блог — индекс + единична статия. Данни от blog.json (5 статии × 3 езика).
import { useNavigate } from 'react-router-dom';
import { useContent } from '@/lib/content-context';
import { useAsync } from '@/hooks/useAsync';
import { loadBlog } from '@/lib/data';
import { useSeo } from '@/lib/seo';
import { pathOf } from '@/lib/i18n';
import Blocks from '@/components/Blocks';
import ScrambleText from '@/components/ScrambleText';
import PageShell from './PageShell';
import NotFound from './NotFound';
import BootScreen from '@/components/BootScreen';

export function BlogIndex({ pathname }: { pathname: string }): React.JSX.Element {
  const { lang, content } = useContent();
  const navigate = useNavigate();
  const { data } = useAsync(loadBlog, []);
  // Локализирани заглавие/описание от content.pages вместо хардкоднат текст
  const pageMeta = content.pages['blog'];
  useSeo(pathname, {
    title: pageMeta?.title,
    description: pageMeta?.metaDescription,
  });

  if (!data) return <BootScreen />;

  return (
    <PageShell>
      <h1 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', marginBottom: 40 }}>
        {pageMeta?.h1 ?? 'Blog'}
      </h1>
      <div style={{ display: 'grid', gap: 4 }}>
        {Object.keys(data.posts).map((slug) => {
          const post = data.posts[slug][lang];
          if (!post) return null;
          const path = pathOf(post.url);
          return (
            <button
              key={slug}
              onClick={() => navigate(path)}
              data-cursor
              className="cs-card"
              style={{ textAlign: 'left', border: '1px solid rgba(245,245,240,.06)', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 10, color: 'var(--cyan)', letterSpacing: '.15em' }}>
                {post.dateLine}
              </div>
              <h3 style={{ fontSize: '1.3rem', margin: '10px 0', color: 'var(--off-white)' }}>
                <ScrambleText text={post.h1 || post.title} />
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text)' }}>{post.metaDescription}</p>
            </button>
          );
        })}
      </div>
    </PageShell>
  );
}

export function BlogPost({
  slug,
  pathname,
}: {
  slug: string;
  pathname: string;
}): React.JSX.Element {
  const { lang } = useContent();
  const { data } = useAsync(loadBlog, []);

  const post = data?.posts[slug]?.[lang];
  useSeo(pathname, {
    title: post?.title,
    description: post?.metaDescription,
    jsonLd: post?.jsonLd,
  });

  if (!data) return <BootScreen />;
  if (!post) return <NotFound />;

  return (
    <PageShell>
      <article>
        <div className="cs-tag">{post.dateLine}</div>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,3rem)', margin: '8px 0 32px', color: 'var(--off-white)' }}>
          {post.h1}
        </h1>
        <Blocks blocks={post.content} />
      </article>
    </PageShell>
  );
}
