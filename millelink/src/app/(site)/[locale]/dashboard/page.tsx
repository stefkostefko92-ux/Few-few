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
  upsertLinkTranslationAction,
  upsertProfileTranslationAction,
} from '@/app/actions/profile';
import { startCheckoutAction } from '@/app/actions/billing';

export const dynamic = 'force-dynamic';

const THEMES = ['aurora', 'mono', 'dusk'] as const;

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
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
                : t('errorGeneric')}
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
                className="rounded-full bg-millelink-600 px-5 py-2 font-semibold text-white hover:bg-millelink-700"
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
                  className="text-sm font-medium text-millelink-700 hover:underline"
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
                  className="rounded-full bg-millelink-600 px-5 py-2 font-semibold text-white hover:bg-millelink-700 sm:col-span-2 sm:justify-self-start"
                >
                  {t('save')}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-semibold">{t('translationsSection')}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t('translationsHint')}
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
                        className="rounded-full border border-millelink-600 px-4 py-2 text-sm font-semibold text-millelink-700 hover:bg-millelink-50"
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
                        {link.url}
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
                              className="text-sm font-medium text-millelink-700 hover:underline"
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
                className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input type="hidden" name="uiLocale" value={locale} />
                <input type="hidden" name="profileId" value={profile.id} />
                <input
                  type="url"
                  name="url"
                  required
                  placeholder="https://…"
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  type="text"
                  name="title"
                  required
                  placeholder={t('linkTitle')}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <button
                  type="submit"
                  className="rounded-full bg-millelink-600 px-5 py-2 font-semibold text-white hover:bg-millelink-700"
                >
                  {t('addLink')}
                </button>
              </form>
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
                        className="rounded-full border border-millelink-600 px-4 py-2 text-sm font-semibold text-millelink-700 hover:bg-millelink-50"
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
