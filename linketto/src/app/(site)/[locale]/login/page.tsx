import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import { AuthShell, AUTH_SUBMIT_CLASS } from '@/components/AuthShell';
import type { Locale } from '@/i18n/locales';
import { loginAction } from '@/app/actions/auth';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations('auth');

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <AuthShell
        title={t('loginTitle')}
        footer={
          <Link
            href={`/${locale}/register`}
            className="font-semibold text-linketto-700 underline-offset-4 hover:underline"
          >
            {t('noAccount')}
          </Link>
        }
      >
        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error === 'invalid' ? t('errorInvalid') : t('errorGeneric')}
          </p>
        )}
        <form action={loginAction} className="mt-6 space-y-5">
          <input type="hidden" name="locale" value={locale} />
          <label className="block text-sm font-semibold text-slate-800">
            {t('email')}
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="auth-field"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            {t('password')}
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="auth-field"
            />
          </label>
          <button
            type="submit"
            className={AUTH_SUBMIT_CLASS}
          >
            {t('submitLogin')}
          </button>
        </form>
      </AuthShell>
    </>
  );
}
