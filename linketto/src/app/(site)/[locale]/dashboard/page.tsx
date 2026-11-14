import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
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
  updateProfileAction,
  updateStyleAction,
  verifyDomainAction,
  applyTemplateAction,
  uploadImageAction,
  upsertLinkTranslationAction,
  upsertProfileTranslationAction,
} from '@/app/actions/profile';
import { backgroundCss, buttonCss, parseStyle } from '@/lib/style';
import { profileUrl } from '@/lib/profile-url';
import { NICHE_TEMPLATES, TEMPLATE_IDS } from '@/lib/templates';
import { languageDemand } from '@/lib/language-gap';
import { ReferralCard } from '@/components/ReferralCard';
import { TimeZoneField } from '@/components/TimeZoneField';
import {
  ensureReferralCodeAction,
  requestPayoutAction,
} from '@/app/actions/referral';
import {
  canWithdraw,
  payoutProgressPercent,
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

const THEMES = ['aurora', 'mono', 'dusk'] as const;

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
  shortlink: 'errorShortlink',
  profiles: 'errorProfiles',
  payments: 'errorPayments',
  withdraw: 'errorWithdraw',
  domainVerify: 'errorDomainVerify',
  plan: 'errorPlan',
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
            orderBy: { position: 'asc' },
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
  const [referredSignups, successfulReferrals] = await Promise.all([
    prisma.user.count({ where: { referredById: user.id } }),
    prisma.referral.count({ where: { referrerId: user.id } }),
  ]);
  // Функцията за отказ (чл. 11а Дир. 2011/83): платените поръчки от последните
  // 15 дни — допустимите показват „Откажи се от договора тук“, а подадените —
  // кога е получено изявлението.
  const recentPaidOrders = await prisma.planOrder.findMany({
    where: {
      userId: user.id,
      applied: true,
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

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="dash mx-auto max-w-3xl space-y-10 px-6 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          {t('title')}
        </h1>
        {profile && (
          <nav
            aria-label={t('title')}
            className="dash-nav sticky top-[4.1rem] z-30 -mx-6 !mt-4 overflow-x-auto bg-slate-50/95 px-6 py-2.5 backdrop-blur-md lg:-mx-20 lg:px-0"
          >
            <ul className="mx-auto flex w-max gap-2">
              {(
                [
                  ['profile', t('profileSection')],
                  ['style', t('styleSection')],
                  ['languages', t('translationsSection')],
                  ['links', t('linksSection')],
                  ['stats', t('statsSection')],
                  ['shop', t('shopSection')],
                  ['referral', t('referralSection')],
                  ['plan', t('planSection')],
                ] as const
              ).map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="block whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 shadow-sm transition hover:border-linketto-500 hover:text-linketto-700"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {t(Object.hasOwn(DASHBOARD_ERRORS, error) ? DASHBOARD_ERRORS[error] : 'errorGeneric')}
          </p>
        )}
        {domainVerified && (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {t('domainVerifiedOk')}
          </p>
        )}
        {withdrawn && (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {t('withdrawDone')}
          </p>
        )}
        {upgraded && plan.id === 'FREE' && (
          <p
            role="status"
            className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800"
          >
            {t('upgradedProcessing')}
          </p>
        )}
        {translated && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {t('translatedOk')}
          </p>
        )}
        {generated && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {t('generatedOk')}
          </p>
        )}
        {payout && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {t('referralPayoutRequested')}
          </p>
        )}
        {broadcast && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {t('broadcastSent', { count: broadcast })}
          </p>
        )}
        {imported && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {t('importedOk', { count: Number(imported) || 0 })}{' '}
            <a href="#languages" className="font-semibold underline">
              {t('importedTranslate')}
            </a>
          </p>
        )}

        {/* Превключвател на профили + добавяне (няколко профила = Business) */}
        {profileList.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">
                {t('profilesLabel')}:
              </span>
              {profileList.map((item) => (
                <a
                  key={item.id}
                  href={`/${locale}/dashboard?p=${item.id}`}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    item.id === activeId
                      ? 'bg-linketto-600 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  /{item.slug}
                </a>
              ))}
            </div>
            {canAddProfile ? (
              <form
                action={createProfileAction}
                className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input
                  type="text"
                  name="slug"
                  required
                  placeholder={t('newProfileSlug')}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-full border border-linketto-600 px-4 py-1.5 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                >
                  {t('addProfile')}
                </button>
              </form>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {t('profilesUpsell', { max: plan.maxProfiles })}
              </p>
            )}
          </section>
        )}

        {!profile ? (
          <section className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <p className="font-medium">{t('noProfile')}</p>
            <form action={createProfileAction} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="uiLocale" value={locale} />
              <input
                type="text"
                name="slug"
                required
                placeholder="maria"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                type="text"
                name="displayName"
                placeholder={t('displayName')}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
              />
              <select
                name="template"
                defaultValue=""
                aria-label={t('templatesTitle')}
                className="rounded-lg border border-slate-300 px-3 py-2"
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
                className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700"
              >
                {t('createProfile')}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section id="profile" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('profileSection')}</h2>
                <a
                  href={profileUrl(profile.slug)}
                  className="text-sm font-medium text-linketto-700 hover:underline"
                >
                  {t('viewPublic')} →{' '}
                  {profileUrl(profile.slug).replace(/^https?:\/\//, '')}
                </a>
              </div>
              <form
                action={updateProfileAction}
                className="mt-4 grid gap-4 sm:grid-cols-2"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <label className="block text-sm font-medium">
                  {t('theme')}
                  <select
                    name="theme"
                    defaultValue={profile.theme}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {THEMES.map((theme) => (
                      <option key={theme} value={theme}>
                        {theme}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  {t('defaultLocale')}
                  <select
                    name="defaultLocale"
                    defaultValue={profile.defaultLocale}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('customDomainLabel')}
                  <input
                    type="text"
                    name="customDomain"
                    defaultValue={profile.customDomain ?? ''}
                    placeholder="links.example.com"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
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
                  className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700 sm:col-span-2 sm:justify-self-start"
                >
                  {t('save')}
                </button>
              </form>
              {/* Собствен домейн: TXT проверка на собствеността — публично се
                  показва едва след нея (lib/domain-verify.ts). */}
              {profile.customDomain && profile.domainToken && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  {profile.domainVerifiedAt ? (
                    <p className="inline-flex items-center gap-1.5 font-medium text-green-700">
                      <CheckIcon className="h-4 w-4" />
                      {t('domainVerified', { domain: profile.customDomain })}
                    </p>
                  ) : (
                    <form action={verifyDomainAction} className="space-y-2">
                      <input type="hidden" name="uiLocale" value={locale} />
                      <input type="hidden" name="profileId" value={profile.id} />
                      <p className="font-medium text-amber-700">
                        {t('domainUnverified', { domain: profile.customDomain })}
                      </p>
                      <p className="text-slate-600">{t('domainTxtHint')}</p>
                      <dl className="grid gap-1 font-mono text-xs sm:grid-cols-[5rem_1fr]">
                        <dt className="text-slate-500">TXT</dt>
                        <dd className="break-all text-slate-900">{domainTxtName(profile.customDomain)}</dd>
                        <dt className="text-slate-500">{t('domainTxtValueLabel')}</dt>
                        <dd className="break-all text-slate-900">{domainTxtValue(profile.domainToken)}</dd>
                      </dl>
                      <button
                        type="submit"
                        className="rounded-full border border-linketto-600 px-4 py-1.5 font-semibold text-linketto-700 hover:bg-linketto-50"
                      >
                        {t('domainVerifyButton')}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </section>

            <section id="style" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('styleSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('styleHint')}</p>
              {/* Шаблони по ниша — готов вид за 1 клик (съдържанието се пази) */}
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700">
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
                            className="group w-full rounded-xl border border-slate-200 p-1.5 text-left transition hover:-translate-y-0.5 hover:border-linketto-400 hover:shadow-md"
                          >
                            <span
                              aria-hidden="true"
                              className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg px-3"
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
                            <span className="mt-1.5 block px-1 text-xs font-semibold text-slate-700 group-hover:text-linketto-700">
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
                  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';
                return (
                  <form
                    action={updateStyleAction}
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
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t('styleBgColor2')}
                      <input
                        type="color"
                        name="bgColor2"
                        defaultValue={styleCfg.bgColor2}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300"
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
                      className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700 sm:col-span-3 sm:justify-self-start"
                    >
                      {t('save')}
                    </button>
                  </form>
                );
              })()}
              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
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
                      className="flex-1 text-xs text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-linketto-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-linketto-700 hover:file:bg-linketto-100"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-linketto-600 px-4 py-1.5 font-semibold text-linketto-700 hover:bg-linketto-50"
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
                      className="flex-1 text-xs text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-linketto-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-linketto-700 hover:file:bg-linketto-100"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-linketto-600 px-4 py-1.5 font-semibold text-linketto-700 hover:bg-linketto-50"
                    >
                      {t('uploadButton')}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section id="languages" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('translationsSection')}</h2>
                <form action={aiTranslateAction}>
                  <input type="hidden" name="uiLocale" value={locale} />
                  <input type="hidden" name="profileId" value={profile.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-full bg-linketto-600 px-4 py-2 text-sm font-semibold text-white hover:bg-linketto-700"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {t('aiTranslateButton')}
                  </button>
                </form>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {t('translationsHint')} {t('aiTranslateHint')}
              </p>
              {/* AI генериране на био от ключови думи (на основния език) */}
              <form
                action={aiGenerateBioAction}
                className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-linketto-100 bg-linketto-50/50 p-3"
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
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full border border-linketto-600 px-4 py-2 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
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
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </label>
                        <label className="block text-sm">
                          {t('bio')}
                          <input
                            type="text"
                            name="bio"
                            defaultValue={translation?.bio ?? ''}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </label>
                        <button
                          type="submit"
                          className="rounded-full border border-linketto-600 px-4 py-2 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
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
                        <details className="faq-item rounded-xl border border-dashed border-slate-300 px-4 py-3 open:border-solid open:bg-slate-50/60">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-linketto-700">
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

            <section id="links" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('linksSection')}</h2>
              {/* Пренасяне от Linktree за минута — най-ниската бариера за смяна */}
              <details
                className="group mt-4 rounded-xl border border-dashed border-linketto-300 bg-linketto-50/60 p-4"
                open={profile.links.length === 0}
              >
                <summary className="cursor-pointer text-sm font-semibold text-linketto-800">
                  {t('importTitle')}
                </summary>
                <p className="mt-2 text-sm text-slate-600">{t('importHint')}</p>
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
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="own" required />
                    {t('importOwn')}
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-linketto-600 px-5 py-2 text-sm font-semibold text-white hover:bg-linketto-700"
                  >
                    {t('importCta')}
                  </button>
                </form>
              </details>
              <div className="mt-4 space-y-6">
                {profile.links.map((link) => (
                  <div
                    key={link.id}
                    className="rounded-xl border border-slate-100 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm text-slate-500">
                        <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                          {t(`kind_${link.kind}`)}
                        </span>
                        {(link.showFrom || link.showUntil) && (
                          <span className="mr-2 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                            <ClockIcon className="h-3 w-3" />
                            {t('scheduledBadge')}
                          </span>
                        )}
                        {link.url ?? ''}
                      </p>
                      <form action={deleteLinkAction}>
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="linkId" value={link.id} />
                        <button
                          type="submit"
                          className="shrink-0 text-sm font-medium text-red-700 hover:underline"
                        >
                          {t('delete')}
                        </button>
                      </form>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {profile.translations.map((translation) => {
                        const linkTitle = link.translations.find(
                          (item) => item.locale === translation.locale,
                        );
                        return (
                          <form
                            key={translation.locale}
                            action={upsertLinkTranslationAction}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="uiLocale"
                              value={locale}
                            />
                            <input type="hidden" name="linkId" value={link.id} />
                            <input
                              type="hidden"
                              name="locale"
                              value={translation.locale}
                            />
                            <span className="w-8 text-xs font-semibold uppercase text-slate-500">
                              {translation.locale}
                            </span>
                            <input
                              type="text"
                              name="title"
                              defaultValue={linkTitle?.title ?? ''}
                              placeholder={t('linkTitle')}
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                            />
                            <button
                              type="submit"
                              className="shrink-0 rounded-full border border-linketto-600 px-3 py-1 text-xs font-semibold text-linketto-700 hover:bg-linketto-50"
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
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('urlLabel')}
                  <input
                    type="text"
                    name="url"
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('extra1Label')}
                  <input
                    type="url"
                    name="extra1"
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('extra2Label')}
                  <input
                    type="url"
                    name="extra2"
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('blockColorLabel')}
                  <input
                    type="text"
                    name="color"
                    placeholder="#3b82c4"
                    pattern="#[0-9a-fA-F]{6}"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <TimeZoneField />
                <label className="block text-sm font-medium">
                  {t('scheduleFromLabel')}
                  <input
                    type="datetime-local"
                    name="showFrom"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t('scheduleUntilLabel')}
                  <input
                    type="datetime-local"
                    name="showUntil"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  {t('pollOptionsLabel')}
                  <textarea
                    name="options"
                    rows={3}
                    placeholder={t('pollOptionsPlaceholder')}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    {t('pollOptionsHint')}
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                  <input type="checkbox" name="featured" className="h-4 w-4" />
                  {t('featuredLabel')}
                </label>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  {t('addBlockHint')} {t('scheduleHint')}
                </p>
                <button
                  type="submit"
                  className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700 sm:justify-self-start"
                >
                  {t('addLink')}
                </button>
              </form>
            </section>

            <section id="qr" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('qrSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('qrHint')}</p>
              <div className="mt-4 flex items-center gap-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- динамичен SVG route */}
                <img
                  src={`/u/${profile.slug}/qr`}
                  alt="QR"
                  width={144}
                  height={144}
                  className="h-36 w-36 rounded-xl border border-slate-200 bg-white p-2"
                />
                <a
                  href={`/u/${profile.slug}/qr`}
                  download={`${profile.slug}-qr.svg`}
                  className="inline-flex items-center gap-2 rounded-full border border-linketto-600 px-4 py-2 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                >
                  <DownloadIcon className="h-4 w-4" />
                  SVG
                </a>
              </div>
              {parseStyle(profile.style).mediaKit && (
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm">
                  <a
                    href={`/u/${profile.slug}/media-kit`}
                    className="inline-flex items-center gap-2 font-semibold text-linketto-700 hover:underline"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {t('mediaKitLink')} → /u/{profile.slug}/media-kit
                  </a>
                </p>
              )}
            </section>

            {/* Съкратени линкове с брояч на кликове */}
            <section id="short" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('shortLinksSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t('shortLinksHint')}
              </p>
              {shortLinks.length > 0 && (
                <ul className="mt-4 space-y-1 text-sm">
                  {shortLinks.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 text-slate-600"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono font-semibold text-linketto-700">
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
                            className="text-xs font-medium text-red-600 hover:underline"
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
                <label className="block text-xs font-medium text-slate-500">
                  {t('shortTarget')}
                  <input
                    type="url"
                    name="targetUrl"
                    required
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  {t('shortCode')}
                  <input
                    type="text"
                    name="code"
                    placeholder={t('shortCodeAuto')}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full border border-linketto-600 px-4 py-1.5 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                >
                  {t('addShortLink')}
                </button>
              </form>
            </section>

            <section id="stats" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('statsSection')}</h2>
                <Link
                  href={`/${locale}/dashboard/analytics?p=${profile.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-linketto-600 px-4 py-1.5 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                >
                  <ChartColumnIcon className="h-4 w-4" />
                  {t('analyticsLink')}
                </Link>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {plan.analyticsDays
                  ? t('statsWindow', { days: plan.analyticsDays })
                  : t('statsWindowAll')}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-3xl font-extrabold text-linketto-700">
                    {views}
                  </p>
                  <p className="text-sm text-slate-500">{t('statsViews')}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-3xl font-extrabold text-linketto-700">
                    {clicks}
                  </p>
                  <p className="text-sm text-slate-500">{t('statsClicks')}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-600">
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
                      <li className="text-slate-500">—</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-600">
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
                      <li className="text-slate-500">—</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-600">
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
                      <li className="text-slate-500">—</li>
                    )}
                  </ul>
                </div>
              </div>
            </section>

            {/* Езикова дупка — уникалната ни функция: аудиторията по език
                срещу наличните преводи, с подкана за AI превод. */}
            <section id="gap" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-linketto-600" />
                <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('gapSection')}</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">{t('gapHint')}</p>
              {/* Седмичният отчет по имейл — отказ с 1 клик и тук, и от имейла */}
              <form
                action={setDigestAction}
                className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <label className="flex flex-1 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="digest"
                    defaultChecked={!user.digestOptOut}
                  />
                  {t('digestToggle')}
                </label>
                <button
                  type="submit"
                  className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  {t('save')}
                </button>
              </form>
              {!gap || gap.mappedVisitors === 0 ? (
                <p className="mt-4 text-sm text-slate-500">{t('gapNoData')}</p>
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
                        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={`absolute inset-y-0 left-0 rounded-full ${
                              row.hasTranslation
                                ? 'bg-green-500'
                                : 'bg-linketto-500'
                            }`}
                            style={{ width: `${row.percent}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right font-semibold text-slate-600">
                          {row.percent}%
                        </span>
                        {row.hasTranslation ? (
                          <span className="inline-flex w-24 shrink-0 items-center gap-1 text-xs font-medium text-green-700">
                            <CheckIcon className="h-3.5 w-3.5" />
                            {t('gapHave')}
                          </span>
                        ) : (
                          <span className="w-24 shrink-0 text-xs font-semibold text-linketto-700">
                            {t('gapMissing')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {gap.missing.length > 0 ? (
                    <div className="mt-5 rounded-xl border border-linketto-200 bg-linketto-50/60 p-4">
                      <p className="text-sm font-medium text-slate-700">
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
                          className="inline-flex items-center gap-2 rounded-full bg-linketto-600 px-4 py-2 text-sm font-semibold text-white hover:bg-linketto-700"
                        >
                          <SparklesIcon className="h-4 w-4" />
                          {t('gapTranslateCta')}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <p className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                      <CheckIcon className="h-4 w-4" />
                      {t('gapAllCovered')}
                    </p>
                  )}
                </>
              )}
            </section>

            <section id="messages" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('messagesSection')}</h2>
              {messages.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{t('noMessages')}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className="rounded-xl border border-slate-100 p-3 text-sm"
                    >
                      <p className="text-slate-700">{message.message}</p>
                      <p className="mt-1 text-xs text-slate-500">
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
            <section id="bookings" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('bookingsSection')}</h2>
              {bookings.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{t('noBookings')}</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {bookings.map((booking) => (
                    <li
                      key={booking.id}
                      className={`rounded-xl border p-3 text-sm ${
                        booking.status === 'done'
                          ? 'border-slate-100 opacity-60'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700">
                            {[booking.name, booking.email]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          {booking.preferredAt && (
                            <p className="text-xs text-linketto-700">
                              {booking.preferredAt.replace('T', ' ')}
                            </p>
                          )}
                          {booking.message && (
                            <p className="mt-1 text-slate-600">
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
                              className="shrink-0 text-xs font-medium text-green-700 hover:underline"
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
            <section id="audience" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('audienceSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('audienceHint')}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="rounded-xl bg-slate-50 px-5 py-3 text-center">
                  <p className="text-2xl font-extrabold text-linketto-700">
                    {subConfirmed}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('audienceConfirmed')}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-5 py-3 text-center">
                  <p className="text-2xl font-extrabold text-slate-500">
                    {subPending}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t('audiencePending')}
                  </p>
                </div>
                <a
                  href={`/${locale}/dashboard/subscribers/export?p=${profile.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-linketto-600 px-4 py-2 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                >
                  <DownloadIcon className="h-4 w-4" />
                  {t('audienceExport')}
                </a>
              </div>
              {/* Разпращане на бюлетин до потвърдените абонати */}
              <form
                action={sendBroadcastAction}
                className="mt-5 space-y-2 border-t border-slate-100 pt-5"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <h3 className="text-sm font-semibold text-slate-600">
                  {t('broadcastTitle')}
                </h3>
                <input
                  type="text"
                  name="subject"
                  required
                  maxLength={150}
                  placeholder={t('broadcastSubject')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <textarea
                  name="body"
                  required
                  rows={5}
                  maxLength={5000}
                  placeholder={t('broadcastBody')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-500">{t('broadcastHint')}</p>
                <button
                  type="submit"
                  disabled={subConfirmed === 0}
                  className="rounded-full bg-linketto-600 px-5 py-2 text-sm font-semibold text-white hover:bg-linketto-700 disabled:opacity-40"
                >
                  {t('broadcastSend')}
                </button>
              </form>
            </section>

            <section id="shop" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('shopSection')}</h2>
              {/* Решение О-1: продажбите НЕ минават през Linketto — продуктът е
                  витрина с линк към собственото плащане на създателя. */}
              <p className="mt-1 text-sm text-slate-500">{t('shopExternalNote')}</p>
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
                  className="mt-2 rounded-full border border-linketto-600 px-4 py-1.5 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                >
                  {t('save')}
                </button>
              </form>
              <div className="mt-4 space-y-4">
                {products.map((product) => (
                  <div key={product.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm text-slate-500">
                        <span className="mr-2 font-semibold text-slate-700">
                          €{(product.priceCents / 100).toFixed(2)}
                        </span>
                        {product.active ? '' : `(${t('productInactive')}) `}
                        {product.externalUrl ? (
                          <span className="mr-2 text-xs font-semibold text-linketto-700">
                            {t('productClicks', { count: productClicksOf(product.id) })}
                          </span>
                        ) : null}
                        {product.externalUrl ?? t('productNoPayUrl')}
                      </p>
                      <form action={deleteProductAction}>
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="productId" value={product.id} />
                        <button type="submit" className="text-sm text-red-600 hover:underline">
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
                      <label className="block text-xs font-medium text-slate-500">
                        {t('productPrice')}
                        <input
                          type="number"
                          name="priceEur"
                          required
                          min="0"
                          step="0.01"
                          defaultValue={(product.priceCents / 100).toFixed(2)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-500">
                        {t('productPayUrl')}
                        <input
                          type="url"
                          name="externalUrl"
                          required
                          pattern="https://.*"
                          defaultValue={product.externalUrl ?? ''}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
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
                        className="rounded-full border border-linketto-600 px-4 py-1.5 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
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
                            <span className="mt-2 w-8 text-xs font-semibold uppercase text-slate-500">
                              {translation.locale}
                            </span>
                            <div className="flex-1 space-y-1">
                              <input
                                type="text"
                                name="title"
                                defaultValue={productTr?.title ?? ''}
                                placeholder={t('productTitle')}
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                              />
                              <textarea
                                name="description"
                                rows={2}
                                defaultValue={productTr?.description ?? ''}
                                placeholder={t('productDescription')}
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                              />
                            </div>
                            <button
                              type="submit"
                              className="mt-2 text-sm font-medium text-linketto-700 hover:underline"
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
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  type="number"
                  name="priceEur"
                  required
                  min="0"
                  step="0.01"
                  placeholder="9.99"
                  aria-label={t('productPrice')}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  type="url"
                  name="externalUrl"
                  required
                  pattern="https://.*"
                  placeholder={t('productPayUrlPlaceholder')}
                  aria-label={t('productPayUrl')}
                  className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-2"
                />
                <button
                  type="submit"
                  className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700 sm:col-span-2 sm:justify-self-start"
                >
                  {t('addProduct')}
                </button>
              </form>
            </section>

            <section id="referral" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('referralSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">
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
                  {/* Теглене при достигнат праг */}
                  {canWithdraw(user.referralCreditCents) && (
                    <form
                      action={requestPayoutAction}
                      className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-green-200 bg-green-50/50 p-4"
                    >
                      <input type="hidden" name="uiLocale" value={locale} />
                      <label className="flex-1 text-sm font-medium">
                        {t('referralPayoutMethod')}
                        <input
                          type="text"
                          name="method"
                          required
                          placeholder={t('referralPayoutMethodPlaceholder')}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-full bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700"
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
                    className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700"
                  >
                    {t('referralActivate')}
                  </button>
                </form>
              )}
            </section>

            <section id="plan" className="dash-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('planSection')}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {t('currentPlan')}: <strong>{plan.id}</strong>
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
                <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  {withdrawable.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-slate-700">
                        Linketto {o.plan} · €{(o.amountCents / 100).toFixed(2)} ·{' '}
                        {t('withdrawPaidOn', {
                          date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
                            o.completedAt as Date,
                          ),
                        })}
                      </span>
                      <a
                        href={`/${locale}/dashboard/withdraw?order=${o.id}`}
                        className="rounded-full border border-red-500 px-4 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        {t('withdrawTitle')}
                      </a>
                    </div>
                  ))}
                  {withdrawalsRequested.map((o) => (
                    <p key={o.id} className="text-slate-600">
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
                  <p className="text-sm text-slate-500">{t('prepaidNote')}</p>
                  {/* Преддоговорна информация (чл. 6(1)(е),(h) Дир. 2011/83): крайна
                      цена с ДДС, незабавен старт, 14 дни отказ с пълно връщане. */}
                  <p className="text-sm text-slate-600">
                    {t.rich('precontractNote', {
                      terms: (chunks) => (
                        <a href={`/${locale}/terms`} className="font-medium text-linketto-700 underline">
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
                        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 p-4"
                      >
                        <input type="hidden" name="uiLocale" value={locale} />
                        <input type="hidden" name="plan" value={planId} />
                        <span className="font-semibold text-slate-700">{label}</span>
                        <label className="text-sm">
                          <span className="mb-1 block text-xs text-slate-500">{t('billingPeriod')}</span>
                          <select
                            name="interval"
                            defaultValue="monthly"
                            className="rounded-lg border border-slate-300 px-3 py-2"
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
                        <button
                          type="submit"
                          className="rounded-full bg-linketto-600 px-5 py-2 text-sm font-semibold text-white hover:bg-linketto-700"
                        >
                          {t('toPayment')}
                        </button>
                        {planId !== plan.id && plan.id !== 'FREE' && (
                          <p className="w-full text-xs text-slate-500">{t('upgradeCarryNote')}</p>
                        )}
                      </form>
                    ))}
                  {/* Founder — еднократно, завинаги */}
                  <form
                    action={startCheckoutAction}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-4"
                  >
                    <input type="hidden" name="uiLocale" value={locale} />
                    <input type="hidden" name="plan" value="FOUNDER" />
                    <button
                      type="submit"
                      className="rounded-full border border-linketto-600 px-4 py-2 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                    >
                      {t('buyFounder', { price: `€${(PLANS.FOUNDER.priceCents / 100).toFixed(0)}` })}
                    </button>
                  </form>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
