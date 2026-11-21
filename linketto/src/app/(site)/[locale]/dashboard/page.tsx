import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashShell } from '@/components/DashShell';
import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonStyles } from '@/components/ui/Button';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  BILLING_INTERVALS,
  effectiveMonthlyCents,
  intervalPriceCents,
  planFor,
  PLANS,
} from '@/lib/plans';
import {
  addLinkAction,
  createProfileAction,
  deleteLinkAction,
  moveLinkAction,
  setAutoTranslateAction,
  toggleLinkActiveAction,
  updateLinkAction,
  updateProfileAction,
  updateStyleAction,
  verifyDomainAction,
  applyTemplateAction,
  uploadImageAction,
  upsertLinkTranslationAction,
  upsertProfileTranslationAction,
} from '@/app/actions/profile';
import { backgroundCss, buttonCss, parseStyle } from '@/lib/style';
import { ThemePicker } from '@/components/ThemePicker';
import {
  PROFILE_THEMES,
  resolveProfileTheme,
  safeAccent,
  type ProfileThemeId,
} from '@/lib/profile-themes';
import { profileUrl } from '@/lib/profile-url';
import { NICHE_TEMPLATES, TEMPLATE_IDS } from '@/lib/templates';
import { languageDemand } from '@/lib/language-gap';
import { ReferralCard } from '@/components/ReferralCard';
import { TimeZoneField } from '@/components/TimeZoneField';
import { LocalDateTimeInput } from '@/components/LocalDateTimeInput';
import { LivePreview } from '@/components/LivePreview';
import { DashKeepPlace } from '@/components/DashKeepPlace';
import { SortableLinks } from '@/components/SortableLinks';
import { blockFieldsFor, blockFormValues } from '@/lib/blocks';
import { autoTranslateActive } from '@/lib/auto-translate';
import {
  ensureReferralCodeAction,
  requestPayoutAction,
} from '@/app/actions/referral';
import {
  canWithdraw,
  payoutProgressPercent,
  REFERRAL_HOLD_DAYS,
  REFERRAL_MIN_PAYOUT_CENTS,
  REFERRAL_PERCENT,
} from '@/lib/referral';
import {
  ChartColumnIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  SparklesIcon,
} from '@/components/icons';
import Link from 'next/link';
import { startCheckoutAction } from '@/app/actions/billing';
import { checkPurchase } from '@/lib/plan-orders';
import { canWithdraw as canWithdrawPlan } from '@/lib/withdrawal';
import { domainTxtName, domainTxtValue } from '@/lib/domain-verify';
import { aiGenerateBioAction, aiTranslateAction } from '@/app/actions/ai';
import { importLinktreeAction } from '@/app/actions/import';
import { setDigestAction } from '@/app/actions/digest';
import { sendBroadcastAction } from '@/app/actions/newsletter';
import { resolveBookingAction } from '@/app/actions/booking';
import {
  addShortLinkAction,
  deleteShortLinkAction,
} from '@/app/actions/shortlink';
import {
  addProductAction,
  deleteProductAction,
  setTraderStatusAction,
  updateProductAction,
  upsertProductTranslationAction,
} from '@/app/actions/shop';

export const dynamic = 'force-dynamic';

