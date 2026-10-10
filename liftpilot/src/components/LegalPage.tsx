import type { ReactNode } from 'react';
import '@/app/public.css';

export interface TocItem {
  id: string;
  label: string;
  /** a question under a part (indented in the list) */
  sub?: boolean;
}

function TocList({ items }: { items: readonly TocItem[] }) {
  return (
    <ol>
      {items.map((i) => <li key={i.id} className={i.sub ? 'sub' : undefined}><a href={`#${i.id}`}>{i.label}</a></li>)}
    </ol>
  );
}

// The frame of the long public texts (privacy and terms, an archived version of them, data and formats): the page's
// head on the blueprint grid, then one readable column; with a table of contents, a sticky list beside the column on
// wide screens and a folded one above it on phones (the two are never shown together). The text keeps the class
// `legal` (its headings and its print rules).
export default function LegalPage({ eyebrow, title, head, toc, tocLabel, children }: {
  eyebrow: string; title: ReactNode; head?: ReactNode; toc?: readonly TocItem[]; tocLabel?: string; children: ReactNode;
}) {
  const withToc = toc !== undefined && toc.length > 0;
  return (
    <main className="pub-page legal-page">
      <header className="pub-head blueprint">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {head}
      </header>
      <div className={withToc ? 'legal-body' : 'legal-body solo'}>
        {withToc ? (
          <>
            <nav className="legal-toc print-hide" aria-label={tocLabel}>
              <p className="eyebrow plain">{tocLabel}</p>
              <TocList items={toc} />
            </nav>
            <details className="legal-toc-m print-hide">
              <summary>{tocLabel}</summary>
              <TocList items={toc} />
            </details>
          </>
        ) : null}
        <article className="legal">{children}</article>
      </div>
    </main>
  );
}
