import Link from 'next/link';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { bestLocale, isLocale, LOCALES } from '@/i18n/locales';
import { confirmSubscriptionAction, unsubscribeAction } from '@/app/actions/newsletter';

// Потвърждение/отписване от бюлетин (abuse-money-spec Г3): страницата САМО
// показва бутон — четенето е без странични ефекти, действието е POST. Иначе
// скенерите в пощата потвърждават и отписват вместо човека.
export async function NewsletterTokenPage({
  slug,
  token,
  mode,
  invalid,
}: {
  slug: string;
  token: string;
  mode: 'confirm' | 'unsubscribe';
  invalid?: boolean;
}) {
  const subscriber = token
    ? await prisma.subscriber.findUnique({
        where: { token },
        select: { locale: true, profile: { select: { slug: true, bannedAt: true } } },
      })
    : null;
  const valid =
    !invalid && subscriber !== null && subscriber.profile.slug === slug && !(mode === 'confirm' && subscriber.profile.bannedAt);
  const fromHeader = bestLocale((await headers()).get('accept-language'), LOCALES, 'en');
  const locale = subscriber?.locale && isLocale(subscriber.locale) ? subscriber.locale : fromHeader;
  const t = await getTranslations({ locale, namespace: 'newsletterPage' });

  return (
    <main
      lang={locale}
      className="dash flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 font-ui text-slate-900 sm:px-6"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.2)] sm:p-9">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          {mode === 'confirm' ? t('confirmTitle') : t('unsubTitle')}
        </h1>
        {valid ? (
          <form action={mode === 'confirm' ? confirmSubscriptionAction : unsubscribeAction} className="mt-4 space-y-5">
            <p className="text-sm leading-relaxed text-slate-600">
              {mode === 'confirm' ? t('confirmText', { name: slug }) : t('unsubText', { name: slug })}
            </p>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="focus-ring inline-flex h-11 w-full items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {mode === 'confirm' ? t('confirmButton') : t('unsubButton')}
            </button>
          </form>
        ) : (
          <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            {t('invalid')}
          </p>
        )}
        <Link href={`/u/${slug}?hl=${locale}`} className="mt-6 inline-block text-sm font-medium text-linketto-700 hover:underline">
          ← {t('back')}
        </Link>
      </div>
    </main>
  );
}
