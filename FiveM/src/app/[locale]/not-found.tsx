import Link from 'next/link';

import { Mascot } from '@/components/Mascot';
import { bg } from '@/i18n/dictionaries/bg';

/**
 * `not-found` няма достъп до `params` (Next го рендира извън сегмента), затова
 * тук стои езикът по подразбиране. Линковете сочат към него — по-добре работещ
 * изход на един език, отколкото счупен на два.
 */
export default function NotFound() {
  const t = bg;
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <Mascot detail="medium" size={140} expression="surprised" title={null} />

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.notFound.h1}</h1>
        <p className="mt-3 max-w-md text-silver-400">{t.notFound.body}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/bg"
          className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-ink-950 hover:bg-cyan-400"
        >
          {t.notFound.toList}
        </Link>
        <Link
          href="/bg/submit"
          className="rounded-lg border border-white/15 px-4 py-2 hover:border-cyan-500"
        >
          {t.notFound.submit}
        </Link>
      </div>
    </div>
  );
}
