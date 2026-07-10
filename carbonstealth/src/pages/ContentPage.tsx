// Структурирана статична страница (услуги, правни, за нас, контакти, портфолио).
// Рендерира се от content.<lang>.pages[*].visibleBlocks.
import { useContent } from '@/lib/content-context';
import { useSeo } from '@/lib/seo';
import { normalizePath, pathOf } from '@/lib/i18n';
import Blocks from '@/components/Blocks';
import PageShell from './PageShell';
import NotFound from './NotFound';
import type { PageData } from '@/lib/types';

export default function ContentPage({ pathname }: { pathname: string }): React.JSX.Element {
  const { content } = useContent();
  const target = normalizePath(pathname);

  let page: PageData | undefined;
  for (const key of Object.keys(content.pages)) {
    const p = content.pages[key];
    if (p.url && pathOf(p.url) === target) {
      page = p;
      break;
    }
  }

  return page ? <Rendered page={page} pathname={target} /> : <NotFound />;
}

function Rendered({ page, pathname }: { page: PageData; pathname: string }): React.JSX.Element {
  useSeo(pathname, {
    title: page.title,
    description: page.metaDescription,
    jsonLd: page.jsonLd,
  });
  return (
    <PageShell>
      <article>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', marginBottom: 24, color: 'var(--off-white)' }}>
          {page.h1}
        </h1>
        {page.visibleBlocks && page.visibleBlocks.length > 0 ? (
          <Blocks blocks={page.visibleBlocks} />
        ) : (
          <p style={{ color: 'var(--text)' }}>{page.metaDescription}</p>
        )}
      </article>
    </PageShell>
  );
}
