import { SimplePageView } from '@/components/SimplePageView';
import { getPages } from '@/content/pages';
import { pageMetadata } from '@/lib/seo';
import { resolveLocale } from '@/i18n';

export const revalidate = 86_400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const page = getPages(locale).contact;
  return pageMetadata({ locale, title: page.title, description: page.description, path: '/contact' });
}

export default async function Page({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  return <SimplePageView page={getPages(locale).contact} badge="contact" />;
}
