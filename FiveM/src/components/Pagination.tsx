import Link from 'next/link';

import { pageHref, pageWindow } from '@/lib/pagination';

/**
 * Страниците на каталога — обикновени `<a href>`, рендирани на сървъра: това
 * са и пътищата, по които търсачката стига до всеки сървър, затова не са
 * бутони и не искат JavaScript.
 */
export function Pagination({
  base,
  page,
  pages,
  params,
  labels,
}: {
  /** Пътят без заявка: `/bg/servers`. */
  base: string;
  page: number;
  pages: number;
  /** Останалите параметри, които се пазят между страниците (`q`, `sort`). */
  params?: Record<string, string | undefined>;
  labels: { pagination: string; page: string; prev: string; next: string };
}) {
  if (pages <= 1) return null;
  const link =
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.02] px-4 text-sm tabular-nums text-silver-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200';

  return (
    <nav aria-label={labels.pagination} className="mt-10">
      <ul className="flex flex-wrap items-center gap-2">
        {page > 1 && (
          <li>
            <Link href={pageHref(base, page - 1, params)} rel="prev" className={link}>
              {labels.prev}
            </Link>
          </li>
        )}
        {pageWindow(page, pages).map((n, index) =>
          n === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-silver-500">
              …
            </li>
          ) : (
            <li key={n}>
              {n === page ? (
                <span aria-current="page" className={`${link} border-cyan-300/50 bg-cyan-400/10 text-cyan-200`}>
                  <span className="sr-only">{labels.page} </span>
                  {n}
                </span>
              ) : (
                <Link href={pageHref(base, n, params)} className={link}>
                  <span className="sr-only">{labels.page} </span>
                  {n}
                </Link>
              )}
            </li>
          ),
        )}
        {page < pages && (
          <li>
            <Link href={pageHref(base, page + 1, params)} rel="next" className={link}>
              {labels.next}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
