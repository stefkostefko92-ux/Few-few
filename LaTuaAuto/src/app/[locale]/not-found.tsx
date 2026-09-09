import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <div className="container-page py-24 text-center">
      <h1 className="text-3xl font-bold">{t('notFoundTitle')}</h1>
      <p className="mt-2 text-slate-600">{t('notFoundText')}</p>
      <Link href="/" className="btn-primary mt-6">{t('backHome')}</Link>
    </div>
  );
}
