import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/auth';
import { grantable, holds, homeOf, isCapability, isMemberRole, matrixRightOf } from '@/lib/rbac';
import Icon from '@/components/Icon';

export async function generateMetadata() {
  const t = await getTranslations('denied');
  return { title: t('title') };
}

// Where a colleague lands on a page the company has not given the role the right to (src/lib/auth.ts denied): inside the
// application, naming the right and who decides it, instead of the public 404. The same for any record's address, so it
// says nothing about another company's. The right comes from the address, so the page names it only when it is true:
// a colleague's role the company could give it to and has not (the same test as denied); anyone else goes back to work.
export default async function PermessoPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ p?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const p = (await searchParams).p, right = isCapability(p) ? matrixRightOf(p) : null;
  if (!right || !isMemberRole(user.role) || !grantable(user.role, right) || holds(user, right)) redirect(`/${locale}${homeOf(user)}`);
  const [t, tp, tr] = await Promise.all([getTranslations('denied'), getTranslations('permessi'), getTranslations('roles')]);
  const role = tr(user.role);
  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div className="titles">
          <p className="eyebrow">{role}</p>
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead', { role, right: tp(`caps.${right}`) })}</p>
        </div>
      </div>
      <section className="panel items-start">
        <p className="m-0 flex items-center gap-2"><Icon name="lock-keyhole" size={20} />{t('ask')}</p>
        <Link className="btn btn-primary" href={homeOf(user)}>{t('back')}</Link>
      </section>
    </main>
  );
}
