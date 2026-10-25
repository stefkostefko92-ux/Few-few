import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { getPages } from '@/content/pages';
import { faqJsonLd, pageMetadata } from '@/lib/seo';
import { resolveLocale } from '@/i18n';

export const revalidate = 86_400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const page = getPages(locale).faq;
  return pageMetadata({ locale, title: page.title, description: page.description, path: '/faq' });
}

export default async function FaqPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const page = getPages(locale).faq;

  return (
    <article className="max-w-3xl">
      <div className="flex items-center gap-4">
        <Badge name="faq" size={48} />
        <h1 className="page-title">
          {page.title}
        </h1>
      </div>
      <p className="lead mt-6">{page.intro}</p>

      <dl className="mt-10 border-t border-white/[0.08]">
        {page.entries.map((entry) => (
          <div key={entry.id} id={entry.id} className="scroll-mt-28 border-b border-white/[0.08] py-6">
            <dt className="font-display text-lg font-semibold tracking-[-0.015em] text-silver-100">{entry.q}</dt>
            <dd className="mt-2 leading-relaxed text-silver-400">{entry.a}</dd>
          </div>
        ))}
      </dl>

      <JsonLd data={faqJsonLd(page.entries.map((entry) => ({ question: entry.q, answer: entry.a })))} />
    </article>
  );
}
