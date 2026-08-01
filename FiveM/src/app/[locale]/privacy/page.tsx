import { LegalArticle } from '@/components/LegalArticle';
import { getLegal } from '@/content/legal';
import { isLocale } from '@/i18n/config';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 86_400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const doc = getLegal(locale).privacy;
  return pageMetadata({ locale, title: doc.title, description: doc.description, path: '/privacy' });
}

export default async function PrivacyPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  return <LegalArticle doc={getLegal(locale).privacy} withController />;
}
