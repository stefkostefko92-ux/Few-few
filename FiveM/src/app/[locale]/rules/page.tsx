import Link from 'next/link';

import { Badge } from '@/components/Badge';
import { getContent } from '@/content';
import { getDictionary, resolveLocale } from '@/i18n';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86_400;

/** Обемна значка на всеки раздел — трите слоя правила се различават с поглед. */
const SECTION_BADGE: Record<string, string> = {
  platform: 'cfx',
  rockstar: 'server',
  roleplay: 'heavy-rp',
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.rules.title,
    description: t.rules.description,
    path: '/rules',
    keywords: getContent(locale).rulesKeywords,
  });
}

export default async function RulesPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const { rules } = getContent(locale);

  return (
    <article className="max-w-3xl">
      <h1 className="page-title">
        {t.rules.h1}
      </h1>
      <p className="lead mt-5">{t.rules.intro}</p>

      <nav aria-label={t.rules.onThisPage} className="mt-8 flex flex-wrap gap-2 text-sm">
        {rules.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="inline-flex min-h-10 items-center rounded-full border border-white/[0.1] bg-white/[0.02] px-4 text-silver-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
          >
            {section.title}
          </a>
        ))}
      </nav>

      {rules.map((section) => (
        <section key={section.id} id={section.id} className="panel mt-6 scroll-mt-28 p-6 sm:p-8">
          {/* Заглавието често е на два реда: значката стои до ПЪРВИЯ ред, не по
              средата на блока (`1lh` = височината на реда на заглавието). */}
          <h2 className="section-title flex items-start gap-3">
            <Badge name={SECTION_BADGE[section.id] ?? 'rules'} size={40} className="mt-[calc((1lh_-_40px)/2)]" />
            {section.title}
          </h2>
          <p className="mt-3 leading-relaxed text-silver-400">{section.intro}</p>

          <ul className="mt-6 space-y-8">
            {section.items.map((item) => (
              <li key={item.id} id={item.id} className="scroll-mt-24">
                <h3 className="font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-silver-100">
                  {item.title}
                  {item.community && (
                    <span className="chip ms-2 align-middle font-ui font-normal">
                      {t.rules.communityPractice}
                    </span>
                  )}
                </h3>
                <p className="mt-2 leading-relaxed text-silver-400">{item.body}</p>

                {item.example && (
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.05] p-4">
                      <dt className="font-medium text-cyan-200">✓</dt>
                      <dd className="mt-1 text-silver-300">{item.example.good}</dd>
                    </div>
                    <div className="rounded-xl border border-red-400/25 bg-red-950/25 p-4">
                      <dt className="font-medium text-red-300">✕</dt>
                      <dd className="mt-1 text-silver-300">{item.example.bad}</dd>
                    </div>
                  </dl>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-silver-500">
            {t.rules.sourceLabel}:{' '}
            {section.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 && ' · '}
                <a
                  href={source.url}
                  rel="noopener nofollow"
                  className="link"
                >
                  {source.label}
                </a>
              </span>
            ))}
          </p>
        </section>
      ))}

      <p className="mt-12 text-sm text-silver-500">
        <Link href={`/${locale}/tutorials`} className="link">
          {t.nav.tutorials}
        </Link>
      </p>

      {/* БЕЗ BreadcrumbList: страницата няма видима пътека, а обявената
          („Сървъри › …“) беше и невярна — разделът не е под каталога.
          Структурираните данни описват каквото се вижда, не повече. */}
    </article>
  );
}
