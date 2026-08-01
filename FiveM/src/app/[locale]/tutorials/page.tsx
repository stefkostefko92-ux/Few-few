import Link from 'next/link';

import { getContent } from '@/content';
import { getDictionary } from '@/i18n';
import { isLocale } from '@/i18n/config';
import { breadcrumbJsonLd, howToJsonLd, jsonLdString, pageMetadata } from '@/lib/seo';

export const revalidate = 86_400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.tutorials.title,
    description: t.tutorials.description,
    path: '/tutorials',
    keywords: getContent(locale).keywords,
  });
}

export default async function TutorialsPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  const { tutorials } = getContent(locale);

  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{t.tutorials.h1}</span>
      </h1>
      <p className="mt-3 text-silver-400">{t.tutorials.intro}</p>

      <nav aria-label={t.rules.onThisPage} className="mt-6 flex flex-wrap gap-2 text-sm">
        {tutorials.map((tutorial) => (
          <a
            key={tutorial.id}
            href={`#${tutorial.id}`}
            className="rounded-lg border border-white/15 px-3 py-1.5 hover:border-cyan-500 hover:text-cyan-300"
          >
            {tutorial.title}
          </a>
        ))}
      </nav>

      {tutorials.map((tutorial) => (
        <section key={tutorial.id} id={tutorial.id} className="mt-12 scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-tight">{tutorial.title}</h2>
          <p className="mt-2 text-silver-400">{tutorial.summary}</p>

          <ol className="mt-6 space-y-6">
            {tutorial.steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-600 text-sm text-cyan-200"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium text-silver-100">
                    <span className="sr-only">
                      {t.tutorials.step} {index + 1}:{' '}
                    </span>
                    {step.title}
                  </h3>
                  <p className="mt-1 text-silver-400">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLdString(
                howToJsonLd(locale, {
                  title: tutorial.title,
                  description: tutorial.summary,
                  steps: tutorial.steps,
                }),
              ),
            }}
          />
        </section>
      ))}

      <p className="mt-12 text-sm text-silver-500">
        <Link href={`/${locale}/rules`} className="text-cyan-300 underline underline-offset-2">
          {t.nav.rules}
        </Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd(locale, [
              { name: t.nav.servers, path: '/' },
              { name: t.tutorials.h1, path: '/tutorials' },
            ]),
          ),
        }}
      />
    </article>
  );
}
