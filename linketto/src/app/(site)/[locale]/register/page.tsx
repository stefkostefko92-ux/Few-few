import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Input, Label } from '@/components/ui/Field';
import type { Locale } from '@/i18n/locales';
import { registerAction } from '@/app/actions/auth';
import { isValidSlug, normalizeSlug } from '@/lib/slug';
import { profileUrl } from '@/lib/profile-url';
import { PASSWORD_MIN } from '@/lib/password-policy';

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
      <LxPage locale={locale as Locale} currentPath="/register">
      <AuthShell
        title={t('registerTitle')}
        footer={
          <Link
            href={`/${locale}/login`}
            className="focus-ring rounded-sm font-semibold text-accent-text underline-offset-4 hover:underline"
          >
            {t('haveAccount')}
          </Link>
        }
      >
        {error && (
          <Callout tone="danger" className="mt-5">
            {error === 'exists'
              ? t('errorExists')
              : error === 'weak'
                ? t('errorWeak', { min: PASSWORD_MIN })
                : error === 'terms'
                  ? t('errorTerms')
                  : t('errorGeneric')}
          </Callout>
        )}
        {ref && (
          <Callout tone="info" className="mt-5">
            {t('referredBanner')}
          </Callout>
        )}
        {claimed && (
          <Callout tone="success" className="mt-5">
            {t.rich('claimedBanner', {
              url: () => (
                <strong className="font-semibold [overflow-wrap:anywhere]">
                  {profileUrl(claimed).replace(/^https?:\/\//, '')}
                </strong>
              ),
            })}
          </Callout>
        )}
        <form action={registerAction} className="mt-6 space-y-4">
          <input type="hidden" name="locale" value={locale} />
          {ref && <input type="hidden" name="ref" value={ref} />}
          {claimed && <input type="hidden" name="handle" value={claimed} />}
          <div className="space-y-1.5">
            <Label htmlFor="name">{t('name')}</Label>
            <Input
              id="name"
              type="text"
              name="name"
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              name="password"
              required
              minLength={PASSWORD_MIN}
              maxLength={200}
              autoComplete="new-password"
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="text-small text-fg-muted">
              {t('passwordHint', { min: PASSWORD_MIN })}
            </p>
          </div>
          {/* ЗЗП чл. 147а: изрично приемане на ОУ (неотметната, задължителна; сървърът проверява) — над бутона. */}
          <label className="!mt-6 flex items-start gap-2.5 text-small leading-relaxed text-fg">
            <input type="checkbox" name="acceptTerms" value="1" required className="mt-1 h-4 w-4 shrink-0" />
            <span>
              {t.rich('registerTerms', {
                terms: (chunks) => (
                  <Link href={`/${locale}/terms`} target="_blank" className="font-semibold text-accent-text underline underline-offset-2">
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </label>
          <Button type="submit" size="lg" block>
            {t('submitRegister')}
          </Button>
          <p className="text-center text-small text-fg-2">
            {t.rich('registerPrivacy', {
              privacy: (chunks) => (
                <Link href={`/${locale}/privacy`} className="font-semibold text-accent-text underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </p>
          {/* ePrivacy чл. 13(2): уведомление за седмичния отчет + отказ с 1 клик */}
          <p className="text-center text-small text-fg-muted">
            {t('digestNotice')}
          </p>
        </form>
      </AuthShell>
      </LxPage>
    </>
  );
}
