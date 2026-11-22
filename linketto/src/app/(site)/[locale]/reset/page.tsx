import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Input, Label } from '@/components/ui/Field';
import type { Locale } from '@/i18n/locales';
import { resetPasswordAction } from '@/app/actions/password-reset';
import { peekUserToken } from '@/lib/auth';
import { PASSWORD_MIN } from '@/lib/password-policy';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false }, referrer: 'no-referrer' as const };

// „Забравена парола“ — стъпка 2 (R3): GET само показва формата (скенерите не сменят нищо);
// токенът се изразходва чак при POST (resetPasswordAction).
export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; invalid?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { token = '', invalid, error } = await searchParams;
  const t = await getTranslations('auth');
  const valid = !invalid && (await peekUserToken(token, 'reset-password')) !== null;
  return (
    <LxPage locale={locale as Locale} currentPath="/reset">
      <AuthShell
        title={t('resetTitle')}
        footer={
          <Link href={`/${locale}/login`} className="focus-ring rounded-sm font-semibold text-accent-text underline-offset-4 hover:underline">
            {t('backToLogin')}
          </Link>
        }
      >
        {!valid ? (
          <>
            <Callout tone="danger" className="mt-5">
              {t('resetInvalid')}
            </Callout>
            <Link href={`/${locale}/forgot`} className="mt-5 inline-block font-semibold text-accent-text underline underline-offset-4">
              {t('forgotLink')}
            </Link>
          </>
        ) : (
          <>
            {error && (
              <Callout tone="danger" className="mt-5">
                {error === 'mismatch' ? t('errorMismatch') : t('errorWeak', { min: PASSWORD_MIN })}
              </Callout>
            )}
            <form action={resetPasswordAction} className="mt-6 space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="token" value={token} />
              <div className="space-y-1.5">
                <Label htmlFor="next">{t('newPassword')}</Label>
                <Input id="next" type="password" name="next" required minLength={PASSWORD_MIN} maxLength={200} autoComplete="new-password" aria-describedby="password-hint" />
                <p id="password-hint" className="text-small text-fg-muted">
                  {t('passwordHint', { min: PASSWORD_MIN })}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">{t('confirmPassword')}</Label>
                <Input id="confirm" type="password" name="confirm" required minLength={PASSWORD_MIN} maxLength={200} autoComplete="new-password" />
              </div>
              <Button type="submit" size="lg" block className="!mt-6">
                {t('resetSubmit')}
              </Button>
            </form>
          </>
        )}
      </AuthShell>
    </LxPage>
  );
}
