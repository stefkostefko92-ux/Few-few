import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/AdminShell';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Locale } from '@/i18n/locales';
import { getSession } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin-list';
import { stepUpAction } from '@/app/actions/security';

export const dynamic = 'force-dynamic';

// Step-up: пресен 2FA код за админ панела (сесия без 2FA) и опасните действия.
// Без requireAdmin — иначе би пренасочвал сам към себе си.
export default async function StepUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const active = await getSession();
  if (!active || !isAdminEmail(active.user.email)) redirect(`/${locale}/login`);
  if (!active.user.emailVerifiedAt) redirect(`/${locale}/dashboard/security?need=verify`);
  if (!active.user.totpEnabledAt) redirect(`/${locale}/dashboard/security?need=admin2fa`);
  const t = await getTranslations({ locale, namespace: 'security' });
  return (
    <AdminShell locale={locale as Locale} counts={{ reports: 0, moderated: 0, ordersAction: 0, payouts: 0, users: 0 }}>
      <PageHeader title={t('stepUpTitle')} description={t('stepUpHint')} />
      {error && <Callout tone="danger">{error === 'rate' ? t('errorRate') : t('errorCode')}</Callout>}
      <form action={stepUpAction} className="mt-6 flex max-w-sm flex-col gap-4">
        <input type="hidden" name="uiLocale" value={locale} />
        <label className="block text-sm font-medium text-fg">
          {t('codeLabel')}
          <input
            name="code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            className="mt-1 block w-full rounded-control border border-line-input bg-surface px-3 py-2 text-center font-mono text-lg tracking-[0.3em]"
          />
        </label>
        <Button type="submit" size="lg">
          {t('stepUpButton')}
        </Button>
      </form>
    </AdminShell>
  );
}
