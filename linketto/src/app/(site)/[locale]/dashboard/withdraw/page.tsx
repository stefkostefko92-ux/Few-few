import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import { type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
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

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="dash mx-auto max-w-2xl space-y-6 px-6 py-10">
        <Link
          href={`/${locale}/dashboard#plan`}
          className="inline-flex items-center gap-1 text-sm font-medium text-linketto-700 hover:underline"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          {t('withdrawBack')}
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('withdrawTitle')}</h1>
        {!order || !allowed ? (
          <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            {t('withdrawNotAvailable')}
          </p>
        ) : (
          <form action={withdrawPlanAction} className="dash-card space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
            <input type="hidden" name="uiLocale" value={locale} />
            <input type="hidden" name="orderId" value={order.id} />
            <p className="text-sm text-slate-600">{t('withdrawIntro')}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium text-slate-500">{t('withdrawContract')}</dt>
              <dd className="text-slate-900">
                Linketto {PLAN_NAMES[order.plan] ?? order.plan} ·{' '}
                {order.interval === 'lifetime' ? t('planForever') : t(`interval_${order.interval}`)} · €
                {(order.amountCents / 100).toFixed(2)}
              </dd>
              <dt className="font-medium text-slate-500">{t('withdrawOrderedOn')}</dt>
              <dd className="text-slate-900">{fmt(order.completedAt ?? order.createdAt)}</dd>
              <dt className="font-medium text-slate-500">{t('withdrawOrderRef')}</dt>
              <dd className="font-mono text-xs text-slate-700">{order.id}</dd>
              <dt className="font-medium text-slate-500">{t('withdrawEmail')}</dt>
              <dd className="text-slate-900">{user.email}</dd>
              <dt className="font-medium text-slate-500">{t('withdrawUntil')}</dt>
              <dd className="text-slate-900">{fmt(withdrawalLastDay(order.completedAt as Date))}</dd>
            </dl>
            <label className="block text-sm font-medium text-slate-700">
              {t('withdrawName')}
              <input
                type="text"
                name="name"
                required
                maxLength={120}
                autoComplete="name"
                defaultValue={user.name ?? ''}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            {error === 'name' && (
              <p role="alert" className="text-sm text-red-700">
                {t('withdrawNameError')}
              </p>
            )}
            <p className="text-xs text-slate-500">{t('withdrawRefundNote')}</p>
            <button
              type="submit"
              className="rounded-full bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700"
            >
              {t('withdrawConfirm')}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
