import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { bestLocale, isLocale, LOCALES } from '@/i18n/locales';
import { headers } from 'next/headers';
import { REPORT_CATEGORIES } from '@/lib/report';
import { submitReportAction } from '@/app/actions/report';

// DSA чл. 16: страница „Докладвай този профил“. Не се индексира.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false } };

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hl?: string; sent?: string }>;
}) {
  const { slug } = await params;
  const { hl, sent } = await searchParams;
  const profile = await prisma.profile.findUnique({ where: { slug } });
  if (!profile || !profile.published) notFound();

  const requestHeaders = await headers();
  const locale =
    hl && isLocale(hl)
      ? hl
      : bestLocale(requestHeaders.get('accept-language'), LOCALES, 'en');
  const t = await getTranslations({ locale, namespace: 'report' });

  return (
    <main
      lang={locale}
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16 font-ui text-slate-900"
    >
      <h1 className="text-2xl font-bold text-slate-900">
        {t('title', { name: slug })}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {t('intro')}
      </p>
      {sent ? (
        <>
          <p
            role="status"
            className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-700"
          >
            {t('sent')}
          </p>
          <Link
            href={`/u/${slug}?hl=${locale}`}
            className="mt-6 text-sm font-medium text-linketto-700 hover:underline"
          >
            ← {t('back')}
          </Link>
        </>
      ) : (
        <form action={submitReportAction} className="mt-6 space-y-4 text-sm">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="hl" value={locale} />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />
          <label className="block font-medium">
            {t('categoryLabel')}
            <select
              name="category"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {REPORT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`category_${category}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-medium">
            {t('messageLabel')}
            <textarea
              name="message"
              required
              minLength={10}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block font-medium">
            {t('emailLabel')}
            <input
              type="email"
              name="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <p className="text-xs text-slate-500">{t('legalNote')}</p>
          <div className="flex items-center gap-4">
            <button
              type="submit"
              className="rounded-full bg-linketto-600 px-6 py-2.5 font-semibold text-white hover:bg-linketto-700"
            >
              {t('send')}
            </button>
            <Link
              href={`/u/${slug}?hl=${locale}`}
              className="font-medium text-slate-500 hover:underline"
            >
              {t('back')}
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}