// ?error=<код> → ключ на съобщението (непознат код → общата грешка).
const DASHBOARD_ERRORS: Record<string, string> = {
  slug: 'errorSlugTaken',
  limit: 'errorLimit',
  block: 'errorBlock',
  domain: 'errorDomain',
  ai: 'errorAi',
  aikey: 'errorAiKey',
  product: 'errorProduct',
  style: 'errorStyle',
  upload: 'errorUpload',
  payout: 'errorPayout',
  broadcast: 'errorBroadcast',
  broadcastLimit: 'errorBroadcastLimit',
  shortlinkVerify: 'errorShortlinkVerify',
  shortlinkLimit: 'errorShortlinkLimit',
  blocksLimit: 'errorBlocksLimit',
  shortlink: 'errorShortlink',
  profiles: 'errorProfiles',
  payments: 'errorPayments',
  withdraw: 'errorWithdraw',
  domainVerify: 'errorDomainVerify',
  plan: 'errorPlan',
  consent: 'errorConsent',
  import: 'errorImport',
};

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    translated?: string;
    generated?: string;
    payout?: string;
    broadcast?: string;
    upgraded?: string;
    withdrawn?: string;
    domainVerified?: string;
    imported?: string;
    p?: string;
  }>;
}) {
  const { locale } = await params;
  const {
    error,
    translated,
    generated,
    payout,
    broadcast,
    upgraded,
    withdrawn,
    domainVerified,
    imported,
    p,
  } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const t = await getTranslations('dashboard');
  const plan = planFor(user.plan);

  // Няколко профила на акаунт (Business): списък за превключвателя + активен.
  const profileList = await prisma.profile.findMany({
    where: { userId: user.id },
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
  const activeId =
    p && profileList.some((item) => item.id === p) ? p : profileList[0]?.id;
  const profile = activeId
    ? await prisma.profile.findFirst({
        where: { id: activeId, userId: user.id },
        include: {
          translations: { orderBy: { locale: 'asc' } },
          links: {
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            include: { translations: true },
          },
        },
      })
    : null;
  const canAddProfile = profileList.length < plan.maxProfiles;
  const messages = profile
    ? await prisma.contactMessage.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : [];
  const bookings = profile
    ? await prisma.booking.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : [];
  const shortLinks = profile
    ? await prisma.shortLink.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
    : [];
  const shortLinkBase = process.env.PUBLIC_BASE_URL ?? '';

  // Статистика — прозорецът зависи от плана (Free: 90 дни).
  const since = plan.analyticsDays
    ? new Date(Date.now() - plan.analyticsDays * 24 * 60 * 60 * 1000)
    : undefined;
  const clickWhere = profile
    ? { profileId: profile.id, ...(since ? { createdAt: { gte: since } } : {}) }
    : null;
  // Кликове по продукт (към линка за плащане) в прозореца на плана.
  const productClickRows = clickWhere
    ? await prisma.clickEvent.groupBy({
        by: ['productId'],
        where: { ...clickWhere, productId: { not: null } },
        _count: { _all: true },
      })
    : [];
  const productClicksOf = (id: string) =>
    productClickRows.find((row) => row.productId === id)?._count._all ?? 0;
  const [views, clicks, byLink, byLocale, byCountry, gapCountries] = clickWhere
    ? await Promise.all([
        prisma.clickEvent.count({ where: { ...clickWhere, linkId: null, productId: null } }),
        prisma.clickEvent.count({
          where: { ...clickWhere, OR: [{ linkId: { not: null } }, { productId: { not: null } }] },
        }),
        prisma.clickEvent.groupBy({
          by: ['linkId'],
          where: { ...clickWhere, linkId: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { linkId: 'desc' } },
          take: 10,
        }),
        prisma.clickEvent.groupBy({
          by: ['locale'],
          where: { ...clickWhere, locale: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { locale: 'desc' } },
          take: 6,
        }),
        prisma.clickEvent.groupBy({
          by: ['country'],
          where: { ...clickWhere, country: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { country: 'desc' } },
          take: 6,
        }),
        // „Езикова дупка": разбивка по държави на посещенията (linkId null),
        // без лимит на 6 — за да покрием реалното езиково търсене.
        prisma.clickEvent.groupBy({
          by: ['country'],
          where: { ...clickWhere, linkId: null, productId: null, country: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { country: 'desc' } },
          take: 40,
        }),
      ])
    : [0, 0, [], [], [], []];
  const products = profile
    ? await prisma.product.findMany({
        where: { profileId: profile.id },
        orderBy: { position: 'asc' },
        include: { translations: true },
      })
    : [];
  const [subConfirmed, subPending] = profile
    ? await Promise.all([
        prisma.subscriber.count({
          where: {
            profileId: profile.id,
            confirmedAt: { not: null },
            unsubscribedAt: null,
          },
        }),
        prisma.subscriber.count({
          where: {
            profileId: profile.id,
            confirmedAt: null,
            unsubscribedAt: null,
          },
        }),
      ])
    : [0, 0];
  // Реферална програма: брой поканени регистрации и успешни (платили) реферали.
  const [referredSignups, successfulReferrals, heldReferrals] = await Promise.all([
    prisma.user.count({ where: { referredById: user.id } }),
    prisma.referral.count({ where: { referrerId: user.id } }),
    // Задържаните бонуси (abuse-money-spec А5) — влизат в баланса след срока за отказ/спор.
    prisma.referral.aggregate({
      where: { referrerId: user.id, releasedAt: null, reversedAt: null },
      _sum: { rewardCents: true },
      _min: { createdAt: true },
    }),
  ]);
  const heldCents = heldReferrals._sum.rewardCents ?? 0;
  const nextRelease = heldReferrals._min.createdAt
    ? new Date(heldReferrals._min.createdAt.getTime() + (REFERRAL_HOLD_DAYS + 1) * 24 * 60 * 60_000)
    : null;
  // Функцията за отказ (чл. 11а Дир. 2011/83): платените поръчки от последните
  // 15 дни — допустимите показват „Откажете се от договора тук“, а подадените —
  // кога е получено изявлението.
  const recentPaidOrders = await prisma.planOrder.findMany({
    where: {
      userId: user.id,
      completedAt: { gte: new Date(Date.now() - 16 * 86_400_000) },
    },
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      plan: true,
      interval: true,
      amountCents: true,
      state: true,
      applied: true,
      completedAt: true,
      withdrawalRequestedAt: true,
    },
  });
  const nowForWithdrawal = new Date();
  const withdrawable = recentPaidOrders.filter((o) => canWithdrawPlan({ ...o, now: nowForWithdrawal }));
  const withdrawalsRequested = recentPaidOrders.filter((o) => o.withdrawalRequestedAt);

  const referralBase = process.env.PUBLIC_BASE_URL ?? '';
  const referralUrl = user.referralCode
    ? `${referralBase}/${locale}/register?ref=${user.referralCode}`
    : null;

  const linkTitle = (linkId: string | null) => {
    const link = profile?.links.find((item) => item.id === linkId);
    return (
      link?.translations.find((tr) => tr.locale === profile?.defaultLocale)
        ?.title ??
      link?.translations[0]?.title ??
      link?.url ??
      '—'
    );
  };

  // „Езикова дупка": кои езици говорят посетителите и кои още нямат превод.
  const gap = profile
    ? languageDemand(
        gapCountries.map((row) => ({
          country: row.country,
          count: row._count._all,
        })),
        profile.translations.map((tr) => tr.locale),
      )
    : null;

  // Всеки рендер на сървъра (след запис, подреждане…) → нов rev: прегледът се
  // презарежда, а таблото връща мястото, от което е изпратена формата.
  const rev = Date.now().toString(36);

  return (
    <DashShell
      locale={locale as Locale}
      page="dashboard"
      profiles={profileList}
      activeId={activeId}
      planId={plan.id}
      aside={
        profile && profile.translations.length > 0 ? (
          <LivePreview
            slug={profile.slug}
            rev={rev}
            defaultLocale={profile.defaultLocale}
            locales={profile.translations.map((tr) => ({
              code: tr.locale,
              name: LOCALE_NAMES[tr.locale as Locale] ?? tr.locale,
            }))}
            labels={{
              title: t('previewTitle'),
              hint: t('previewHint'),
              language: t('previewLanguage'),
              open: t('previewOpen'),
              close: t('previewClose'),
              toggle: t('previewToggle'),
              frame: t('previewFrame'),
            }}
          />
        ) : undefined
      }
    >
      <DashKeepPlace rev={rev} />
      <PageHeader title={t('title')} description={t('pageIntro')} />
      <div className="space-y-6">
        {error && (
          <Callout tone="danger">
            {t(Object.hasOwn(DASHBOARD_ERRORS, error) ? DASHBOARD_ERRORS[error] : 'errorGeneric')}
          </Callout>
        )}
        {domainVerified && <Callout tone="success">{t('domainVerifiedOk')}</Callout>}
        {!user.emailVerifiedAt && (
          <Callout tone="warning">
            {t('verifyBanner')}{' '}
            <a href={`/${locale}/dashboard/security#email`} className="font-semibold underline">
              {t('verifyBannerLink')}
            </a>
          </Callout>
        )}
        {/* DSA чл. 17: мотивите за спиране/предупреждението — и в таблото, не
            само по имейл (видимо само за собственика, никога публично). */}
        {profile?.bannedAt && (
          <Callout
            tone="danger"
            title={t('moderationBanned', {
              slug: profile.slug,
              date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(profile.bannedAt),
            })}
          >
            {profile.bannedCategory && (
              <p>
                {t(`moderationCategory.${profile.bannedCategory}`)}
                {profile.bannedReason ? ` — ${profile.bannedReason}` : ''}
              </p>
            )}
            <p>{t('moderationAppeal')}</p>
          </Callout>
        )}
        {profile && !profile.bannedAt && profile.warnedAt &&
          profile.warnedAt.getTime() > Date.now() - 30 * 86_400_000 && (
          <Callout
            tone="warning"
            title={t('moderationWarned', {
              slug: profile.slug,
              date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
                new Date(profile.warnedAt.getTime() + 7 * 86_400_000),
              ),
            })}
          >
            {profile.warnedCategory && (
              <p>
                {t(`moderationCategory.${profile.warnedCategory}`)}
                {profile.warnedReason ? ` — ${profile.warnedReason}` : ''}
              </p>
            )}
            <p>{t('moderationAppeal')}</p>
          </Callout>
        )}
        {withdrawn && <Callout tone="success">{t('withdrawDone')}</Callout>}
        {upgraded && plan.id === 'FREE' && <Callout tone="info">{t('upgradedProcessing')}</Callout>}
        {translated && <Callout tone="success">{t('translatedOk')}</Callout>}
        {generated && <Callout tone="success">{t('generatedOk')}</Callout>}
        {payout && <Callout tone="success">{t('referralPayoutRequested')}</Callout>}
        {broadcast && <Callout tone="success">{t('broadcastSent', { count: broadcast })}</Callout>}
        {imported && (
          <Callout tone="success">
            {t('importedOk', { count: Number(imported) || 0 })}{' '}
            <a href="#languages" className="font-semibold underline">
              {t('importedTranslate')}
            </a>
          </Callout>
        )}

        {/* Профили: списък + добавяне (няколко профила = Business) */}
        {profileList.length > 0 && (
          <Card id="profiles" padding="sm" className="dash-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small font-semibold text-fg-2">{t('profilesLabel')}</span>
              {profileList.map((item) => (
                <a
                  key={item.id}
                  href={`/${locale}/dashboard?p=${item.id}`}
                  aria-current={item.id === activeId ? 'true' : undefined}
                  className={`focus-ring rounded-full px-3 py-1 text-small font-medium ${
                    item.id === activeId
                      ? 'bg-accent text-accent-fg'
                      : 'border border-line-strong text-fg-2 hover:bg-surface-3'
                  }`}
                >
                  /{item.slug}
                </a>
              ))}
            </div>
            {canAddProfile ? (
              <form
                action={createProfileAction}
                className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input
                  type="text"
                  name="slug"
                  required
                  placeholder={t('newProfileSlug')}
                  aria-label={t('newProfileSlug')}
                  className="h-9 min-w-0 flex-1 rounded-control border border-line-input px-3 text-small"
                />
                <button type="submit" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
                  {t('addProfile')}
                </button>
              </form>
            ) : (
              <p className="mt-2 text-small text-fg-muted">
                {t('profilesUpsell', { max: plan.maxProfiles })}
              </p>
            )}
          </Card>
        )}

        {!profile ? (
          <section className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
            <p className="font-medium">{t('noProfile')}</p>
            <form action={createProfileAction} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="uiLocale" value={locale} />
              <input
                type="text"
                name="slug"
                required
                placeholder="maria"
                className="flex-1 rounded-control border border-line-input px-3 py-2"
              />
              <input
                type="text"
                name="displayName"
                placeholder={t('displayName')}
                className="flex-1 rounded-control border border-line-input px-3 py-2"
              />
              <select
                name="template"
                defaultValue=""
                aria-label={t('templatesTitle')}
                className="rounded-control border border-line-input px-3 py-2"
              >
                <option value="">{t('templateNone')}</option>
                {TEMPLATE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(`template_${id}`)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className={buttonStyles()}
              >
                {t('createProfile')}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section id="profile" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2 className="text-subheading text-fg">{t('profileSection')}</h2>
                <a
                  href={profileUrl(profile.slug)}
                  className="text-sm font-medium text-accent-text hover:underline"
                >
                  {t('viewPublic')} →{' '}
                  {profileUrl(profile.slug).replace(/^https?:\/\//, '')}
                </a>
              </div>
              <form
                action={updateProfileAction}
                data-preview="profile"
                className="mt-4 grid gap-4 sm:grid-cols-2"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <ThemePicker
                  className="sm:col-span-2"
                  name="theme"
                  legend={t('theme')}
                  value={resolveProfileTheme(profile.theme)}
                  accent={safeAccent(profile.accent)}
                  labels={Object.fromEntries(
                    PROFILE_THEMES.map((id) => [id, t(`themeName_${id}`)]),
                  ) as Record<ProfileThemeId, string>}
                />
                <label className="block text-sm font-medium">
                  {t('defaultLocale')}
                  <select
                    name="defaultLocale"
                    defaultValue={profile.defaultLocale}
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  >
                    {LOCALES.map((loc) => (
                      <option key={loc} value={loc}>
                        {LOCALE_NAMES[loc]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t('accent')}
                  <input
                    type="text"
                    name="accent"
                    defaultValue={profile.accent ?? ''}
                    placeholder="#3b82c4"
                    pattern="#[0-9a-fA-F]{6}"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('customDomainLabel')}
                  <input
                    type="text"
                    name="customDomain"
                    defaultValue={profile.customDomain ?? ''}
                    placeholder="links.example.com"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                  <span className="mt-1 block text-xs font-normal text-fg-muted">
                    {t('customDomainHint')}
                  </span>
                </label>
                <label className="flex items-end gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="published"
                    defaultChecked={profile.published}
                    className="h-4 w-4"
                  />
                  {t('published')}
                </label>
                <button
                  type="submit"
                  className={buttonStyles({ className: 'sm:col-span-2 sm:justify-self-start' })}
                >
                  {t('save')}
                </button>
              </form>
              {/* Собствен домейн: TXT проверка на собствеността — публично се
                  показва едва след нея (lib/domain-verify.ts). */}
              {profile.customDomain && profile.domainToken && (
                <div className="mt-4 rounded-card border border-line bg-surface-2 p-4 text-sm">
                  {profile.domainVerifiedAt ? (
                    <p className="inline-flex items-center gap-1.5 font-medium text-success-text">
                      <CheckIcon className="h-4 w-4" />
                      {t('domainVerified', { domain: profile.customDomain })}
                    </p>
                  ) : (
                    <form action={verifyDomainAction} className="space-y-2">
                      <input type="hidden" name="uiLocale" value={locale} />
                      <input type="hidden" name="profileId" value={profile.id} />
                      <p className="font-medium text-warning-text">
                        {t('domainUnverified', { domain: profile.customDomain })}
                      </p>
                      <p className="text-fg-2">{t('domainTxtHint')}</p>
                      <dl className="grid gap-1 font-mono text-xs sm:grid-cols-[5rem_1fr]">
                        <dt className="text-fg-muted">TXT</dt>
                        <dd className="break-all text-fg">{domainTxtName(profile.customDomain)}</dd>
                        <dt className="text-fg-muted">{t('domainTxtValueLabel')}</dt>
                        <dd className="break-all text-fg">{domainTxtValue(profile.domainToken)}</dd>
                      </dl>
                      <button
                        type="submit"
                        className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                      >
                        {t('domainVerifyButton')}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </section>

            <section id="style" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('styleSection')}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t('styleHint')}</p>
              {/* Шаблони по ниша — готов вид за 1 клик (съдържанието се пази) */}
              <div className="mt-4">
                <p className="text-sm font-semibold text-fg-2">
                  {t('templatesTitle')}
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {TEMPLATE_IDS.map((id) => {
                    const preset = NICHE_TEMPLATES[id];
                    const look = parseStyle(preset.style);
                    return (
                      <li key={id}>
                        <form action={applyTemplateAction}>
                          <input type="hidden" name="uiLocale" value={locale} />
                          <input type="hidden" name="profileId" value={profile.id} />
                          <input type="hidden" name="template" value={id} />
                          <button
                            type="submit"
                            className="group w-full rounded-card border border-line p-1.5 text-start transition hover:border-accent "
                          >
                            <span
                              aria-hidden="true"
                              className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-control px-3"
                              style={{
                                ...backgroundCss(look),
                                color: look.textColor ?? '#ffffff',
                              }}
                            >
                              <span
                                className={`h-3 w-full border-2 ${look.buttonShape === 'square' ? '' : 'rounded-full'}`}
                                style={buttonCss(look, preset.accent)}
                              />
                              <span
                                className={`h-3 w-full border-2 ${look.buttonShape === 'square' ? '' : 'rounded-full'}`}
                                style={buttonCss(look, preset.accent)}
                              />
                            </span>
                            <span className="mt-1.5 block px-1 text-xs font-semibold text-fg-2 group-hover:text-accent-text">
                              {t(`template_${id}`)}
                            </span>
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {(() => {
                const styleCfg = parseStyle(profile.style);
                const selectClass =
                  'mt-1 w-full rounded-control border border-line-input px-3 py-2';
                return (
                  <form
                    action={updateStyleAction}
                    data-preview="style"
                    className="mt-4 grid gap-4 sm:grid-cols-3"
                  >
                    <input type="hidden" name="uiLocale" value={locale} />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <label className="block text-sm font-medium">
                      {t('styleBg')}
                      <select
                        name="bgStyle"
                        defaultValue={styleCfg.bgStyle}
                        className={selectClass}
                      >
                        {(['theme', 'solid', 'gradient', 'image'] as const).map(
                          (option) => (
                            <option key={option} value={option}>
                              {t(`styleBg_${option}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleEffect')}
                      <select
                        name="bgEffect"
                        defaultValue={styleCfg.bgEffect}
                        className={selectClass}
                      >
                        {(['none', 'aurora', 'stars', 'gradient'] as const).map(
                          (option) => (
                            <option key={option} value={option}>
                              {t(`styleEffect_${option}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleBgColor1')}
                      <input
                        type="color"
                        name="bgColor1"
                        defaultValue={styleCfg.bgColor1}
                        className="mt-1 h-10 w-full rounded-control border border-line-input"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleBgColor2')}
                      <input
                        type="color"
                        name="bgColor2"
                        defaultValue={styleCfg.bgColor2}
                        className="mt-1 h-10 w-full rounded-control border border-line-input"
                      />
                    </label>
                    <label className="block text-sm font-medium sm:col-span-2">
                      {t('styleBgImage')}
                      <input
                        type="text"
                        name="bgImageUrl"
                        defaultValue={styleCfg.bgImageUrl ?? ''}
                        placeholder="https://…"
                        className={selectClass}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleOverlay')}
                      <select
                        name="bgOverlay"
                        defaultValue={String(styleCfg.bgOverlay)}
                        className={selectClass}
                      >
                        {(['0', '0.2', '0.35', '0.5', '0.65'] as const).map(
                          (value) => (
                            <option key={value} value={value}>
                              {Math.round(Number(value) * 100)}%
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleFont')}
                      <select
                        name="font"
                        defaultValue={styleCfg.font}
                        className={selectClass}
                      >
                        {(['sans', 'serif', 'mono', 'rounded'] as const).map(
                          (option) => (
                            <option key={option} value={option}>
                              {t(`styleFont_${option}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleButtonShape')}
                      <select
                        name="buttonShape"
                        defaultValue={styleCfg.buttonShape}
                        className={selectClass}
                      >
                        {(['pill', 'rounded', 'square'] as const).map(
                          (option) => (
                            <option key={option} value={option}>
                              {t(`styleShape_${option}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleButtonFill')}
                      <select
                        name="buttonFill"
                        defaultValue={styleCfg.buttonFill}
                        className={selectClass}
                      >
                        {(['soft', 'solid', 'outline'] as const).map(
                          (option) => (
                            <option key={option} value={option}>
                              {t(`styleFill_${option}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleButtonShadow')}
                      <select
                        name="buttonShadow"
                        defaultValue={styleCfg.buttonShadow}
                        className={selectClass}
                      >
                        {(['none', 'soft', 'hard'] as const).map((option) => (
                          <option key={option} value={option}>
                            {t(`styleShadow_${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleLayout')}
                      <select
                        name="layout"
                        defaultValue={styleCfg.layout}
                        className={selectClass}
                      >
                        {(['list', 'grid'] as const).map((option) => (
                          <option key={option} value={option}>
                            {t(`styleLayout_${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleAlign')}
                      <select
                        name="align"
                        defaultValue={styleCfg.align}
                        className={selectClass}
                      >
                        {(['center', 'start'] as const).map((option) => (
                          <option key={option} value={option}>
                            {t(`styleAlign_${option}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium sm:col-span-2">
                      {t('styleAvatar')}
                      <input
                        type="text"
                        name="avatarUrl"
                        defaultValue={styleCfg.avatarUrl ?? ''}
                        placeholder="https://…"
                        className={selectClass}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleAvatarShape')}
                      <select
                        name="avatarShape"
                        defaultValue={styleCfg.avatarShape}
                        className={selectClass}
                      >
                        {(['circle', 'rounded', 'square'] as const).map(
                          (option) => (
                            <option key={option} value={option}>
                              {t(`styleAvatarShape_${option}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleTextColor')}
                      <input
                        type="text"
                        name="textColor"
                        defaultValue={styleCfg.textColor ?? ''}
                        placeholder="#ffffff"
                        pattern="#[0-9a-fA-F]{6}"
                        className={selectClass}
                      />
                    </label>
                    <label className="flex items-end gap-2 text-sm font-medium sm:col-span-2">
                      <input
                        type="checkbox"
                        name="hideBadge"
                        defaultChecked={styleCfg.hideBadge}
                        className="h-4 w-4"
                      />
                      {t('styleHideBadge')}
                    </label>
                    <label className="flex items-end gap-2 text-sm font-medium sm:col-span-2">
                      <input
                        type="checkbox"
                        name="showViews"
                        defaultChecked={styleCfg.showViews}
                        className="h-4 w-4"
                      />
                      {t('styleShowViews')}
                    </label>
                    <label className="flex items-end gap-2 text-sm font-medium sm:col-span-2">
                      <input
                        type="checkbox"
                        name="mediaKit"
                        defaultChecked={styleCfg.mediaKit}
                        className="h-4 w-4"
                      />
                      {t('styleMediaKit')}
                    </label>
                    <button
                      type="submit"
                      className={buttonStyles({ className: 'sm:col-span-3 sm:justify-self-start' })}
                    >
                      {t('save')}
                    </button>
                  </form>
                );
              })()}
              <div className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
                <form action={uploadImageAction} className="text-sm">
                  <input type="hidden" name="uiLocale" value={locale} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input type="hidden" name="kind" value="bg" />
                  <span className="font-medium">{t('uploadBg')}</span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="file"
                      name="file"
                      required
                      accept="image/jpeg,image/png,image/webp"
                      className="flex-1 text-xs text-fg-muted file:me-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent-soft-fg hover:file:bg-accent-soft"
                    />
                    <button
                      type="submit"
                      className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                    >
                      {t('uploadButton')}
                    </button>
                  </div>
                </form>
                <form action={uploadImageAction} className="text-sm">
                  <input type="hidden" name="uiLocale" value={locale} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input type="hidden" name="kind" value="avatar" />
                  <span className="font-medium">{t('uploadAvatar')}</span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="file"
                      name="file"
                      required
                      accept="image/jpeg,image/png,image/webp"
                      className="flex-1 text-xs text-fg-muted file:me-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent-soft-fg hover:file:bg-accent-soft"
                    />
                    <button
                      type="submit"
                      className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                    >
                      {t('uploadButton')}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section id="languages" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-subheading text-fg">{t('translationsSection')}</h2>
                <form action={aiTranslateAction}>
                  <input type="hidden" name="uiLocale" value={locale} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <button
                    type="submit"
                    className={buttonStyles()}
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {t('aiTranslateButton')}
                  </button>
                </form>
              </div>
              <p className="mt-1 text-sm text-fg-muted">
                {t('translationsHint')} {t('aiTranslateHint')}
              </p>
              {/* Автоматичен превод за посетителите (docs/geo-autotranslate-spec.md):
                  on / off (възражение) / pending (профил отпреди функцията — включва се
                  едва ≥14 дни след имейла; до тогава създателят може да възрази). */}
              {(() => {
                const active = autoTranslateActive(profile);
                const pending = profile.autoTranslateMode === 'pending' && !active;
                const startsAt = profile.autoTranslateStartsAt;
                const toggle = (value: 'on' | 'off', label: string, variant: 'secondary' | 'ghost') => (
                  <form action={setAutoTranslateAction}>
                    <input type="hidden" name="uiLocale" value={locale} />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input type="hidden" name="value" value={value} />
                    <button type="submit" className={buttonStyles({ variant, size: 'sm' })}>
                      {label}
                    </button>
                  </form>
                );
                return (
                  <div id="autotranslate" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-2 p-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                        {t('autoTranslateTitle')}
                        <Badge tone={active ? 'success' : pending ? 'warning' : 'neutral'}>
                          {active
                            ? t('autoTranslateStateOn')
                            : pending
                              ? t('autoTranslateStatePending')
                              : t('autoTranslateStateOff')}
                        </Badge>
                      </p>
                      <p className="mt-1 text-xs text-fg-muted">
                        {active
                          ? t('autoTranslateOn')
                          : pending
                            ? startsAt
                              ? t('autoTranslatePendingAt', {
                                  date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(startsAt),
                                })
                              : t('autoTranslatePendingNoNotice')
                            : t('autoTranslateOff')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pending && toggle('on', t('autoTranslateTurnOnNow'), 'ghost')}
                      {active || pending
                        ? toggle('off', t('autoTranslateTurnOff'), 'secondary')
                        : toggle('on', t('autoTranslateTurnOn'), 'secondary')}
                    </div>
                  </div>
                );
              })()}
              {/* AI генериране на био от ключови думи (на основния език) */}
              <form
                action={aiGenerateBioAction}
                className="mt-4 flex flex-wrap items-end gap-2 rounded-card border border-line bg-accent-soft p-3"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <label className="flex-1 text-sm font-medium">
                  {t('aiBioLabel')}
                  <input
                    type="text"
                    name="keywords"
                    required
                    placeholder={t('aiBioPlaceholder')}
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  className={buttonStyles({ variant: 'secondary' })}
                >
                  <SparklesIcon className="h-4 w-4" />
                  {t('aiBioButton')}
                </button>
              </form>
              <div className="mt-4 space-y-4">
                {(() => {
                  const row = (loc: (typeof LOCALES)[number]) => {
                    const translation = profile.translations.find(
                      (item) => item.locale === loc,
                    );
                    return (
                      <form
                        key={loc}
                        action={upsertProfileTranslationAction}
                        data-preview="translation"
                        className="grid items-end gap-3 sm:grid-cols-[6rem_1fr_1fr_auto]"
                      >
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input
                          type="hidden"
                          name="profileId"
                          value={profile.id}
                        />
                        <input type="hidden" name="locale" value={loc} />
                        <span className="text-sm font-semibold">
                          {LOCALE_NAMES[loc]}
                        </span>
                        <label className="block text-sm">
                          {t('displayName')}
                          <input
                            type="text"
                            name="displayName"
                            defaultValue={translation?.displayName ?? ''}
                            className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                          />
                        </label>
                        <label className="block text-sm">
                          {t('bio')}
                          <input
                            type="text"
                            name="bio"
                            defaultValue={translation?.bio ?? ''}
                            className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                          />
                        </label>
                        <button
                          type="submit"
                          className={buttonStyles({ variant: 'secondary' })}
                        >
                          {t('save')}
                        </button>
                      </form>
                    );
                  };
                  const hasTranslation = (loc: string) =>
                    profile.translations.some((item) => item.locale === loc);
                  const filled = LOCALES.filter(hasTranslation);
                  const empty = LOCALES.filter((loc) => !hasTranslation(loc));
                  return (
                    <>
                      {filled.map(row)}
                      {empty.length > 0 && (
                        <details className="faq-item rounded-card border border-dashed border-line-input px-4 py-3 open:border-solid open:bg-surface-2">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-accent-text">
                            <span>{t('moreLanguages', { count: empty.length })}</span>
                            <span aria-hidden className="faq-plus" />
                          </summary>
                          <div className="mt-4 space-y-4">
                            {empty.map(row)}
                          </div>
                        </details>
                      )}
                    </>
                  );
                })()}
              </div>
            </section>

            <section id="links" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('linksSection')}</h2>
              {/* Пренасяне от Linktree за минута — най-ниската бариера за смяна */}
              <details
                className="group mt-4 rounded-card border border-dashed border-accent/40 bg-accent-soft p-4"
                open={profile.links.length === 0}
              >
                <summary className="cursor-pointer text-sm font-semibold text-accent-soft-fg">
                  {t('importTitle')}
                </summary>
                <p className="mt-2 text-sm text-fg-2">{t('importHint')}</p>
                <form
                  action={importLinktreeAction}
                  className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
                >
                  <input type="hidden" name="uiLocale" value={locale} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input
                    type="text"
                    name="source"
                    required
                    placeholder="linktr.ee/maria"
                    aria-label={t('importTitle')}
                    className="min-w-0 flex-1 rounded-control border border-line-input bg-surface px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-fg-2">
                    <input type="checkbox" name="own" required />
                    {t('importOwn')}
                  </label>
                  <button
                    type="submit"
                    className={buttonStyles()}
                  >
                    {t('importCta')}
                  </button>
                </form>
              </details>
              <p className="mt-4 text-sm text-fg-muted">{t('linksIntro')}</p>
              {profile.links.length > 0 && (
                <div className="mt-3">
                  <SortableLinks
                    profileId={profile.id}
                    labels={{
                      handle: t('linkHandle'),
                      saving: t('linkOrderSaving'),
                      saved: t('linkOrderSaved'),
                      failed: t('linkOrderFailed'),
                    }}
                    items={profile.links.map((link, index) => {
                      const title =
                        link.translations.find((item) => item.locale === profile.defaultLocale)?.title ?? '';
                      const values = blockFormValues(link);
                      const shows = blockFieldsFor(link.kind);
                      const field = 'mt-1 w-full rounded-control border border-line-input bg-surface px-3 py-2 text-sm';
                      return {
                        id: link.id,
                        label: title || link.url || t('linkNoTitle'),
                        node: (
                          <div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              {/* min-w: на тесен екран бутоните падат на нов ред, а заглавието се вижда */}
                              <div className="min-w-[min(100%,14rem)] flex-1">
                                <p className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-fg-2">
                                    {t(`kind_${link.kind}`)}
                                  </span>
                                  {!link.active && (
                                    <span className="rounded border border-line px-1.5 py-0.5 text-xs font-semibold text-fg-muted">
                                      {t('linkHiddenBadge')}
                                    </span>
                                  )}
                                  {(link.showFrom || link.showUntil) && (
                                    <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning-text">
                                      <ClockIcon className="h-3 w-3" />
                                      {t('scheduledBadge')}
                                    </span>
                                  )}
                                </p>
                                <p
                                  className={`mt-1 truncate text-sm font-semibold ${
                                    link.active ? 'text-fg' : 'text-fg-muted line-through'
                                  }`}
                                >
                                  {title || t('linkNoTitle')}
                                </p>
                                {link.url && <p className="truncate text-xs text-fg-muted">{link.url}</p>}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {(['up', 'down'] as const).map((dir) => (
                                  <form key={dir} action={moveLinkAction}>
                                    <input type="hidden" name="uiLocale" value={locale} />
                                    <input type="hidden" name="linkId" value={link.id} />
                                    <input type="hidden" name="dir" value={dir} />
                                    <button
                                      type="submit"
                                      disabled={dir === 'up' ? index === 0 : index === profile.links.length - 1}
                                      aria-label={`${t(dir === 'up' ? 'linkMoveUp' : 'linkMoveDown')}: ${title || t('linkNoTitle')}`}
                                      title={t(dir === 'up' ? 'linkMoveUp' : 'linkMoveDown')}
                                      className={buttonStyles({
                                        variant: 'ghost',
                                        size: 'sm',
                                        className: 'w-8 px-0 disabled:opacity-30',
                                      })}
                                    >
                                      <span aria-hidden>{dir === 'up' ? '↑' : '↓'}</span>
                                    </button>
                                  </form>
                                ))}
                                <form action={toggleLinkActiveAction}>
                                  <input type="hidden" name="uiLocale" value={locale} />
                                  <input type="hidden" name="linkId" value={link.id} />
                                  <button
                                    type="submit"
                                    className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                                  >
                                    {link.active ? t('linkHide') : t('linkShow')}
                                  </button>
                                </form>
                                <form action={deleteLinkAction}>
                                  <input type="hidden" name="uiLocale" value={locale} />
                                  <input type="hidden" name="linkId" value={link.id} />
                                  <button
                                    type="submit"
                                    className="rounded-control px-2 py-1.5 text-sm font-medium text-danger-text hover:underline"
                                  >
                                    {t('delete')}
                                  </button>
                                </form>
                              </div>
                            </div>
                            <details className="mt-2">
                              <summary className="cursor-pointer text-sm font-semibold text-accent-text">
                                {t('linkEdit')}
                              </summary>
                              <form
                                action={updateLinkAction}
                                data-preview="link-edit"
                                data-locale={profile.defaultLocale}
                                className="mt-3 grid gap-3 sm:grid-cols-2"
                              >
                                <input type="hidden" name="uiLocale" value={locale} />
                                <input type="hidden" name="linkId" value={link.id} />
                                <label className="block text-sm font-medium sm:col-span-2">
                                  {t('linkTitle')} ({profile.defaultLocale.toUpperCase()})
                                  <input type="text" name="title" required maxLength={100} defaultValue={title} className={field} />
                                </label>
                                {shows.url && (
                                  <label className="block text-sm font-medium">
                                    {t('urlLabel')}
                                    <input type="text" name="url" defaultValue={values.url} className={field} />
                                  </label>
                                )}
                                {shows.extra1 && (
                                  <label className="block text-sm font-medium">
                                    {t('extra1Label')}
                                    <input type="text" name="extra1" defaultValue={values.extra1} className={field} />
                                  </label>
                                )}
                                {shows.extra2 && (
                                  <label className="block text-sm font-medium">
                                    {t('extra2Label')}
                                    <input type="text" name="extra2" defaultValue={values.extra2} className={field} />
                                  </label>
                                )}
                                {shows.options && (
                                  <label className="block text-sm font-medium sm:col-span-2">
                                    {t('pollOptionsLabel')}
                                    <textarea name="options" rows={3} defaultValue={values.options} className={field} />
                                  </label>
                                )}
                                <label className="block text-sm font-medium">
                                  {t('blockColorLabel')}
                                  <input
                                    type="text"
                                    name="color"
                                    defaultValue={values.color}
                                    placeholder="#3b82c4"
                                    pattern="#[0-9a-fA-F]{6}"
                                    className={field}
                                  />
                                </label>
                                <TimeZoneField />
                                <label className="block text-sm font-medium">
                                  {t('scheduleFromLabel')}
                                  <LocalDateTimeInput name="showFrom" iso={link.showFrom?.toISOString() ?? null} className={field} />
                                </label>
                                <label className="block text-sm font-medium">
                                  {t('scheduleUntilLabel')}
                                  <LocalDateTimeInput name="showUntil" iso={link.showUntil?.toISOString() ?? null} className={field} />
                                </label>
                                <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                                  <input type="checkbox" name="featured" defaultChecked={values.featured} className="h-4 w-4" />
                                  {t('featuredLabel')}
                                </label>
                                <button type="submit" className={buttonStyles({ size: 'sm', className: 'sm:justify-self-start' })}>
                                  {t('linkSaveChanges')}
                                </button>
                              </form>
                              {profile.translations.length > 1 && (
                                <div className="mt-4 border-t border-line pt-3">
                                  <p className="text-xs font-semibold text-fg-2">{t('linkOtherLanguages')}</p>
                                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    {profile.translations
                                      .filter((translation) => translation.locale !== profile.defaultLocale)
                                      .map((translation) => (
                                        <form
                                          key={translation.locale}
                                          action={upsertLinkTranslationAction}
                                          data-preview="link"
                                          className="flex items-center gap-2"
                                        >
                                          <input type="hidden" name="uiLocale" value={locale} />
                                          <input type="hidden" name="linkId" value={link.id} />
                                          <input type="hidden" name="locale" value={translation.locale} />
                                          <span className="w-8 text-xs font-semibold uppercase text-fg-muted">
                                            {translation.locale}
                                          </span>
                                          <input
                                            type="text"
                                            name="title"
                                            maxLength={100}
                                            defaultValue={
                                              link.translations.find((item) => item.locale === translation.locale)?.title ?? ''
                                            }
                                            placeholder={t('linkTitle')}
                                            className="min-w-0 flex-1 rounded-control border border-line-input bg-surface px-3 py-1.5 text-sm"
                                          />
                                          <button
                                            type="submit"
                                            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'shrink-0' })}
                                          >
                                            {t('save')}
                                          </button>
                                        </form>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </details>
                          </div>
                        ),
                      };
                    })}
                  />
                </div>
              )}
              <form
                action={addLinkAction}
                className="mt-6 grid gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <label className="block text-sm font-medium">
                  {t('kindLabel')}
                  <select
                    name="kind"
                    defaultValue="LINK"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  >
                    {(
                      [
                        'LINK',
                        'HEADER',
                        'PHONE',
                        'MAP',
                        'VIDEO',
                        'MUSIC',
                        'APP',
                        'FORM',
                        'TIP',
                        'EMAIL',
                        'POLL',
                        'BOOKING',
                      ] as const
                    ).map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`kind_${kind}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t('linkTitle')}
                  <input
                    type="text"
                    name="title"
                    required
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('urlLabel')}
                  <input
                    type="text"
                    name="url"
                    placeholder="https://…"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('extra1Label')}
                  <input
                    type="url"
                    name="extra1"
                    placeholder="https://…"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('extra2Label')}
                  <input
                    type="url"
                    name="extra2"
                    placeholder="https://…"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('blockColorLabel')}
                  <input
                    type="text"
                    name="color"
                    placeholder="#3b82c4"
                    pattern="#[0-9a-fA-F]{6}"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <TimeZoneField />
                <label className="block text-sm font-medium">
                  {t('scheduleFromLabel')}
                  <input
                    type="datetime-local"
                    name="showFrom"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('scheduleUntilLabel')}
                  <input
                    type="datetime-local"
                    name="showUntil"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  {t('pollOptionsLabel')}
                  <textarea
                    name="options"
                    rows={3}
                    placeholder={t('pollOptionsPlaceholder')}
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                  />
                  <span className="mt-1 block text-xs font-normal text-fg-muted">
                    {t('pollOptionsHint')}
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                  <input type="checkbox" name="featured" className="h-4 w-4" />
                  {t('featuredLabel')}
                </label>
                <p className="text-xs text-fg-muted sm:col-span-2">
                  {t('addBlockHint')} {t('scheduleHint')}
                </p>
                <button
                  type="submit"
                  className={buttonStyles({ className: 'sm:justify-self-start' })}
                >
                  {t('addLink')}
                </button>
              </form>
            </section>

            <section id="qr" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('qrSection')}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t('qrHint')}</p>
              <div className="mt-4 flex items-center gap-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- динамичен SVG route */}
                <img
                  src={`/u/${profile.slug}/qr`}
                  alt="QR"
                  width={144}
                  height={144}
                  className="h-36 w-36 rounded-card border border-line bg-surface p-2"
                />
                <a
                  href={`/u/${profile.slug}/qr`}
                  download={`${profile.slug}-qr.svg`}
                  className={buttonStyles({ variant: 'secondary' })}
                >
                  <DownloadIcon className="h-4 w-4" />
                  SVG
                </a>
              </div>
              {parseStyle(profile.style).mediaKit && (
                <p className="mt-4 border-t border-line pt-4 text-sm">
                  <a
                    href={`/u/${profile.slug}/media-kit`}
                    className="inline-flex items-center gap-2 font-semibold text-accent-text hover:underline"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {t('mediaKitLink')} → /u/{profile.slug}/media-kit
                  </a>
                </p>
              )}
            </section>

            {/* Съкратени линкове с брояч на кликове */}
            <section id="short" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('shortLinksSection')}</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {t('shortLinksHint')}
              </p>
              {shortLinks.length > 0 && (
                <ul className="mt-4 space-y-1 text-sm">
                  {shortLinks.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 text-fg-2"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono font-semibold text-accent-text">
                          {shortLinkBase.replace(/^https?:\/\//, '')}/s/
                          {link.code}
                        </span>{' '}
                        → {link.targetUrl}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-xs">
                          {link.clicks} {t('shortLinkClicks')}
                        </span>
                        <form action={deleteShortLinkAction}>
                          <input
                            type="hidden"
                            name="uiLocale"
                            value={locale}
                          />
                          <input
                            type="hidden"
                            name="shortLinkId"
                            value={link.id}
                          />
                          <button
                            type="submit"
                            className="text-xs font-medium text-danger-text hover:underline"
                          >
                            {t('delete')}
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form
                action={addShortLinkAction}
                className="mt-4 grid items-end gap-2 sm:grid-cols-[1fr_10rem_auto]"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <label className="block text-xs font-medium text-fg-muted">
                  {t('shortTarget')}
                  <input
                    type="url"
                    name="targetUrl"
                    required
                    placeholder="https://…"
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-fg-muted">
                  {t('shortCode')}
                  <input
                    type="text"
                    name="code"
                    placeholder={t('shortCodeAuto')}
                    className="mt-1 w-full rounded-control border border-line-input px-3 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                >
                  {t('addShortLink')}
                </button>
              </form>
            </section>

            <section id="stats" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-subheading text-fg">{t('statsSection')}</h2>
                <Link
                  href={`/${locale}/dashboard/analytics?p=${profile.id}`}
                  className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                >
                  <ChartColumnIcon className="h-4 w-4" />
                  {t('analyticsLink')}
                </Link>
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                {plan.analyticsDays
                  ? t('statsWindow', { days: plan.analyticsDays })
                  : t('statsWindowAll')}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-card bg-surface-2 p-4 text-center">
                  <p className="text-3xl font-extrabold text-accent-text">
                    {views}
                  </p>
                  <p className="text-sm text-fg-muted">{t('statsViews')}</p>
                </div>
                <div className="rounded-card bg-surface-2 p-4 text-center">
                  <p className="text-3xl font-extrabold text-accent-text">
                    {clicks}
                  </p>
                  <p className="text-sm text-fg-muted">{t('statsClicks')}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg-2">
                    {t('statsByLink')}
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {byLink.map((row) => (
                      <li
                        key={row.linkId ?? '-'}
                        className="flex justify-between gap-2"
                      >
                        <span className="truncate">{linkTitle(row.linkId)}</span>
                        <span className="font-semibold">
                          {row._count._all}
                        </span>
                      </li>
                    ))}
                    {byLink.length === 0 && (
                      <li className="text-fg-muted">—</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-fg-2">
                    {t('statsByLocale')}
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {byLocale.map((row) => (
                      <li
                        key={row.locale ?? '-'}
                        className="flex justify-between gap-2"
                      >
                        <span className="uppercase">{row.locale}</span>
                        <span className="font-semibold">
                          {row._count._all}
                        </span>
                      </li>
                    ))}
                    {byLocale.length === 0 && (
                      <li className="text-fg-muted">—</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-fg-2">
                    {t('statsByCountry')}
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {byCountry.map((row) => (
                      <li
                        key={row.country ?? '-'}
                        className="flex justify-between gap-2"
                      >
                        <span>{row.country}</span>
                        <span className="font-semibold">
                          {row._count._all}
                        </span>
                      </li>
                    ))}
                    {byCountry.length === 0 && (
                      <li className="text-fg-muted">—</li>
                    )}
                  </ul>
                </div>
              </div>
            </section>

            {/* Езикова дупка — уникалната ни функция: аудиторията по език
                срещу наличните преводи, с подкана за AI превод. */}
            <section id="gap" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-accent-text" />
                <h2 className="text-subheading text-fg">{t('gapSection')}</h2>
              </div>
              <p className="mt-1 text-sm text-fg-muted">{t('gapHint')}</p>
              {/* Седмичният отчет по имейл — отказ с 1 клик и тук, и от имейла */}
              <form
                action={setDigestAction}
                className="mt-3 flex flex-wrap items-center gap-3 rounded-card bg-surface-2 px-4 py-3"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <label className="flex flex-1 items-center gap-2 text-sm text-fg-2">
                  <input
                    type="checkbox"
                    name="digest"
                    defaultChecked={!user.digestOptOut}
                  />
                  {t('digestToggle')}
                </label>
                <button
                  type="submit"
                  className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                >
                  {t('save')}
                </button>
              </form>
              {!gap || gap.mappedVisitors === 0 ? (
                <p className="mt-4 text-sm text-fg-muted">{t('gapNoData')}</p>
              ) : (
                <>
                  <ul className="mt-4 space-y-2">
                    {gap.demand.map((row) => (
                      <li
                        key={row.locale}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span className="w-28 shrink-0 font-medium">
                          {row.name}
                        </span>
                        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className={`absolute inset-y-0 start-0 rounded-full ${
                              row.hasTranslation
                                ? 'bg-success'
                                : 'bg-accent'
                            }`}
                            style={{ width: `${row.percent}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-end font-semibold text-fg-2">
                          {row.percent}%
                        </span>
                        {row.hasTranslation ? (
                          <span className="inline-flex w-24 shrink-0 items-center gap-1 text-xs font-medium text-success-text">
                            <CheckIcon className="h-3.5 w-3.5" />
                            {t('gapHave')}
                          </span>
                        ) : (
                          <span className="w-24 shrink-0 text-xs font-semibold text-accent-text">
                            {t('gapMissing')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {gap.missing.length > 0 ? (
                    <div className="mt-5 rounded-card border border-accent/30 bg-accent-soft p-4">
                      <p className="text-sm font-medium text-fg-2">
                        {t('gapMissingIntro', {
                          languages: gap.missing
                            .slice(0, 3)
                            .map((item) => item.name)
                            .join(', '),
                        })}
                      </p>
                      <form action={aiTranslateAction} className="mt-3">
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input
                          type="hidden"
                          name="profileId"
                          value={profile.id}
                        />
                        <button
                          type="submit"
                          className={buttonStyles()}
                        >
                          <SparklesIcon className="h-4 w-4" />
                          {t('gapTranslateCta')}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <p className="mt-5 inline-flex items-center gap-1.5 rounded-card bg-success-soft px-4 py-3 text-sm font-medium text-success-text">
                      <CheckIcon className="h-4 w-4" />
                      {t('gapAllCovered')}
                    </p>
                  )}
                </>
              )}
            </section>

            <section id="messages" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('messagesSection')}</h2>
              {messages.length === 0 ? (
                <p className="mt-2 text-sm text-fg-muted">{t('noMessages')}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className="rounded-card border border-line p-3 text-sm"
                    >
                      <p className="text-fg-2">{message.message}</p>
                      <p className="mt-1 text-xs text-fg-muted">
                        {[message.name, message.email]
                          .filter(Boolean)
                          .join(' · ')}{' '}
                        · {message.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Заявки за час (BOOKING блок) */}
            <section id="bookings" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('bookingsSection')}</h2>
              {bookings.length === 0 ? (
                <p className="mt-2 text-sm text-fg-muted">{t('noBookings')}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {bookings.map((booking) => (
                    <li
                      key={booking.id}
                      className={`rounded-card border p-3 text-sm ${
                        booking.status === 'done'
                          ? 'border-line opacity-60'
                          : 'border-line'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-fg-2">
                            {[booking.name, booking.email]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          {booking.preferredAt && (
                            <p className="text-xs text-accent-text">
                              {booking.preferredAt.replace('T', ' ')}
                            </p>
                          )}
                          {booking.message && (
                            <p className="mt-1 text-fg-2">
                              {booking.message}
                            </p>
                          )}
                        </div>
                        {booking.status !== 'done' && (
                          <form action={resolveBookingAction}>
                            <input
                              type="hidden"
                              name="uiLocale"
                              value={locale}
                            />
                            <input
                              type="hidden"
                              name="bookingId"
                              value={booking.id}
                            />
                            <button
                              type="submit"
                              className="shrink-0 text-xs font-medium text-success-text hover:underline"
                            >
                              {t('bookingResolve')}
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Аудитория — бюлетин (email capture), износ и разпращане */}
            <section id="audience" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('audienceSection')}</h2>
              <p className="mt-1 text-sm text-fg-muted">{t('audienceHint')}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="rounded-card bg-surface-2 px-5 py-3 text-center">
                  <p className="text-2xl font-extrabold text-accent-text">
                    {subConfirmed}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {t('audienceConfirmed')}
                  </p>
                </div>
                <div className="rounded-card bg-surface-2 px-5 py-3 text-center">
                  <p className="text-2xl font-extrabold text-fg-muted">
                    {subPending}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {t('audiencePending')}
                  </p>
                </div>
                <a
                  href={`/${locale}/dashboard/subscribers/export?p=${profile.id}`}
                  className={buttonStyles({ variant: 'secondary' })}
                >
                  <DownloadIcon className="h-4 w-4" />
                  {t('audienceExport')}
                </a>
              </div>
              {/* Разпращане на бюлетин до потвърдените абонати */}
              <form
                action={sendBroadcastAction}
                className="mt-5 space-y-2 border-t border-line pt-5"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <h3 className="text-sm font-semibold text-fg-2">
                  {t('broadcastTitle')}
                </h3>
                <input
                  type="text"
                  name="subject"
                  required
                  maxLength={150}
                  placeholder={t('broadcastSubject')}
                  className="w-full rounded-control border border-line-input px-3 py-2 text-sm"
                />
                <textarea
                  name="body"
                  required
                  rows={5}
                  maxLength={5000}
                  placeholder={t('broadcastBody')}
                  className="w-full rounded-control border border-line-input px-3 py-2 text-sm"
                />
                <p className="text-xs text-fg-muted">{t('broadcastHint')}</p>
                <button
                  type="submit"
                  disabled={subConfirmed === 0}
                  className={buttonStyles({ className: 'disabled:opacity-40' })}
                >
                  {t('broadcastSend')}
                </button>
              </form>
            </section>

            <section id="shop" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('shopSection')}</h2>
              {/* Решение О-1: продажбите НЕ минават през Linketto — продуктът е
                  витрина с линк към собственото плащане на създателя. */}
              <p className="mt-1 text-sm text-fg-muted">{t('shopExternalNote')}</p>
              {/* Дир. 2011/83 чл. 6а: деклариран статут на продавача */}
              <form action={setTraderStatusAction} className="mt-3">
                <input type="hidden" name="uiLocale" value={locale} />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="isTrader"
                    defaultChecked={user.isTrader}
                    className="mt-0.5 h-4 w-4"
                  />
                  {t('traderLabel')}
                </label>
                <button
                  type="submit"
                  className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-2' })}
                >
                  {t('save')}
                </button>
              </form>
              <div className="mt-4 space-y-4">
                {products.map((product) => (
                  <div key={product.id} className="rounded-card border border-line p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm text-fg-muted">
                        <span className="me-2 font-semibold text-fg-2">
                          €{(product.priceCents / 100).toFixed(2)}
                        </span>
                        {product.active ? '' : `(${t('productInactive')}) `}
                        {product.externalUrl ? (
                          <span className="me-2 text-xs font-semibold text-accent-text">
                            {t('productClicks', { count: productClicksOf(product.id) })}
                          </span>
                        ) : null}
                        {product.externalUrl ?? t('productNoPayUrl')}
                      </p>
                      <form action={deleteProductAction}>
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="productId" value={product.id} />
                        <button type="submit" className="text-sm text-danger-text hover:underline">
                          {t('delete')}
                        </button>
                      </form>
                    </div>
                    {/* Редакция на цена, линк за плащане и активност */}
                    <form
                      action={updateProductAction}
                      className="mt-3 grid items-end gap-2 sm:grid-cols-[8rem_1fr_auto_auto]"
                    >
                      <input type="hidden" name="uiLocale" value={locale} />
                      <input type="hidden" name="productId" value={product.id} />
                      <label className="block text-xs font-medium text-fg-muted">
                        {t('productPrice')}
                        <input
                          type="number"
                          name="priceEur"
                          required
                          min="0"
                          step="0.01"
                          defaultValue={(product.priceCents / 100).toFixed(2)}
                          className="mt-1 w-full rounded-control border border-line-input px-3 py-1.5 text-sm"
                        />
                      </label>
                      <label className="block text-xs font-medium text-fg-muted">
                        {t('productPayUrl')}
                        <input
                          type="url"
                          name="externalUrl"
                          required
                          pattern="https://.*"
                          defaultValue={product.externalUrl ?? ''}
                          className="mt-1 w-full rounded-control border border-line-input px-3 py-1.5 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={product.active}
                          className="h-3.5 w-3.5"
                        />
                        {t('productActive')}
                      </label>
                      <button
                        type="submit"
                        className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                      >
                        {t('save')}
                      </button>
                    </form>
                    <div className="mt-3 space-y-2">
                      {profile.translations.map((translation) => {
                        const productTr = product.translations.find(
                          (item) => item.locale === translation.locale,
                        );
                        return (
                          <form
                            key={translation.locale}
                            action={upsertProductTranslationAction}
                            className="flex items-start gap-2"
                          >
                            <input type="hidden" name="uiLocale" value={locale} />
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="locale" value={translation.locale} />
                            <span className="mt-2 w-8 text-xs font-semibold uppercase text-fg-muted">
                              {translation.locale}
                            </span>
                            <div className="flex-1 space-y-1">
                              <input
                                type="text"
                                name="title"
                                defaultValue={productTr?.title ?? ''}
                                placeholder={t('productTitle')}
                                className="w-full rounded-control border border-line-input px-3 py-1.5 text-sm"
                              />
                              <textarea
                                name="description"
                                rows={2}
                                defaultValue={productTr?.description ?? ''}
                                placeholder={t('productDescription')}
                                className="w-full rounded-control border border-line-input px-3 py-1.5 text-sm"
                              />
                            </div>
                            <button
                              type="submit"
                              className="mt-2 text-sm font-medium text-accent-text hover:underline"
                            >
                              {t('save')}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <form action={addProductAction} className="mt-6 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <input
                  type="text"
                  name="title"
                  required
                  placeholder={t('productTitle')}
                  className="rounded-control border border-line-input px-3 py-2"
                />
                <input
                  type="number"
                  name="priceEur"
                  required
                  min="0"
                  step="0.01"
                  placeholder="9.99"
                  aria-label={t('productPrice')}
                  className="rounded-control border border-line-input px-3 py-2"
                />
                <input
                  type="url"
                  name="externalUrl"
                  required
                  pattern="https://.*"
                  placeholder={t('productPayUrlPlaceholder')}
                  aria-label={t('productPayUrl')}
                  className="rounded-control border border-line-input px-3 py-2 sm:col-span-2"
                />
                <button
                  type="submit"
                  className={buttonStyles({ className: 'sm:col-span-2 sm:justify-self-start' })}
                >
                  {t('addProduct')}
                </button>
              </form>
            </section>

            <section id="referral" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('referralSection')}</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {t('referralReward', {
                  percent: REFERRAL_PERCENT,
                  minPayout: REFERRAL_MIN_PAYOUT_CENTS / 100,
                })}
              </p>
              {referralUrl ? (
                <div className="mt-4">
                  <ReferralCard
                    url={referralUrl}
                    stats={{
                      signups: referredSignups,
                      successful: successfulReferrals,
                      credit: `€${(user.referralCreditCents / 100).toFixed(2)}`,
                    }}
                    payout={{
                      progressPercent: payoutProgressPercent(
                        user.referralCreditCents,
                      ),
                      progressLabel: canWithdraw(user.referralCreditCents)
                        ? t('referralPayoutReady')
                        : t('referralPayoutProgress', {
                            remaining: `€${((REFERRAL_MIN_PAYOUT_CENTS - user.referralCreditCents) / 100).toFixed(2)}`,
                          }),
                    }}
                    labels={{
                      hint: t('referralHint'),
                      copy: t('referralCopy'),
                      copied: t('referralCopied'),
                      share: t('referralShare'),
                      signups: t('referralSignups'),
                      successful: t('referralSuccessful'),
                      credit: t('referralCredit'),
                    }}
                  />
                  {heldCents > 0 && nextRelease && (
                    <p className="mt-2 text-xs text-fg-muted">
                      {t('referralHeld', {
                        held: `€${(heldCents / 100).toFixed(2)}`,
                        date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(nextRelease),
                      })}
                    </p>
                  )}
                  {/* Теглене при достигнат праг */}
                  {canWithdraw(user.referralCreditCents) && (
                    <form
                      action={requestPayoutAction}
                      className="mt-4 flex flex-wrap items-end gap-3 rounded-card border border-success/30 bg-success-soft p-4"
                    >
                      <input type="hidden" name="uiLocale" value={locale} />
                      <label className="flex-1 text-sm font-medium">
                        {t('referralPayoutMethod')}
                        <input
                          type="text"
                          name="method"
                          required
                          placeholder={t('referralPayoutMethodPlaceholder')}
                          className="mt-1 w-full rounded-control border border-line-input px-3 py-2"
                        />
                      </label>
                      <button
                        type="submit"
                        className={buttonStyles()}
                      >
                        {t('referralWithdraw')}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <form action={ensureReferralCodeAction} className="mt-4">
                  <input type="hidden" name="uiLocale" value={locale} />
                  <button
                    type="submit"
                    className={buttonStyles()}
                  >
                    {t('referralActivate')}
                  </button>
                </form>
              )}
            </section>

            <section id="plan" className="dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6">
              <h2 className="text-subheading text-fg">{t('planSection')}</h2>
              <p className="mt-2 text-sm text-fg-2">
                {t('currentPlan')}:{' '}
                <Badge tone={plan.id === 'FREE' ? 'neutral' : 'accent'} dot>
                  {plan.id}
                </Badge>
                {plan.id === 'FOUNDER'
                  ? ` · ${t('planForever')}`
                  : user.planExpiresAt && plan.id !== 'FREE'
                    ? ` · ${t('planPaidUntil', {
                        date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
                          user.planExpiresAt,
                        ),
                      })}`
                    : ''}
              </p>
              {(withdrawable.length > 0 || withdrawalsRequested.length > 0) && (
                <div className="mt-4 space-y-2 rounded-card border border-line bg-surface-2 p-4 text-sm">
                  {withdrawable.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-fg-2">
                        Linketto {o.plan} · €{(o.amountCents / 100).toFixed(2)} ·{' '}
                        {t('withdrawPaidOn', {
                          date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
                            o.completedAt as Date,
                          ),
                        })}
                      </span>
                      <a
                        href={`/${locale}/dashboard/withdraw?order=${o.id}`}
                        className="rounded-full border border-danger px-4 py-1.5 text-sm font-semibold text-danger-text hover:bg-danger-soft"
                      >
                        {t('withdrawTitle')}
                      </a>
                    </div>
                  ))}
                  {withdrawalsRequested.map((o) => (
                    <p key={o.id} className="text-fg-2">
                      {t('withdrawReceived', {
                        date: new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'UTC',
                        }).format(o.withdrawalRequestedAt as Date),
                      })}
                    </p>
                  ))}
                </div>
              )}
              {/* Предплатени периоди (решение О-2): еднократно плащане, без
                  абонамент и без автоматично таксуване; напомняне по имейл 7 дни
                  и 1 ден преди края. Същият план = удължаване от края; по-висок
                  план = оставащите дни се прехвърлят пропорционално по цена. */}
              {!(upgraded && plan.id === 'FREE') && plan.id !== 'FOUNDER' && (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-fg-muted">{t('prepaidNote')}</p>
                  {/* Преддоговорна информация (чл. 6(1)(е),(h) Дир. 2011/83): крайна
                      цена с ДДС, незабавен старт, 14 дни отказ с пълно връщане. */}
                  <p className="text-sm text-fg-2">
                    {t.rich('precontractNote', {
                      terms: (chunks) => (
                        <a href={`/${locale}/terms`} className="font-medium text-accent-text underline">
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>
                  {(
                    [
                      ['PRO', plan.id === 'PRO' ? t('renewPro') : t('upgradePro')],
                      ['BUSINESS', plan.id === 'BUSINESS' ? t('renewBusiness') : t('upgradeBusiness')],
                    ] as const
                  )
                    .filter(
                      ([planId]) =>
                        checkPurchase({
                          plan: plan.id,
                          expiresAt: user.planExpiresAt,
                          want: planId,
                          now: new Date(),
                        }) === 'ok',
                    )
                    .map(([planId, label]) => (
                      <form
                        key={planId}
                        action={startCheckoutAction}
                        className="flex flex-wrap items-end gap-3 rounded-card border border-line p-4"
                      >
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="plan" value={planId} />
                        <span className="font-semibold text-fg-2">{label}</span>
                        <label className="text-sm">
                          <span className="mb-1 block text-xs text-fg-muted">{t('billingPeriod')}</span>
                          <select
                            name="interval"
                            defaultValue="monthly"
                            className="rounded-control border border-line-input px-3 py-2"
                          >
                            {BILLING_INTERVALS.map((interval) => {
                              const price = intervalPriceCents(planId, interval.id);
                              const monthly = effectiveMonthlyCents(planId, interval.id);
                              return (
                                <option key={interval.id} value={interval.id}>
                                  {t(`interval_${interval.id}`)} — €{(price / 100).toFixed(2)} (€
                                  {(monthly / 100).toFixed(2)}/{t('perMonthShort')}
                                  {interval.discountPercent > 0 ? `, −${interval.discountPercent}%` : ''})
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label className="flex w-full items-start gap-2 text-xs leading-relaxed text-fg-2">
                          <input type="checkbox" name="immediateStart" value="1" required className="mt-0.5 shrink-0" />
                          <span>{t('immediateStartConsent')}</span>
                        </label>
                        <button
                          type="submit"
                          className={buttonStyles()}
                        >
                          {t('toPayment')}
                        </button>
                        {planId !== plan.id && plan.id !== 'FREE' && (
                          <p className="w-full text-xs text-fg-muted">{t('upgradeCarryNote')}</p>
                        )}
                      </form>
                    ))}
                  {/* Founder — еднократно, завинаги */}
                  <form
                    action={startCheckoutAction}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-line p-4"
                  >
                    <input type="hidden" name="uiLocale" value={locale} />
                    <input type="hidden" name="plan" value="FOUNDER" />
                    <label className="flex w-full items-start gap-2 text-xs leading-relaxed text-fg-2">
                      <input type="checkbox" name="immediateStart" value="1" required className="mt-0.5 shrink-0" />
                      <span>{t('immediateStartConsent')}</span>
                    </label>
                    <button
                      type="submit"
                      className={buttonStyles({ variant: 'secondary' })}
                    >
                      {t('buyFounder', { price: `€${(PLANS.FOUNDER.priceCents / 100).toFixed(0)}` })}
                    </button>
                  </form>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashShell>
  );
}
