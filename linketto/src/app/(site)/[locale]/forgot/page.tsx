import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Input, Label } from '@/components/ui/Field';
import type { Locale } from '@/i18n/locales';
import { requestPasswordResetAction } from '@/app/actions/password-reset';

export const metadata = { robots: { index: false } };

// „Забравена парола“ — стъпка 1 (docs/password-reset-spec.md R1): един и същ отговор за всеки адрес.
export default async function ForgotPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { sent, error } = await searchParams;
  const t = await getTranslations('auth');
  return (
    <LxPage locale={locale as Locale} currentPath="/forgot">
      <AuthShell
        title={t('forgotTitle')}
        footer={
          <Link href={`/${locale}/login`} className="focus-ring rounded-sm font-semibold text-accent-text underline-offset-4 hover:underline">
            {t('backToLogin')}
          </Link>
        }
      >
        {sent ? (
          <Callout tone="success" className="mt-5">
            {t('forgotSent')}
          </Callout>
        ) : (
          <>
            <p className="mt-3 text-body text-fg-2">{t('forgotIntro')}</p>
            {error && (
              <Callout tone="danger" className="mt-5">
                {t('errorGeneric')}
              </Callout>
            )}
            <form action={requestPasswordResetAction} className="mt-6 space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('email')}</Label>
                <Input id="email" type="email" name="email" required autoComplete="email" />
              </div>
              <Button type="submit" size="lg" block className="!mt-6">
                {t('forgotSubmit')}
              </Button>
            </form>
          </>
        )}
      </AuthShell>
    </LxPage>
  );
}
