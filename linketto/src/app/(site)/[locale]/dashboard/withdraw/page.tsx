import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashShell } from '@/components/DashShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { planFor } from '@/lib/plans';
import { type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withdrawalRefund } from '@/lib/withdrawal-refund';
import { canWithdraw, withdrawalLastDay } from '@/lib/withdrawal';
import { withdrawPlanAction } from '@/app/actions/withdrawal';
import { ChevronLeftIcon } from '@/components/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const PLAN_NAMES: Record<string, string> = { PRO: 'Pro', BUSINESS: 'Business', FOUNDER: 'Founder' };

// Втората стъпка на функцията за отказ (чл. 11а Дир. 2011/83): потребителят
// вижда кой договор, името и имейла за потвърждението и натиска „Потвърждавам отказа“.
export default async function WithdrawPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { order: orderId, error } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const t = await getTranslations('dashboard');

  const order = orderId
    ? await prisma.planOrder.findFirst({ where: { id: orderId, userId: user.id } })
    : null;
  const now = new Date();
  const allowed =
    !!order &&
    canWithdraw({
      state: order.state,
      applied: order.applied,
      completedAt: order.completedAt,
      withdrawalRequestedAt: order.withdrawalRequestedAt,
      now,
    });
  const fmt = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(d);
  // Б6: сумата за връщане, ако отказът е подаден СЕГА (окончателната се смята при потвърждението).
  const preview =
    order && allowed
      ? withdrawalRefund({
          amountCents: order.amountCents,
          vatCents: order.vatCents,
          plan: order.plan,
          interval: order.interval,
          prevPlan: order.prevPlan,
          prevExpiresAt: order.prevExpiresAt,
          completedAt: order.completedAt ?? now,
          requestedAt: now,
          immediateStartAt: order.immediateStartAt,
          applied: order.applied,
        })
      : null;

  const profileList = await prisma.profile.findMany({
    where: { userId: user.id },
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
  const planId = planFor(user.plan).id;

  return (
    <DashShell
      locale={locale as Locale}
      page="withdraw"
      profiles={profileList}
      activeId={profileList[0]?.id}
      planId={planId}
    >
      <PageHeader
        title={t('withdrawTitle')}
        description={t('withdrawIntro2')}
        actions={
          <ButtonLink
            href={`/${locale}/dashboard#plan`}
            variant="secondary"
            size="sm"
            className="gap-1.5"
          >
            <ChevronLeftIcon className="h-4 w-4 rtl:rotate-180" />
            {t('withdrawBack')}
          </ButtonLink>
        }
      />
      <div className="max-w-2xl">
        {!order || !allowed ? (
          <Callout tone="warning">{t('withdrawNotAvailable')}</Callout>
        ) : (
          <Card as="section" padding="lg" className="dash-card">
            <form action={withdrawPlanAction} className="space-y-5">
              <p className="text-body text-fg-2">{t('withdrawIntro')}</p>
              {/* Сумата за връщане — най-важното число на екрана (визуалният обход), над подробностите. */}
              {preview && (
                <div className="rounded-card border border-line bg-accent-soft p-4">
                  <p className="text-small font-semibold text-accent-soft-fg">{t('withdrawRefundAmount')}</p>
                  <p className="mt-1 text-[1.75rem] font-bold leading-tight tabular-nums text-fg">
                    €{(preview.refundCents / 100).toFixed(2)}
                  </p>
                  {preview.refundCents < order.amountCents && (
                    <p className="mt-2 text-small leading-relaxed text-fg-2">
                      {t('withdrawKeptNote', { kept: `€${((order.amountCents - preview.refundCents) / 100).toFixed(2)}` })}
                    </p>
                  )}
                </div>
              )}
              <dl className="grid gap-x-4 gap-y-1 rounded-card border border-line bg-surface-2 p-4 text-small sm:grid-cols-[10rem_1fr] sm:gap-y-2.5 [&>dt:not(:first-child)]:mt-3 sm:[&>dt:not(:first-child)]:mt-0">
                <dt className="font-medium text-fg-muted">{t('withdrawContract')}</dt>
                <dd className="text-fg">
                  Linketto {PLAN_NAMES[order.plan] ?? order.plan} ·{' '}
                  {order.interval === 'lifetime' ? t('planForever') : t(`interval_${order.interval}`)} · €
                  {(order.amountCents / 100).toFixed(2)}
                </dd>
                <dt className="font-medium text-fg-muted">{t('withdrawOrderedOn')}</dt>
                <dd className="text-fg">{fmt(order.completedAt ?? order.createdAt)}</dd>
                <dt className="font-medium text-fg-muted">{t('withdrawOrderRef')}</dt>
                <dd className="font-mono text-micro text-fg-2" title={order.id}>
                  …{order.id.slice(-10)}
                </dd>
                <dt className="font-medium text-fg-muted">{t('withdrawEmail')}</dt>
                <dd className="break-all text-fg">{user.email}</dd>
                <dt className="font-medium text-fg-muted">{t('withdrawUntil')}</dt>
                <dd className="text-fg">{fmt(withdrawalLastDay(order.completedAt as Date))}</dd>
              </dl>
              <Field id="withdraw-name" label={t('withdrawName')}>
                <Input
                  id="withdraw-name"
                  type="text"
                  name="name"
                  required
                  maxLength={120}
                  autoComplete="name"
                  defaultValue={user.name ?? ''}
                />
              </Field>
              {error === 'name' && <Callout tone="danger">{t('withdrawNameError')}</Callout>}
              <p className="text-small text-fg-muted">{t('withdrawRefundNote')}</p>
              <Button type="submit" variant="danger" size="lg">
                {t('withdrawConfirm')}
              </Button>
              <input type="hidden" name="uiLocale" value={locale} />
              <input type="hidden" name="orderId" value={order.id} />
            </form>
          </Card>
        )}
      </div>
    </DashShell>
  );
}
