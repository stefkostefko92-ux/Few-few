import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/auth';
import ChangePasswordForm from '@/components/ChangePasswordForm';
import AccountHead from '@/components/AccountHead';

export async function generateMetadata() {
  const t = await getTranslations('account');
  return { title: t('title') };
}

export default async function AccountPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ first?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, { allowPasswordChange: true });
  const [t, tr] = await Promise.all([getTranslations('account'), getTranslations('roles')]);
  const first = (await searchParams).first === '1' && user.mustChangePassword;
  return (
    <main className="page page-narrow">
      <AccountHead icon="user-cog" title={t('title')} />
      {first || user.mustChangePassword ? <p className="alert alert-warn">{t('mustChange')}</p> : null}
      <dl className="cartiglio">
        <div><dt>{t('name')}</dt><dd>{user.name}</dd></div>
        <div><dt>{t('email')}</dt><dd>{user.email}</dd></div>
        <div><dt>{t('company')}</dt><dd>{user.companyName}</dd></div>
        <div><dt>{t('role')}</dt><dd>{tr(user.role)}</dd></div>
      </dl>
      <ChangePasswordForm />
    </main>
  );
}
