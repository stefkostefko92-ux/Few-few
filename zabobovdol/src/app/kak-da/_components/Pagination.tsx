import Link from "next/link";
import { pageWindow } from "@/lib/howto";

// Навигация между страниците: едри „Предишна/Следваща“ (≥44px) и номера.
// `href(n)` строи адреса на страница n (първата е без ?page=).
export function Pagination({
  page,
  total,
  href,
}: {
  page: number;
  total: number;
  href: (n: number) => string;
}) {
  if (total <= 1) return null;
  const nums = pageWindow(page, total);
  const num =
    "a11y-btn inline-flex min-w-[44px] items-center justify-center rounded-lg border px-3 text-base font-semibold";
  return (
    <nav aria-label="Страници" className="no-print mt-10">
      <p className="mb-3 text-base text-slate-600">
        Страница {page} от {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} rel="prev" className="btn-secondary">
            <span aria-hidden>←</span> Предишна
          </Link>
        )}
        <ul className="flex flex-wrap gap-2">
          {nums.map((n, i) => (
            <li key={n} className="flex items-center gap-2">
              {i > 0 && n - nums[i - 1] > 1 && (
                <span aria-hidden className="text-slate-500">
                  …
                </span>
              )}
              {n === page ? (
                <span
                  aria-current="page"
                  className={num + " border-brand-700 bg-brand-700 text-white"}
                >
                  {n}
                </span>
              ) : (
                <Link
                  href={href(n)}
                  aria-label={`Страница ${n}`}
                  className={num + " border-slate-300 bg-white text-slate-800 hover:bg-brand-50"}
                >
                  {n}
                </Link>
              )}
            </li>
          ))}
        </ul>
        {page < total && (
          <Link href={href(page + 1)} rel="next" className="btn-secondary">
            Следваща <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
