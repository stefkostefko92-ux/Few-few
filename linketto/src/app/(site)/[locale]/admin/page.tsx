import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteChrome';
import type { Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import {
  adminSetPasswordAction,
  adminUpdateUserAction,
  setProfileBanAction,
} from '@/app/actions/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false } };

const PLAN_VALUES = ['FREE', 'PRO', 'BUSINESS', 'FOUNDER'] as const;

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { q, ok, error } = await searchParams;
  await requireAdmin(locale);
  const t = await getTranslations('admin');

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
      profiles: { select: { id: true, slug: true, published: true, bannedAt: true } },
      loginEvents: { orderBy: { createdAt: 'desc' }, take: 5 },
      _count: { select: { loginEvents: true } },
    },
  });

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm';

  return (
    <>
      <SiteHeader locale={locale as Locale} />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {ok && (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {t('saved')}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error === 'email'
              ? t('errorEmail')
              : error === 'password'
                ? t('errorPassword')
                : t('errorInput')}
          </p>
        )}

        <form method="get" className="flex gap-3">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('searchPlaceholder')}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-full bg-linketto-600 px-5 py-2 font-semibold text-white hover:bg-linketto-700"
          >
            {t('search')}
          </button>
        </form>
        <p className="text-sm text-slate-500">
          {t('total', { count: users.length })}
        </p>

        <div className="space-y-6">
          {users.map((user) => (
            <section
              key={user.id}
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{user.email}</p>
                  <p className="text-xs text-slate-500">
                    {user.name ?? '—'} · {user.plan} ·{' '}
                    {user.createdAt.toISOString().slice(0, 10)}
                    {user.stripeAccountId ? ' · Stripe Connect' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.profiles.map((profile) => (
                    <span
                      key={profile.id}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        profile.bannedAt
                          ? 'bg-red-100 text-red-700'
                          : profile.published
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      /u/{profile.slug}
                      {profile.bannedAt
                        ? ` · ${t('banned')}`
                        : profile.published
                          ? ''
                          : ` · ${t('unpublished')}`}
                    </span>
                  ))}
                </div>
              </div>

              {/* Логнати IP-та (последните 5, пазят се 90 дни) */}
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('loginIps', { count: user._count.loginEvents })}
                </h3>
                {user.loginEvents.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">—</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm text-slate-700">
                    {user.loginEvents.map((event) => (
                      <li key={event.id}>
                        {event.ip}
                        <span className="ml-2 font-sans text-xs text-slate-400">
                          {event.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-5 grid gap-6 border-t border-slate-100 pt-5 lg:grid-cols-2">
                {/* Пълна промяна на данните */}
                <form
                  action={adminUpdateUserAction}
                  className="space-y-2 text-sm"
                >
                  <input type="hidden" name="uiLocale" value={locale} />
                  <input type="hidden" name="userId" value={user.id} />
                  <h3 className="font-semibold text-slate-700">
                    {t('editUser')}
                  </h3>
                  <label className="block">
                    {t('email')}
                    <input
                      type="email"
                      name="email"
                      required
                      defaultValue={user.email}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    {t('name')}
                    <input
                      type="text"
                      name="name"
                      defaultValue={user.name ?? ''}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    {t('plan')}
                    <select name="plan" defaultValue={user.plan} className={inputClass}>
                      {PLAN_VALUES.map((plan) => (
                        <option key={plan} value={plan}>
                          {plan}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-full border border-linketto-600 px-4 py-1.5 font-semibold text-linketto-700 hover:bg-linketto-50"
                  >
                    {t('save')}
                  </button>
                </form>

                {/* Нова парола + бан */}
                <div className="space-y-4 text-sm">
                  <form action={adminSetPasswordAction} className="space-y-2">
                    <input type="hidden" name="uiLocale" value={locale} />
                    <input type="hidden" name="userId" value={user.id} />
                    <h3 className="font-semibold text-slate-700">
                      {t('setPassword')}
                    </h3>
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={8}
                      placeholder={t('newPassword')}
                      autoComplete="new-password"
                      className={inputClass}
                    />
                    <p className="text-xs text-slate-400">{t('passwordHint')}</p>
                    <button
                      type="submit"
                      className="rounded-full border border-amber-600 px-4 py-1.5 font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      {t('setPasswordButton')}
                    </button>
                  </form>

                  {user.profiles.map((profile) => (
                    <form key={profile.id} action={setProfileBanAction}>
                      <input type="hidden" name="uiLocale" value={locale} />
                      <input type="hidden" name="profileId" value={profile.id} />
                      <input
                        type="hidden"
                        name="ban"
                        value={profile.bannedAt ? '0' : '1'}
                      />
                      <button
                        type="submit"
                        className={`rounded-full px-4 py-1.5 font-semibold ${
                          profile.bannedAt
                            ? 'border border-green-600 text-green-700 hover:bg-green-50'
                            : 'border border-red-600 text-red-700 hover:bg-red-50'
                        }`}
                      >
                        {profile.bannedAt
                          ? t('unbanProfile', { slug: profile.slug })
                          : t('banProfile', { slug: profile.slug })}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
