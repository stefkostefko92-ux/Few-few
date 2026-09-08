import { Badge } from '@/components/Badge';
import type { PageBlock, SimplePage } from '@/content/pages';

/**
 * Обемната икона стои тук на 48 px — размерът, за който е рисувана. В чиповете
 * и навигацията остават линейните SVG: растер под ~28 px става каша.
 */
export function SimplePageView({ page, badge }: { page: SimplePage; badge: string }) {
  return (
    <article className="max-w-2xl">
      <div className="flex items-center gap-4">
        <Badge name={badge} size={48} />
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="text-chrome">{page.title}</span>
        </h1>
      </div>
      <p className="mt-4 text-silver-400">{page.intro}</p>

      <div className="mt-8 space-y-4 text-silver-300">
        {page.blocks.map((block: PageBlock, index) =>
          block.h ? (
            <h2 key={index} className="pt-4 text-xl font-semibold text-silver-100">
              {block.h}
            </h2>
          ) : block.ul ? (
            <ul key={index} className="list-disc space-y-2 pl-5">
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
