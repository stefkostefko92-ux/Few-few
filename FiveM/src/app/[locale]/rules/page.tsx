import Link from 'next/link';

import { Badge } from '@/components/Badge';
import { getContent } from '@/content';
import { getDictionary } from '@/i18n';
import { isLocale } from '@/i18n/config';
import { breadcrumbJsonLd, jsonLdString, pageMetadata } from '@/lib/seo';

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
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.rules.title,
    description: t.rules.description,
    path: '/rules',
    keywords: getContent(locale).keywords,
  });
}

export default async function RulesPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  const { rules } = getContent(locale);

  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{t.rules.h1}</span>
      </h1>
      <p className="mt-3 text-silver-400">{t.rules.intro}</p>

      <nav aria-label={t.rules.onThisPage} className="mt-6 flex flex-wrap gap-2 text-sm">
        {rules.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-lg border border-white/15 px-3 py-1.5 hover:border-cyan-500 hover:text-cyan-300"
          >
            {section.title}
          </a>
        ))}
      </nav>

      {rules.map((section) => (
        <section key={section.id} id={section.id} className="mt-12 scroll-mt-24">
          <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            <Badge name={SECTION_BADGE[section.id] ?? 'rules'} size={40} />
            {section.title}
          </h2>
          <p className="mt-2 text-silver-400">{section.intro}</p>

          <ul className="mt-6 space-y-8">
            {section.items.map((item) => (
              <li key={item.id} id={item.id} className="scroll-mt-24">
                <h3 className="font-medium text-silver-100">
                  {item.title}
                  {item.community && (
                    <span className="ms-2 rounded border border-white/15 px-2 py-0.5 align-middle text-xs font-normal text-silver-500">
                      {t.rules.communityPractice}
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-silver-400">{item.body}</p>

                {item.example && (
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-lg border border-cyan-700/40 bg-cyan-900/20 p-3">
                      <dt className="font-medium text-cyan-200">✓</dt>
                      <dd className="mt-1 text-silver-300">{item.example.good}</dd>
                    </div>
                    <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3">
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
                  className="text-cyan-300 underline underline-offset-2"
                >
                  {source.label}
                </a>
              </span>
            ))}
          </p>
        </section>
      ))}

      <p className="mt-12 text-sm text-silver-500">
        <Link href={`/${locale}/tutorials`} className="text-cyan-300 underline underline-offset-2">
          {t.nav.tutorials}
        </Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd(locale, [
              { name: t.nav.servers, path: '/' },
              { name: t.rules.h1, path: '/rules' },
            ]),
          ),
        }}
      />
    </article>
  );
}
