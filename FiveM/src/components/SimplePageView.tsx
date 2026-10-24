import { Badge } from '@/components/Badge';
import type { PageBlock, SimplePage } from '@/content/pages';

/**
 * Обемната икона стои тук на 48 px — размерът, за който е рисувана. В чиповете
 * и навигацията остават линейните SVG: растер под ~28 px става каша.
 */
export function SimplePageView({ page, badge }: { page: SimplePage; badge: string }) {
  return (
    <article>
      <header className="max-w-3xl">
        <div className="flex items-center gap-5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-white/[0.1] bg-ink-900 shadow-[0_0_40px_-10px_rgba(60,204,228,0.5)]">
            <Badge name={badge} size={48} />
          </span>
          <h1 className="page-title">{page.title}</h1>
        </div>
        <p className="lead mt-6">{page.intro}</p>
      </header>

      <div className="hairline mt-10 max-w-3xl" aria-hidden="true" />

      <div className="prose-doc mt-8">
        {page.blocks.map((block: PageBlock, index) =>
          block.h ? (
            <h2 key={index}>{block.h}</h2>
          ) : block.ul ? (
            <ul key={index}>
              {block.ul.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p key={index}>{block.p}</p>
          ),
        )}
      </div>
    </article>
  );
}
