import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { planFor } from '@/lib/plans';
import {
  addLinkAction,
  createProfileAction,
  deleteLinkAction,
  updateProfileAction,
  updateStyleAction,
  uploadImageAction,
  upsertLinkTranslationAction,
  upsertProfileTranslationAction,
} from '@/app/actions/profile';
import { parseStyle } from '@/lib/style';
import {
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  SparklesIcon,
} from '@/components/icons';
import { startCheckoutAction } from '@/app/actions/billing';
import { aiTranslateAction } from '@/app/actions/ai';
import {
  addProductAction,
  connectStripeAction,
  deleteProductAction,
  upsertProductTranslationAction,
} from '@/app/actions/shop';

export const dynamic = 'force-dynamic';

const THEMES = ['aurora', 'mono', 'dusk'] as const;

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    translated?: string;
    connected?: string;
  }>;
}) {
  const { locale } = await params;
  const { error, translated, connected } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const t = await getTranslations('dashboard');

  const profile = await prisma.profile.findFirst({
    where: { userId: user.id },
    include: {
      translations: { orderBy: { locale: 'asc' } },
      links: {
        orderBy: { position: 'asc' },
        include: { translations: true },
      },
    },
  });
  const plan = planFor(user.plan);
  const messages = profile
    ? await prisma.contactMessage.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : [];

  // Статистика — прозорецът зависи от плана (Free: 90 дни).
  const since = plan.analyticsDays
    ? new Date(Date.now() - plan.analyticsDays * 24 * 60 * 60 * 1000)
    : undefined;
  const clickWhere = profile
    ? { profileId: profile.id, ...(since ? { createdAt: { gte: since } } : {}) }
    : null;
  const [views, clicks, byLink, byLocale, byCountry] = clickWhere
    ? await Promise.all([
        prisma.clickEvent.count({ where: { ...clickWhere, linkId: null } }),
        prisma.clickEvent.count({
          where: { ...clickWhere, linkId: { not: null } },
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
      ])
    : [0, 0, [], [], []];
  const products = profile
    ? await prisma.product.findMany({
        where: { profileId: profile.id },
        orderBy: { position: 'asc' },
        include: { translations: true },
      })
    : [];
  const purchaseTotals = profile
    ? await prisma.purchase.aggregate({
        where: { profileId: profile.id },
        _count: { _all: true },
        _sum: { amountCents: true },
      })
    : null;
  const recentPurchases = profile
    ? await prisma.purchase.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { product: { include: { translations: true } } },
      })
    : [];

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

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error === 'slug'
              ? t('errorSlugTaken')
              : error === 'limit'
                ? t('errorLimit')
                : error === 'block'
                  ? t('errorBlock')
                  : error === 'domain'
                    ? t('errorDomain')
                    : error === 'ai'
                      ? t('errorAi')
                      : error === 'aikey'
                        ? t('errorAiKey')
                        : error === 'product'
                          ? t('errorProduct')
                          : error === 'style'
                            ? t('errorStyle')
                            : error === 'upload'
                              ? t('errorUpload')
                              : t('errorGeneric')}
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
        {connected && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {t('connectedOk')}
          </p>
        )}

        {!profile ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="font-medium">{t('noProfile')}</p>
            <form action={createProfileAction} className="mt-4 flex gap-3">
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
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{t('profileSection')}</h2>
                <a
                  href={`/u/${profile.slug}`}
                  className="text-sm font-medium text-linketto-700 hover:underline"
                >
                  {t('viewPublic')} → /u/{profile.slug}
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
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('styleSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('styleHint')}</p>
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

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">{t('translationsSection')}</h2>
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
              <div className="mt-4 space-y-4">
                {LOCALES.map((loc) => {
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
                      <input type="hidden" name="profileId" value={profile.id} />
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
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('linksSection')}</h2>
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
                          className="text-sm text-red-600 hover:underline"
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
                            <span className="w-8 text-xs font-semibold uppercase text-slate-400">
                              {translation.locale}
                            </span>
                            <input
                              type="text"
                              name="title"
                              defaultValue={linkTitle?.title ?? ''}
                              placeholder={t('linkTitle')}
                              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                            />
                            <button
                              type="submit"
                              className="text-sm font-medium text-linketto-700 hover:underline"
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

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('qrSection')}</h2>
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
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('statsSection')}</h2>
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
                      <li className="text-slate-400">—</li>
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
                      <li className="text-slate-400">—</li>
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
                      <li className="text-slate-400">—</li>
                    )}
                  </ul>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('messagesSection')}</h2>
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
                      <p className="mt-1 text-xs text-slate-400">
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

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('shopSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t('feeNote', { fee: plan.feePercent })}
              </p>
              {!user.stripeAccountId || !user.stripeChargesEnabled ? (
                <form action={connectStripeAction} className="mt-4">
                  <input type="hidden" name="uiLocale" value={locale} />
                  {user.stripeAccountId && (
                    <p className="mb-2 text-sm text-amber-600">
                      {t('stripePending')}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700"
                  >
                    {t('connectStripe')}
                  </button>
                </form>
              ) : (
                <>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-green-700">
                    <CheckIcon className="h-4 w-4" />
                    {t('stripeConnected')}
                  </p>
                  <div className="mt-4 space-y-4">
                    {products.map((product) => (
                      <div
                        key={product.id}
                        className="rounded-xl border border-slate-100 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm text-slate-500">
                            <span className="mr-2 font-semibold text-slate-700">
                              €{(product.priceCents / 100).toFixed(2)}
                            </span>
                            {product.deliveryUrl}
                          </p>
                          <form action={deleteProductAction}>
                            <input
                              type="hidden"
                              name="uiLocale"
                              value={locale}
                            />
                            <input
                              type="hidden"
                              name="productId"
                              value={product.id}
                            />
                            <button
                              type="submit"
                              className="text-sm text-red-600 hover:underline"
                            >
                              {t('delete')}
                            </button>
                          </form>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {profile.translations.map((translation) => {
                            const productTitle = product.translations.find(
                              (item) => item.locale === translation.locale,
                            );
                            return (
                              <form
                                key={translation.locale}
                                action={upsertProductTranslationAction}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="hidden"
                                  name="uiLocale"
                                  value={locale}
                                />
                                <input
                                  type="hidden"
                                  name="productId"
                                  value={product.id}
                                />
                                <input
                                  type="hidden"
                                  name="locale"
                                  value={translation.locale}
                                />
                                <span className="w-8 text-xs font-semibold uppercase text-slate-400">
                                  {translation.locale}
                                </span>
                                <input
                                  type="text"
                                  name="title"
                                  defaultValue={productTitle?.title ?? ''}
                                  placeholder={t('productTitle')}
                                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                                />
                                <button
                                  type="submit"
                                  className="text-sm font-medium text-linketto-700 hover:underline"
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
                    action={addProductAction}
                    className="mt-6 grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto]"
                  >
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
                      min="3"
                      step="0.01"
                      placeholder="9.99"
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <input
                      type="url"
                      name="deliveryUrl"
                      required
                      placeholder={t('deliveryUrl')}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700"
                    >
                      {t('addProduct')}
                    </button>
                  </form>

                  <h3 className="mt-8 text-sm font-semibold text-slate-600">
                    {t('purchasesSection')}
                  </h3>
                  {purchaseTotals && purchaseTotals._count._all > 0 ? (
                    <>
                      <p className="mt-1 text-sm text-slate-600">
                        {purchaseTotals._count._all} · {t('revenue')}: €
                        {((purchaseTotals._sum.amountCents ?? 0) / 100).toFixed(
                          2,
                        )}
                      </p>
                      <ul className="mt-3 space-y-1 text-sm">
                        {recentPurchases.map((purchase) => (
                          <li
                            key={purchase.id}
                            className="flex justify-between gap-2 text-slate-600"
                          >
                            <span className="truncate">
                              {purchase.product.translations[0]?.title ?? '—'}
                              {purchase.buyerEmail
                                ? ` · ${purchase.buyerEmail}`
                                : ''}
                            </span>
                            <span className="font-semibold">
                              €{(purchase.amountCents / 100).toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">
                      {t('noPurchases')}
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('planSection')}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {t('currentPlan')}: <strong>{plan.id}</strong>
              </p>
              {plan.id === 'FREE' && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {(
                    [
                      ['PRO', t('upgradePro')],
                      ['BUSINESS', t('upgradeBusiness')],
                      ['FOUNDER', t('buyFounder')],
                    ] as const
                  ).map(([planId, label]) => (
                    <form key={planId} action={startCheckoutAction}>
                      <input type="hidden" name="uiLocale" value={locale} />
                      <input type="hidden" name="plan" value={planId} />
                      <button
                        type="submit"
                        className="rounded-full border border-linketto-600 px-4 py-2 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
                      >
                        {label}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
