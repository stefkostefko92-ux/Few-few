import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LxPage } from '@/components/landing/LxPage';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Input, Label } from '@/components/ui/Field';
import type { Locale } from '@/i18n/locales';
import { readLoginChallenge } from '@/lib/auth';
import { verifyMfaAction } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

// Стъпка 2 на входа (docs/security-2fa-settings-spec.md): без валидно
// предизвикателство (бисквитка от стъпка 1, 5 мин.) — обратно към входа.
export default async function MfaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  if (!(await readLoginChallenge())) redirect(`/${locale}/login?error=expired`);
  const t = await getTranslations('auth');
  return (
    <LxPage locale={locale as Locale} currentPath="/login">
      <AuthShell
        title={t('mfaTitle')}
        footer={
          <Link href={`/${locale}/login`} className="focus-ring rounded-sm font-semibold text-accent-text underline-offset-4 hover:underline">
            {t('mfaBack')}
          </Link>
        }
      >
        <p className="mt-3 text-body text-fg-2">{t('mfaHint')}</p>
        {error && (
          <Callout tone="danger" className="mt-5">
            {t('mfaErrorCode')}
          </Callout>
        )}
        <form action={verifyMfaAction} className="mt-6 space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <div className="space-y-1.5">
            <Label htmlFor="code">{t('mfaCode')}</Label>
            <Input
              id="code"
              name="code"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode="text"
              maxLength={20}
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
          </div>
          <Button type="submit" size="lg" block className="!mt-6">
            {t('mfaSubmit')}
          </Button>
        </form>
      </AuthShell>
    </LxPage>
  );
}
