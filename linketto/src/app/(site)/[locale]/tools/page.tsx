import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ToolPage } from '@/components/ToolPage';
import type { Locale } from '@/i18n/locales';
import { pageMetadata } from '@/lib/seo';

// Безплатните инструменти — без регистрация. Всеки е самостоятелна
// SEO страница на 27 езика и води към Linketto (растеж през полезност).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tools' });
  return pageMetadata(locale as Locale, '/tools', {
    title: t('metaTitle'),
    description: t('metaDescription'),
    keywords: t('keywords').split(', '),
  });
}

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('tools');
  const tools = [
    { href: `/${locale}/tools/qr`, name: t('qrName'), desc: t('qrDesc'), mark: 'QR' },
    { href: `/${locale}/tools/bio`, name: t('bioName'), desc: t('bioDesc'), mark: 'AI' },
  ];
  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <ToolPage
        eyebrow={t('eyebrow')}
        title={t('indexTitle')}
        intro={t('indexIntro')}
        cta={{
          title: t('ctaTitle'),
          text: t('ctaText'),
          href: `/${locale}/register`,
          label: t('ctaButton'),
        }}
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 p-6 transition hover:-translate-y-0.5 hover:border-linketto-400 hover:shadow-lg"
              >
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-linketto-500 to-violet-600 text-sm font-extrabold text-white shadow-md"
                >
                  {tool.mark}
                </span>
                <span className="mt-4 text-lg font-bold text-slate-900">{tool.name}</span>
                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">
                  {tool.desc}
                </span>
                <span className="mt-4 text-sm font-semibold text-linketto-700 group-hover:underline">
                  {t('open')} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </ToolPage>
      <SiteFooter locale={locale as Locale} currentPath="/tools" />
    </>
  );
}
