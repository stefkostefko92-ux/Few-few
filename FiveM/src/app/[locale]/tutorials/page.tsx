import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { getContent } from '@/content';
import { getDictionary, resolveLocale } from '@/i18n';
import { howToJsonLd, pageMetadata } from '@/lib/seo';

export const revalidate = 86_400;

const TUTORIAL_BADGE: Record<string, string> = {
  install: 'download',
  join: 'online',
  'first-minutes': 'profile',
  frameworks: 'settings',
  troubleshooting: 'warning',
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.tutorials.title,
    description: t.tutorials.description,
    path: '/tutorials',
    keywords: getContent(locale).tutorialsKeywords,
  });
}

export default async function TutorialsPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const { tutorials } = getContent(locale);

  return (
    <article className="max-w-3xl">
      <h1 className="page-title">
        {t.tutorials.h1}
      </h1>
      <p className="lead mt-5">{t.tutorials.intro}</p>

      <nav aria-label={t.rules.onThisPage} className="mt-8 flex flex-wrap gap-2 text-sm">
        {tutorials.map((tutorial) => (
          <a
            key={tutorial.id}
            href={`#${tutorial.id}`}
            className="inline-flex min-h-10 items-center rounded-full border border-white/[0.1] bg-white/[0.02] px-4 text-silver-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
          >
            {tutorial.title}
          </a>
        ))}
      </nav>

      {tutorials.map((tutorial) => (
        <section key={tutorial.id} id={tutorial.id} className="panel mt-6 scroll-mt-28 p-6 sm:p-8">
          {/* Заглавието често е на два реда: значката стои до ПЪРВИЯ ред, не по
              средата на блока (`1lh` = височината на реда на заглавието). */}
          <h2 className="section-title flex items-start gap-3">
            <Badge name={TUTORIAL_BADGE[tutorial.id] ?? 'rules'} size={40} className="mt-[calc((1lh_-_40px)/2)]" />
            {tutorial.title}
          </h2>
          <p className="mt-3 leading-relaxed text-silver-400">{tutorial.summary}</p>

          <ol className="mt-6 space-y-6">
            {tutorial.steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-ink-950 font-display text-sm font-semibold tabular-nums text-cyan-300 shadow-[0_0_20px_-6px_rgba(60,204,228,0.6)]"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-silver-100">
                    <span className="sr-only">
                      {t.tutorials.step} {index + 1}:{' '}
                    </span>
                    {step.title}
                  </h3>
                  <p className="mt-1.5 leading-relaxed text-silver-400">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <JsonLd data={howToJsonLd(locale, {
                  title: tutorial.title,
                  description: tutorial.summary,
                  steps: tutorial.steps,
                })} />
        </section>
      ))}

      <p className="mt-12 text-sm text-silver-500">
        <Link href={`/${locale}/rules`} className="link">
          {t.nav.rules}
        </Link>
      </p>

      {/* БЕЗ BreadcrumbList: страницата няма видима пътека, а обявената
          („Сървъри › …“) беше и невярна — разделът не е под каталога.
          Структурираните данни описват каквото се вижда, не повече. */}
    </article>
  );
}
