import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Input, Label, Select, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import {
  BagGlyph,
  BarsGlyph,
  CardGlyph,
  TrendGlyph,
  UserGlyph,
  UsersGlyph,
} from '@/components/ui/glyphs';
import type { Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import {
  adminClearDomainAction,
  adminDeleteUserAction,
  adminForceLogoutAction,
  adminMarkPayoutPaidAction,
  adminNotifyAutoTranslateAction,
  adminRefundPlanOrderAction,
  adminCloseRefundAction,
  adminResolveReportAction,
  adminSetPasswordAction,
  adminSetPublishedAction,
  adminUpdateUserAction,
  setProfileBanAction,
} from '@/app/actions/admin';

import { BAN_CATEGORIES } from '@/lib/dsa-notice';
import { IntegrationsPanel, settingFieldLabelKey } from '@/components/admin/IntegrationsPanel';
import { SETTING_KEYS, type SettingKey } from '@/lib/settings-spec';
import { PASSWORD_MIN } from '@/lib/password-policy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false } };

const PLAN_VALUES = ['FREE', 'PRO', 'BUSINESS', 'FOUNDER'] as const;

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
const ORDER_TONE: Record<string, Tone> = {
  pending: 'warning',
  completed: 'success',
  conflict: 'danger',
  refund_pending: 'warning',
  refunded: 'neutral',
  failed: 'danger',
  cancelled: 'neutral',
};

// Опасните действия имат собствен вид: контурен (необратимо/засягащо
// потребителя) и плътен (изтриване, спиране) — не се бъркат с обикновените.
const dangerOutline =
  'focus-ring inline-flex h-8 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control border border-danger/50 bg-surface px-3 text-small font-semibold text-danger-text transition-colors hover:border-danger hover:bg-danger-soft active:translate-y-px';
const warningOutline =
  'focus-ring inline-flex h-8 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control border border-warning/60 bg-surface px-3 text-small font-semibold text-warning-text transition-colors hover:border-warning hover:bg-warning-soft active:translate-y-px';

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-subheading text-fg">
            {title}
          </h2>
          {description && <p className="mt-1 max-w-prose text-small text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    ok?: string;
    error?: string;
    count?: string;
    test?: string;
    code?: string;
    field?: string;
    nodisputes?: string;
    reused?: string;
    webhook?: string;
  }>;
}) {
  const { locale } = await params;
  const { q, ok, error, count: okCount, test, code, field, nodisputes, reused, webhook } = await searchParams;
  await requireAdmin(locale);
  const t = await getTranslations('admin');

  // Пълна платформена картина + отворените DSA сигнали.
  const [
    userCount,
    profileCount,
    clickCount,
    orderTotals,
    openReports,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.profile.count(),
    prisma.clickEvent.count(),
    prisma.planOrder.aggregate({
      where: { state: 'completed' },
      _count: { _all: true },
      _sum: { amountCents: true, vatCents: true },
    }),
    prisma.report.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { profile: { select: { slug: true } } },
    }),
  ]);

  const pendingPayouts = await prisma.referralPayout.findMany({
    where: { status: 'pending' },
    orderBy: { requestedAt: 'asc' },
    take: 50,
    include: { user: { select: { email: true } } },
  });

  // Поръчки на планове (Revolut): платените (вкл. неприложени и чакащи
  // връщане) отделно от висящите/неуспешните — изоставени checkout-и не бива
  // да изместват платените от списъка (иначе няма бутон за връщане).
  const [paidOrders, otherOrders] = await Promise.all([
    prisma.planOrder.findMany({
      where: { state: { in: ['completed', 'conflict', 'refund_pending', 'refunded'] } },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      take: 60,
      include: { user: { select: { email: true } } },
    }),
    prisma.planOrder.findMany({
      where: { state: { in: ['pending', 'failed', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { user: { select: { email: true } } },
    }),
  ]);
  const recentOrders = [...paidOrders, ...otherOrders];

  const query = (q ?? '').trim().toLowerCase();
  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { profiles: { some: { slug: { contains: query } } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      profiles: {
        select: {
          id: true,
          slug: true,
          published: true,
          bannedAt: true,
          bannedCategory: true,
          bannedReason: true,
          banNoticeSentAt: true,
          warnedAt: true,
          warnedCategory: true,
          customDomain: true,
        },
      },
      loginEvents: { orderBy: { createdAt: 'desc' }, take: 5 },
      _count: { select: { loginEvents: true, sessions: true } },
    },
  });

  // Б9: удържаното при отказ (пропорционално) е продажба — в приходите и ДДС.
  const retained = await prisma.planOrder.aggregate({
    where: { state: 'refunded', refundCents: { not: null } },
    _sum: { amountCents: true, refundCents: true, vatCents: true, refundVatCents: true },
  });
  const retainedCents = (retained._sum.amountCents ?? 0) - (retained._sum.refundCents ?? 0);
  const retainedVatCents = (retained._sum.vatCents ?? 0) - (retained._sum.refundVatCents ?? 0);
  // А5: задържаните реферални бонуси по потребител (още не са в баланса).
  const heldByUser = new Map(
    (
      await prisma.referral.groupBy({
        by: ['referrerId'],
        where: { releasedAt: null, reversedAt: null, referrerId: { in: users.map((u) => u.id) } },
        _sum: { rewardCents: true },
      })
    ).map((row) => [row.referrerId, row._sum.rewardCents ?? 0]),
  );
  const nf = new Intl.NumberFormat(locale);
  const money = (cents: number) => `€${(cents / 100).toFixed(2)}`;
  const errorText: Record<string, string> = {
    email: t('errorEmail'),
    password: t('errorPassword'),
    refund: t('errorRefund'),
    'refund-order': t('errorRefundOrder'),
    'refund-pending': t('errorRefundPending'),
    'refund-close': t('errorRefundClose'),
    'refund-close-confirm': t('errorRefundCloseConfirm'),
    'refund-close-progress': t('errorRefundCloseProgress'),
    'refund-close-failed': t('errorRefundCloseFailed'),
    'refund-close-unreadable': t('errorRefundCloseUnreadable'),
    ban: t('errorBan'),
    'ban-warn': t('errorBanWarn'),
    'ban-ground': t('errorBanGround'),
    'ban-notice': t('errorBanNotice'),
    'autonotice-email': t('autoNoticeNoEmail'),
    'admin-target': t('errorAdminTarget'),
    setting: t('errorSetting', {
      field: SETTING_KEYS.includes(field as SettingKey) ? t(settingFieldLabelKey(field as SettingKey)) : '—',
    }),
    nokey: t('errorNoSealKey'),
    'open-orders': t('errorOpenOrders', { count: Number(okCount) || 0 }),
    rate: t('errorRate'),
  };
  // Автоматичен превод: профили отпреди функцията — без уведомление / насрочени.
  const [autoPending, autoScheduled] = await Promise.all([
    prisma.profile.count({ where: { autoTranslateMode: 'pending', autoTranslateStartsAt: null } }),
    prisma.profile.count({ where: { autoTranslateMode: 'pending', autoTranslateStartsAt: { not: null } } }),
  ]);

  const needsRefund = (order: (typeof paidOrders)[number]) =>
    order.state === 'completed' ||
    order.state === 'conflict' ||
    (order.state === 'refund_pending' && !order.refundOrderId);

  const moderated = users.flatMap((user) =>
    user.profiles
      .filter((profile) => profile.bannedAt || profile.warnedAt)
      .map((profile) => ({ user, profile })),
  );

  const counts = {
    reports: openReports.length,
    moderated: moderated.length,
    ordersAction: paidOrders.filter((o) => o.state === 'conflict' || (o.state === 'refund_pending' && !o.refundOrderId)).length,
    payouts: pendingPayouts.length,
    users: users.length,
  };

  const kpis = [
    { value: nf.format(userCount), label: t('statsUsers'), glyph: <UsersGlyph className="h-full w-full" /> },
    { value: nf.format(profileCount), label: t('statsProfiles'), glyph: <UserGlyph className="h-full w-full" /> },
    { value: nf.format(clickCount), label: t('statsClicks'), glyph: <TrendGlyph className="h-full w-full" /> },
    { value: nf.format(orderTotals._count._all), label: t('statsOrders'), glyph: <BagGlyph className="h-full w-full" /> },
    { value: money((orderTotals._sum.amountCents ?? 0) + retainedCents), label: t('statsRevenue'), glyph: <CardGlyph className="h-full w-full" />, featured: true },
    { value: money((orderTotals._sum.vatCents ?? 0) + retainedVatCents), label: t('statsVat'), glyph: <BarsGlyph className="h-full w-full" /> },
  ];

  return (
    <AdminShell locale={locale as Locale} counts={counts}>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="space-y-12">
        {(ok || error) && (
          <div className="space-y-3">
            {ok && (
              <Callout tone="success">
                {ok === 'autonotice'
                  ? t('autoNoticeDone', { count: Number(okCount) || 0 })
                  : ok === 'nochange'
                    ? t('intNoChange')
                    : t('saved')}
              </Callout>
            )}
            {error && <Callout tone="danger">{errorText[error] ?? t('errorInput')}</Callout>}
          </div>
        )}

        {/* Платформена картина с един поглед */}
        <Section id="stats" title={t('statsTitle')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} variant={kpi.featured ? 'accent' : 'default'} padding="sm" className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-small text-fg-muted">{kpi.label}</p>
                  <span
                    aria-hidden
                    className={`h-7 w-7 shrink-0 rounded-control p-1.5 ${kpi.featured ? 'bg-accent-soft text-accent-soft-fg' : 'bg-surface-3 text-fg-2'}`}
                  >
                    {kpi.glyph}
                  </span>
                </div>
                <p className="mt-3 truncate text-heading tabular-nums text-fg">{kpi.value}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* Автоматичен превод: предварително уведомление до създателите (ОРЗД чл. 12–13) */}
        {(autoPending > 0 || autoScheduled > 0) && (
          <Section id="autotranslate" title={t('autoNoticeTitle')} description={t('autoNoticeHint')}>
            <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-small text-fg-2">
                {t('autoNoticeStats', { pending: autoPending, scheduled: autoScheduled })}
              </p>
              {autoPending > 0 && (
                <form action={adminNotifyAutoTranslateAction}>
                  <input type="hidden" name="uiLocale" value={locale} />
                  <Button type="submit" size="sm">
                    {t('autoNoticeButton')}
                  </Button>
                </form>
              )}
            </Card>
          </Section>
        )}

        {/* DSA сигнали — отворените чакат действие */}
        <Section id="reports" title={t('reportsTitle', { count: openReports.length })}>
          {openReports.length === 0 ? (
            <Card variant="muted" padding="sm" className="text-small text-fg-muted">
              {t('reportsEmpty')}
            </Card>
          ) : (
            <ul className="space-y-3">
              {openReports.map((report) => (
                <Card
                  as="li"
                  key={report.id}
                  padding="sm"
                  className="border-s-4 border-s-warning text-small"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/u/${report.profile.slug}`}
                        className="focus-ring font-semibold text-accent-text hover:underline"
                      >
                        /u/{report.profile.slug}
                      </a>
                      <Badge tone="warning">{report.category}</Badge>
                      <span className="text-micro text-fg-muted">{stamp(report.createdAt)}</span>
                    </p>
                    <form action={adminResolveReportAction}>
                      <input type="hidden" name="uiLocale" value={locale} />
                      <input type="hidden" name="reportId" value={report.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        {t('resolve')}
                      </Button>
                    </form>
                  </div>
                  <p className="mt-2 text-fg-2">{report.message}</p>
                  {report.email && <p className="mt-1 text-micro text-fg-muted">{report.email}</p>}
                </Card>
              ))}
            </ul>
          )}
        </Section>

        {/* Спрени и предупредени профили (от показаните потребители) */}
        <Section id="moderated" title={t('moderatedTitle', { count: moderated.length })} description={t('moderatedHint')}>
          {moderated.length === 0 ? (
            <Card variant="muted" padding="sm" className="text-small text-fg-muted">
              {t('moderatedEmpty')}
            </Card>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('colProfile')}</TH>
                  <TH>{t('colState')}</TH>
                  <TH>{t('banCategoryLabelShort')}</TH>
                  <TH>{t('colDate')}</TH>
                </tr>
              </THead>
              <TBody>
                {moderated.map(({ user, profile }) => {
                  const category = profile.bannedAt ? profile.bannedCategory : profile.warnedCategory;
                  return (
                    <TR key={profile.id}>
                      <TD>
                        <a href={`#user-${user.id}`} className="focus-ring font-semibold text-accent-text hover:underline">
                          /u/{profile.slug}
                        </a>
                        <p className="text-micro text-fg-muted">{user.email}</p>
                      </TD>
                      <TD>
                        <Badge tone={profile.bannedAt ? 'danger' : 'warning'} dot>
                          {profile.bannedAt ? t('banned') : t('warned')}
                        </Badge>
                      </TD>
                      <TD>
                        {category ? t(`banCategory.${category}`) : '—'}
                        {profile.bannedAt && profile.bannedReason && (
                          <p className="mt-0.5 line-clamp-2 max-w-sm text-micro text-fg-muted">{profile.bannedReason}</p>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        {(profile.bannedAt ?? profile.warnedAt)?.toISOString().slice(0, 10)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Section>

        {/* Поръчки на планове (Revolut) + пълно връщане на пари */}
        <Section id="orders" title={t('ordersTitle')}>
          {recentOrders.length === 0 ? (
            <Card variant="muted" padding="sm" className="text-small text-fg-muted">
              {t('ordersEmpty')}
            </Card>
          ) : (
            <Table className="min-w-[44rem]">
              <THead>
                <tr>
                  <TH>{t('colUser')}</TH>
                  <TH>{t('colPlan')}</TH>
                  <TH className="text-end">{t('colAmount')}</TH>
                  <TH>{t('colState')}</TH>
                  <TH className="sticky end-0 bg-surface-2 text-end">{t('colAction')}</TH>
                </tr>
              </THead>
              <TBody>
                {recentOrders.map((order) => (
                  <TR key={order.id}>
                    <TD>
                      <p className="[overflow-wrap:anywhere] font-medium text-fg">{order.user.email}</p>
                      <p className="text-micro tabular-nums text-fg-muted">{stamp(order.createdAt)}</p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <Badge tone="accent">{order.plan}</Badge>{' '}
                      <span className="text-fg-muted">{t(`interval.${order.interval}`)}</span>
                    </TD>
                    <TD className="whitespace-nowrap text-end tabular-nums">
                      <p className="font-semibold text-fg">{money(order.amountCents)}</p>
                      <p className="text-micro text-fg-muted">
                        {t('vatShort')} {money(order.vatCents)}
                        {order.buyerCountry ?? order.cardCountry ? ` · ${order.buyerCountry ?? order.cardCountry}` : ''}
                      </p>
                      {order.refundCents !== null && (
                        <p className="text-micro font-medium text-danger">
                          {t('refundPartial', { amount: money(order.refundCents) })}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={ORDER_TONE[order.state] ?? 'neutral'} dot>
                          {t(`orderState.${order.state}`)}
                        </Badge>
                        {order.withdrawalRequestedAt && (
                          <Badge tone="danger">
                            {t('withdrawalRequested', { date: stamp(order.withdrawalRequestedAt) })}
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="sticky end-0 bg-surface shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.35)] text-end">
                      {needsRefund(order) && (
                        <form action={adminRefundPlanOrderAction}>
                          <input type="hidden" name="uiLocale" value={locale} />
                          <input type="hidden" name="planOrderId" value={order.id} />
                          <button type="submit" className={dangerOutline}>
                            {t('refund')}
                          </button>
                        </form>
                      )}
                      {/* Връщане в ход с refund при Revolut: ръчно приключване след сверка
                          (docs/refund-manual-close-spec.md Б — решава живото четене). */}
                      {order.state === 'refund_pending' && order.refundOrderId && (
                        <form action={adminCloseRefundAction} className="flex flex-col items-end gap-1.5">
                          <input type="hidden" name="uiLocale" value={locale} />
                          <input type="hidden" name="planOrderId" value={order.id} />
                          <label className="flex max-w-[14rem] items-start gap-1.5 text-start text-micro text-fg-2">
                            <input type="checkbox" name="confirm" required className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {t('refundCloseConfirm')}
                          </label>
                          <button type="submit" className={dangerOutline}>
                            {t('refundClose')}
                          </button>
                        </form>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Section>

        {/* Чакащи изплащания на реферал бонуси */}
        <Section id="payouts" title={t('payoutsTitle', { count: pendingPayouts.length })}>
          {pendingPayouts.length === 0 ? (
            <Card variant="muted" padding="sm" className="text-small text-fg-muted">
              {t('payoutsEmpty')}
            </Card>
          ) : (
            <Table className="min-w-[36rem]">
              <THead>
                <tr>
                  <TH>{t('colUser')}</TH>
                  <TH className="text-end">{t('colAmount')}</TH>
                  <TH>{t('colMethod')}</TH>
                  <TH>{t('colDate')}</TH>
                  <TH className="sticky end-0 bg-surface-2 text-end">{t('colAction')}</TH>
                </tr>
              </THead>
              <TBody>
                {pendingPayouts.map((p) => (
                  <TR key={p.id}>
                    <TD className="[overflow-wrap:anywhere] font-medium text-fg">{p.user.email}</TD>
                    <TD className="text-end font-semibold tabular-nums text-success-text">{money(p.amountCents)}</TD>
                    <TD className="font-mono text-micro">{p.method}</TD>
                    <TD className="whitespace-nowrap tabular-nums">{p.requestedAt.toISOString().slice(0, 10)}</TD>
                    <TD className="sticky end-0 bg-surface shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.35)] text-end">
                      <form action={adminMarkPayoutPaidAction}>
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="payoutId" value={p.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          {t('payoutMarkPaid')}
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Section>

        {/* Ключовете на Revolut (плащания) и Brevo (имейли) — само с пресен 2FA код */}
        <Section id="integrations" title={t('intTitle')} description={t('intHint')}>
          <IntegrationsPanel
            locale={locale}
            test={test}
            code={code}
            noDisputes={nodisputes === '1'}
            reused={reused === '1'}
            webhookReset={webhook === 'reset'}
            webhookEnvStale={webhook === 'env-stale'}
          />
        </Section>

        {/* Потребители и профили */}
        <Section
          id="users"
          title={t('usersTitle')}
          description={t('total', { count: users.length })}
          action={
            <form method="get" role="search" className="flex w-full gap-2 sm:w-auto">
              <Input
                type="search"
                name="q"
                aria-label={t('search')}
                defaultValue={q ?? ''}
                placeholder={t('searchPlaceholder')}
                className="min-w-0 flex-1 sm:w-72"
              />
              <Button type="submit">{t('search')}</Button>
            </form>
          }
        >
          <div className="space-y-5">
            {users.map((user) => (
              <Card as="section" key={user.id} id={`user-${user.id}`} padding="md" className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="[overflow-wrap:anywhere] text-body font-semibold text-fg">{user.email}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-fg-muted">
                      <span>{user.name ?? '—'}</span>
                      <Badge tone={user.plan === 'FREE' ? 'neutral' : 'accent'}>{user.plan}</Badge>
                      <span className="tabular-nums">{user.createdAt.toISOString().slice(0, 10)}</span>
                      {user.planExpiresAt && (
                        <span className="tabular-nums">
                          {t('planUntil', { date: user.planExpiresAt.toISOString().slice(0, 10) })}
                        </span>
                      )}
                      {user.referralCreditCents !== 0 && (
                        <span>
                          {t('referralCredit')}: {money(user.referralCreditCents)}
                        </span>
                      )}
                      {(heldByUser.get(user.id) ?? 0) > 0 && (
                        <span>
                          {t('referralHeld')}: {money(heldByUser.get(user.id) ?? 0)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Логнати IP-та (последните 5, пазят се 90 дни) */}
                <div>
                  <h3 className="text-small font-semibold text-fg-2">{t('loginIps', { count: user._count.loginEvents })}</h3>
                  {user.loginEvents.length === 0 ? (
                    <p className="mt-1 text-small text-fg-muted">—</p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-small text-fg-2">
                      {user.loginEvents.map((event) => (
                        <li key={event.id}>
                          {event.ip}
                          <span className="ms-2 font-sans text-micro tabular-nums text-fg-muted">{stamp(event.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid gap-6 border-t border-line pt-5 lg:grid-cols-2">
                  {/* Пълна промяна на данните */}
                  <form action={adminUpdateUserAction} className="space-y-3">
                    <input type="hidden" name="uiLocale" value={locale} />
                    <input type="hidden" name="userId" value={user.id} />
                    <h3 className="text-body font-semibold text-fg">{t('editUser')}</h3>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${user.id}-email`}>{t('email')}</Label>
                      <Input id={`${user.id}-email`} type="email" name="email" required defaultValue={user.email} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${user.id}-name`}>{t('name')}</Label>
                      <Input id={`${user.id}-name`} type="text" name="name" defaultValue={user.name ?? ''} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${user.id}-plan`}>{t('plan')}</Label>
                      <Select id={`${user.id}-plan`} name="plan" defaultValue={user.plan}>
                        {PLAN_VALUES.map((plan) => (
                          <option key={plan} value={plan}>
                            {plan}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button type="submit" variant="secondary" size="sm">
                      {t('save')}
                    </Button>
                  </form>

                  {/* Профили: публикуване, домейн, бан */}
                  <div className="space-y-3">
                    <h3 className="text-body font-semibold text-fg">{t('profilesTitle')}</h3>
                    {user.profiles.length === 0 && <p className="text-small text-fg-muted">—</p>}
                    {user.profiles.map((profile) => (
                      <div key={profile.id} className="space-y-3 rounded-control border border-line bg-surface-2/50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg">/u/{profile.slug}</span>
                          <Badge tone={profile.bannedAt ? 'danger' : profile.published ? 'success' : 'neutral'} dot>
                            {profile.bannedAt ? t('banned') : profile.published ? t('published') : t('unpublished')}
                          </Badge>
                          {!profile.bannedAt && profile.warnedAt && (
                            <Badge tone="warning">
                              {t('warnedOn', {
                                date: profile.warnedAt.toISOString().slice(0, 10),
                                category: t(`banCategory.${profile.warnedCategory ?? 'other'}`),
                              })}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <form action={adminSetPublishedAction}>
                            <input type="hidden" name="uiLocale" value={locale} />
                            <input type="hidden" name="profileId" value={profile.id} />
                            <input type="hidden" name="publish" value={profile.published ? '0' : '1'} />
                            <Button type="submit" variant="secondary" size="sm">
                              {profile.published ? t('unpublish') : t('publish')}
                            </Button>
                          </form>
                          {profile.customDomain && (
                            <form action={adminClearDomainAction}>
                              <input type="hidden" name="uiLocale" value={locale} />
                              <input type="hidden" name="profileId" value={profile.id} />
                              <Button type="submit" variant="secondary" size="sm">
                                {t('clearDomain', { domain: profile.customDomain })}
                              </Button>
                            </form>
                          )}
                          {profile.bannedAt && (
                            <form action={setProfileBanAction}>
                              <input type="hidden" name="uiLocale" value={locale} />
                              <input type="hidden" name="profileId" value={profile.id} />
                              <input type="hidden" name="ban" value="0" />
                              <Button type="submit" variant="secondary" size="sm">
                                {t('unbanProfile', { slug: profile.slug })}
                              </Button>
                            </form>
                          )}
                        </div>
                        {profile.bannedAt && profile.bannedCategory && (
                          <p className="text-micro text-fg-muted">
                            {t(`banCategory.${profile.bannedCategory}`)} · {profile.bannedReason}
                            {profile.banNoticeSentAt ? '' : ` · ${t('banNoticeNotSent')}`}
                          </p>
                        )}
                        {!profile.bannedAt && (
                          /* DSA чл. 17: бан само с категория и обосновка — собственикът
                             получава изложение на мотивите по имейл. */
                          <details className="group rounded-control border border-danger/35 bg-danger-soft/40 p-3">
                            <summary className="focus-ring cursor-pointer list-none text-small font-semibold text-danger-text [&::-webkit-details-marker]:hidden">
                              {t('banProfile', { slug: profile.slug })}
                            </summary>
                            <form action={setProfileBanAction} className="mt-3 space-y-3">
                              <input type="hidden" name="uiLocale" value={locale} />
                              <input type="hidden" name="profileId" value={profile.id} />
                              <input type="hidden" name="ban" value="1" />
                              <div className="space-y-1.5">
                                <Label htmlFor={`${profile.id}-cat`}>{t('banCategoryLabel')}</Label>
                                <Select id={`${profile.id}-cat`} name="category" required>
                                  {BAN_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                      {t(`banCategory.${c}`)}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`${profile.id}-reason`}>{t('banReasonLabel')}</Label>
                                <Textarea id={`${profile.id}-reason`} name="reason" required minLength={10} maxLength={2000} rows={3} />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`${profile.id}-ground`}>{t('banLegalGroundLabel')}</Label>
                                <Input id={`${profile.id}-ground`} type="text" name="legalGround" maxLength={300} />
                              </div>
                              <label className="flex items-center gap-2 text-small text-fg-2">
                                <input type="checkbox" name="fromReport" className="h-4 w-4" />
                                {t('banFromReport')}
                              </label>
                              <p className="text-small text-fg-muted">{t('banNoticeHint')}</p>
                              <div className="flex flex-wrap gap-2">
                                <button type="submit" name="mode" value="warn" className={warningOutline}>
                                  {t('warnConfirm')}
                                </button>
                                <Button type="submit" name="mode" value="ban" variant="danger" size="sm">
                                  {t('banConfirm')}
                                </Button>
                              </div>
                            </form>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Опасната зона: нова парола, изход отвсякъде, пълно изтриване — сгъната,
                    за да е списъкът кратък и да не се натиска нещо необратимо случайно. */}
                <details className="group rounded-card border border-danger/35 bg-danger-soft/40 p-4">
                  <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="block text-body font-semibold text-danger-text">{t('dangerZone')}</span>
                      <span className="block text-small text-fg-muted">{t('dangerZoneHint')}</span>
                    </span>
                    <span aria-hidden className="text-danger-text transition-transform group-open:rotate-180">▾</span>
                  </summary>
                  <div className="mt-4 space-y-4">
                    <form action={adminSetPasswordAction} className="space-y-2">
                      <input type="hidden" name="uiLocale" value={locale} />
                      <input type="hidden" name="userId" value={user.id} />
                      <Label htmlFor={`${user.id}-pw`}>{t('setPassword')}</Label>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          id={`${user.id}-pw`}
                          type="password"
                          name="password"
                          required
                          minLength={PASSWORD_MIN}
                          placeholder={t('newPassword')}
                          autoComplete="new-password"
                          className="min-w-0 flex-1 sm:max-w-xs"
                        />
                        <button type="submit" className={`${dangerOutline} h-10`}>
                          {t('setPasswordButton')}
                        </button>
                      </div>
                      <p className="text-small text-fg-muted">{t('passwordHint')}</p>
                    </form>
                    <div className="flex flex-wrap items-center gap-3 border-t border-danger/20 pt-4">
                      <form action={adminForceLogoutAction}>
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="userId" value={user.id} />
                        <button type="submit" className={dangerOutline}>
                          {t('forceLogout', { count: user._count.sessions })}
                        </button>
                      </form>
                      <form action={adminDeleteUserAction} className="flex flex-wrap items-center gap-3 sm:ms-auto">
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="userId" value={user.id} />
                        <label className="flex items-center gap-2 text-small text-fg-2">
                          <input type="checkbox" name="confirm" required className="h-4 w-4" />
                          {t('deleteConfirm')}
                        </label>
                        <Button type="submit" variant="danger" size="sm">
                          {t('deleteUser')}
                        </Button>
                      </form>
                    </div>
                  </div>
                </details>
              </Card>
            ))}
          </div>
        </Section>
      </div>
    </AdminShell>
  );
}
