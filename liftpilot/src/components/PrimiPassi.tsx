import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import Icon from './Icon';
import '@/app/guide.css';

/** The company has nothing yet: no installation (archived ones count) and no survey sheet (trashed ones count). */
export async function emptyCompany(user: SessionUser): Promise<boolean> {
  const [impianti, schede] = await Promise.all([
    prisma.project.count({ where: { companyId: user.companyId } }),
    prisma.scheda.count({ where: { companyId: user.companyId } }),
  ]);
  return impianti === 0 && schede === 0;
}

// «Primi passi» on the Rilievi home of a company that has nothing yet (round 48): the survey, the installation, the guide
// — each with the button the user's role may use (can(): a Commerciale reads the steps and the guide, without the
// buttons that would only lead to «permesso negato»). Gone with the first installation or sheet.
export default async function PrimiPassi({ user }: { user: SessionUser }) {
  const t = await getTranslations('primiPassi');
  return (
    <section className="panel first-steps" aria-labelledby="primi-passi">
      <div className="panel-head">
        <h2 id="primi-passi" className="flex items-center gap-2"><Icon name="footprints" size={20} />{t('title')}</h2>
      </div>
      <p className="m-0">{t('lead')}</p>
      <ol>
        <li>
          <p>{t('step1')}</p>
          {can(user, 'rilievi:edit') ? <Link className="btn btn-primary" href="/app/rilievi/nuovo"><Icon name="clipboard-list" size={18} />{t('newScheda')}</Link> : null}
        </li>
        <li>
          <p>{t('step2')}</p>
          {can(user, 'impianti:create') ? <Link className="btn" href="/app/projects/new"><Icon name="plus" size={18} />{t('newImpianto')}</Link> : null}
        </li>
        <li>
          <p>{t('step3')}</p>
          <Link className="btn" href="/guida"><Icon name="book-open" size={18} />{t('guide')}</Link>
        </li>
      </ol>
    </section>
  );
}
