import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import Icon from '@/components/Icon';
import '@/app/public.css';

// The localized 404 (an unknown address under a language, a record of another company): the code drawn like a
// dimension on the blueprint grid, what happened, and the two ways on. The header has no sign-in button: a signed-in
// user who opened a record of another company lands here too, and the way back to the projects is below.
export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <>
      <SiteHeader showLogin={false} />
      <main id="main" tabIndex={-1} className="pub-page err-page blueprint">
        <p className="err-code" aria-hidden="true">404</p>
        <h1>{t('notFoundTitle')}</h1>
        <p className="lead">{t('notFoundText')}</p>
        <p className="err-actions">
          <Link className="btn btn-primary" href="/app">{t('toProjects')}</Link>
          <Link className="btn" href="/"><Icon name="home" size={18} />{t('toHome')}</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
