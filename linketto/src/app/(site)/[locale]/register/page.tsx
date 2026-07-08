import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import type { Locale } from '@/i18n/locales';
import { registerAction } from '@/app/actions/auth';

export default async function RegisterPage({
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
      <main className="mx-auto max-w-sm px-6 py-16">
        <h1 className="text-2xl font-bold">{t('registerTitle')}</h1>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error === 'exists' ? t('errorExists') : t('errorGeneric')}
          </p>
        )}
        <form action={registerAction} className="mt-6 space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <label className="block text-sm font-medium">
            {t('name')}
            <input
              type="text"
              name="name"
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            {t('email')}
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            {t('password')}
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-linketto-600 py-2.5 font-semibold text-white hover:bg-linketto-700"
          >
            {t('submitRegister')}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          <Link href={`/${locale}/login`} className="hover:underline">
            {t('haveAccount')}
          </Link>
        </p>
      </main>
    </>
  );
}
