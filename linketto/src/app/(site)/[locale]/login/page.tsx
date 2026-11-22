import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Input, Label } from '@/components/ui/Field';
import type { Locale } from '@/i18n/locales';
import { loginAction } from '@/app/actions/auth';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { locale } = await params;
  const { error, ok } = await searchParams;
  const t = await getTranslations('auth');

  return (
    <>
      <LxPage locale={locale as Locale} currentPath="/login">
      <AuthShell
        title={t('loginTitle')}
        footer={
          <Link
            href={`/${locale}/register`}
            className="focus-ring rounded-sm font-semibold text-accent-text underline-offset-4 hover:underline"
          >
            {t('noAccount')}
          </Link>
        }
      >
        {ok === 'signedout' && (
          <Callout tone="success" className="mt-5">
            {t('signedOut')}
          </Callout>
        )}
        {ok === 'reset' && (
          <Callout tone="success" className="mt-5">
            {t('resetDone')}
          </Callout>
        )}
        {error && (
          <Callout tone="danger" className="mt-5">
            {error === 'invalid'
              ? t('errorInvalid')
              : error === 'expired'
                ? t('errorExpired')
                : error === 'link'
                  ? t('errorLink')
                  : error === 'verify-login'
                    ? t('errorVerifyLogin')
                    : t('errorGeneric')}
          </Callout>
        )}
        <form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="locale" value={locale} />
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
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="password">{t('password')}</Label>
              <Link
                href={`/${locale}/forgot`}
                className="focus-ring rounded-sm text-small font-medium text-accent-text underline-offset-4 hover:underline"
              >
                {t('forgotLink')}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" size="lg" block className="!mt-6">
            {t('submitLogin')}
          </Button>
        </form>
      </AuthShell>
      </LxPage>
    </>
  );
}
