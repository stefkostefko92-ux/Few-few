import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import { AuthShell, AUTH_SUBMIT_CLASS } from '@/components/AuthShell';
import type { Locale } from '@/i18n/locales';
import { registerAction } from '@/app/actions/auth';
import { isValidSlug, normalizeSlug } from '@/lib/slug';
import { profileUrl } from '@/lib/profile-url';

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ref?: string; handle?: string }>;
}) {
  const { locale } = await params;
  const { error, ref, handle: rawHandle } = await searchParams;
  const t = await getTranslations('auth');
  // „Запази си името“ от началната страница: профилът се създава веднага.
  const handle = normalizeSlug(String(rawHandle ?? '').slice(0, 64));
  const claimed = handle && isValidSlug(handle) ? handle : null;

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
        {claimed && (
          <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {t.rich('claimedBanner', {
              url: () => (
                <strong className="break-all font-semibold">
                  {profileUrl(claimed).replace(/^https?:\/\//, '')}
                </strong>
              ),
            })}
          </p>
        )}
        <form action={registerAction} className="mt-6 space-y-5">
          <input type="hidden" name="locale" value={locale} />
          {ref && <input type="hidden" name="ref" value={ref} />}
          {claimed && <input type="hidden" name="handle" value={claimed} />}
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
          {/* ePrivacy чл. 13(2): уведомление за седмичния отчет + отказ с 1 клик */}
          <p className="text-center text-xs leading-relaxed text-slate-500">
            {t('digestNotice')}
          </p>
        </form>
      </AuthShell>
    </>
  );
}
