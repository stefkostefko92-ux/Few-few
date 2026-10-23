import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import Icon from '@/components/Icon';
import '@/app/public.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('errors');
  // the layout's template adds the site's name («Pagina non trovata · LiftPilot»), as on every other page
  return { title: t('notFoundTitle'), robots: { index: false, follow: false } };
}

// The 404 in Italian (an unknown address under /it, a record of another company): the code drawn like a
// dimension on the blueprint grid, what happened, and the ways on. The header has no sign-in button: a signed-in
// user who opened a record of another company lands here too, and the way back to the installations is below — for
// whoever may see them; a visitor without a session is sent back to the home page only.
export default async function NotFound() {
  const [t, user] = await Promise.all([getTranslations('errors'), getSessionUser()]);
  const installations = user !== null && can(user, 'projects:view');
  return (
    <>
      {/* the page's own title as well: after hydration Next's client puts the layout's default title back for a 404 (seen
          on 15.5); React's <title> is hoisted first in the head and stays */}
      <title>{`${t('notFoundTitle')} · LiftPilot`}</title>
      <SiteHeader showLogin={false} />
      <main id="main" tabIndex={-1} className="pub-page err-page blueprint">
        <p className="err-code" aria-hidden="true">404</p>
        <h1>{t('notFoundTitle')}</h1>
        <p className="lead">{t('notFoundText')}</p>
        <p className="err-actions">
          {installations ? <Link className="btn btn-primary" href="/app/impianti">{t('toProjects')}</Link> : null}
          {user ? <Link className="btn" href="/"><Icon name="home" size={18} />{t('toHome')}</Link>
            : <Link className="btn btn-primary" href="/"><Icon name="home" size={18} />{t('backHome')}</Link>}
        </p>
      </main>
      <Footer />
    </>
  );
}
