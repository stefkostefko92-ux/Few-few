import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import { AuthShell, AUTH_SUBMIT_CLASS } from '@/components/AuthShell';
import type { Locale } from '@/i18n/locales';
import { registerAction } from '@/app/actions/auth';

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ref?: string }>;
}) {
  const { locale } = await params;
  const { error, ref } = await searchParams;
  const t = await getTranslations('auth');

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <AuthShell
        title={t('registerTitle')}
        footer={
          <Link
            href={`/${locale}/login`}
            className="font-semibold text-linketto-700 underline-offset-4 hover:underline"
          >
            {t('haveAccount')}
          </Link>
        }
      >
        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error === 'exists' ? t('errorExists') : t('errorGeneric')}
          </p>
        )}
        {ref && (
          <p className="mt-5 rounded-xl border border-sky-200 bg-linketto-50 px-4 py-3 text-sm text-linketto-900">
            {t('referredBanner')}
          </p>
        )}
        <form action={registerAction} className="mt-6 space-y-5">
          <input type="hidden" name="locale" value={locale} />
          {ref && <input type="hidden" name="ref" value={ref} />}
          <label className="block text-sm font-semibold text-slate-800">
            {t('name')}
            <input
              type="text"
              name="name"
              autoComplete="name"
              className="auth-field"
            />
          </label>
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
              autoComplete="new-password"
              className="auth-field"
            />
          </label>
          <button
            type="submit"
            className={AUTH_SUBMIT_CLASS}
          >
            {t('submitRegister')}
          </button>
        </form>
      </AuthShell>
    </>
  );
}
