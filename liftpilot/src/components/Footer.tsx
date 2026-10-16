import { getTranslations } from 'next-intl/server';
import FooterView from './FooterView';

// The footer of every page (public and application), with its words read on the server (FooterView draws it).
export default async function Footer() {
  const t = await getTranslations('common');
  return <FooterView texts={{ note: t('footerNote'), legal: t('legal'), pricing: t('pricingLink'), data: t('dataLink'), guide: t('guideLink'), provider: t('provider') }} />;
}
