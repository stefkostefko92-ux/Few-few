import { Badge } from '@/components/Badge';
import { getPages } from '@/content/pages';
import { isLocale } from '@/i18n/config';
import { faqJsonLd, jsonLdString, pageMetadata } from '@/lib/seo';

export const revalidate = 86_400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const page = getPages(locale).faq;
  return pageMetadata({ locale, title: page.title, description: page.description, path: '/faq' });
}

export default async function FaqPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const page = getPages(locale).faq;

  return (
    <article className="max-w-2xl">
      <div className="flex items-center gap-4">
        <Badge name="faq" size={48} />
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="text-chrome">{page.title}</span>
        </h1>
      </div>
      <p className="mt-4 text-silver-400">{page.intro}</p>

      <dl className="mt-8 space-y-8">
        {page.entries.map((entry) => (
          <div key={entry.id} id={entry.id} className="scroll-mt-24">
            <dt className="font-medium text-silver-100">{entry.q}</dt>
            <dd className="mt-1 text-silver-400">{entry.a}</dd>
          </div>
        ))}
      </dl>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            faqJsonLd(page.entries.map((entry) => ({ question: entry.q, answer: entry.a }))),
          ),
        }}
      />
    </article>
  );
}
