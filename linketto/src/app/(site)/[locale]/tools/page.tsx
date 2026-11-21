import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ToolPage } from '@/components/ToolPage';
import { ArrowRightGlyph } from '@/components/ui/glyphs';
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
                className="focus-ring group flex h-full flex-col rounded-card border border-line bg-surface p-6 shadow-e1 transition-[border-color,box-shadow] duration-150 hover:border-line-input hover:shadow-e2"
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-control bg-accent-soft text-small font-extrabold text-accent-soft-fg"
                >
                  {tool.mark}
                </span>
                <span className="mt-4 text-subheading text-fg">{tool.name}</span>
                <span className="mt-1.5 flex-1 text-body text-fg-muted">
                  {tool.desc}
                </span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-body font-semibold text-accent-text">
                  {t('open')}
                  <ArrowRightGlyph className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
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
