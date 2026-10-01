import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Footer from '@/components/Footer';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <>
      <main className="page page-narrow">
        <span className="chip">404</span>
        <h1>{t('notFoundTitle')}</h1>
        <p className="lead">{t('notFoundText')}</p>
        <p className="flex flex-wrap gap-3">
          <Link className="btn btn-primary" href="/app">{t('toProjects')}</Link>
          <Link className="btn" href="/">{t('toHome')}</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
