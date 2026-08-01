import Link from 'next/link';

import { submitReportAction } from '@/app/actions/report';
import { getDictionary } from '@/i18n';
import { isLocale } from '@/i18n/config';
import { errorMessage } from '@/lib/messages';
import { pageMetadata } from '@/lib/seo';
import { PUBLISHER } from '@/lib/site';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string; error?: string; url?: string }>;
};

const field = 'mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100';

export async function generateMetadata({ params }: Pick<Props, 'params'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.report.title,
    description: t.report.description,
    path: '/report',
    noindex: true,
  });
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  const t = getDictionary(locale);
  const { ok, error, url } = await searchParams;
  const message = errorMessage(error, t);

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{t.report.h1}</span>
      </h1>
      <p className="mt-3 text-silver-400">{t.report.intro}</p>

      {ok && (
        <p role="status" className="mt-6 rounded-lg border border-cyan-600 bg-ink-900 p-3">
          {t.report.ok}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-6 rounded-lg border border-red-500/60 bg-red-950/40 p-3">
          {message}
        </p>
      )}

      <form action={submitReportAction} className="mt-8 space-y-5">
        <input type="hidden" name="locale" value={locale} />

        <div>
          <label htmlFor="targetUrl">{t.report.urlLabel}</label>
          <input
            id="targetUrl"
            name="targetUrl"
            type="url"
            required
            defaultValue={url}
            maxLength={300}
            className={field}
            aria-describedby="target-help"
          />
          <p id="target-help" className="mt-1 text-sm text-silver-500">
            {t.report.urlHelp}
          </p>
        </div>

        <div>
          <label htmlFor="reason">{t.report.reasonLabel}</label>
          <textarea
            id="reason"
            name="reason"
            rows={6}
            required
            minLength={20}
            maxLength={4000}
            className={field}
            aria-describedby="reason-help"
          />
          <p id="reason-help" className="mt-1 text-sm text-silver-500">
            {t.report.reasonHelp}
          </p>
        </div>

        {/* Чл. 16, ал. 2, б. „в“ DSA ИЗРИЧНО не изисква име и имейл при
            уведомление за престъпленията по чл. 3–7 от Дир. 2011/93/ЕС.
            Безусловно задължителните полета бяха по-ограничителни от закона и
            възпираха точно най-тежкия сигнал — затова изключението стои ПРЕДИ
            тях, а не скрито в дребен шрифт отдолу. */}
        <div className="flex items-start gap-3 rounded-lg border border-white/15 p-3">
          <input
            id="anonymousAllowed"
            name="anonymousAllowed"
            type="checkbox"
            className="mt-1"
            aria-describedby="anon-help"
          />
          <div>
            <label htmlFor="anonymousAllowed" className="font-medium">
              {t.report.anonymousLabel}
            </label>
            <p id="anon-help" className="mt-1 text-sm text-silver-400">
              {t.report.anonymousHelp}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="reporterName">{t.report.nameLabel}</label>
          <input id="reporterName" name="reporterName" maxLength={120} className={field} />
        </div>

        <div>
          <label htmlFor="reporterEmail">{t.report.emailLabel}</label>
          <input
            id="reporterEmail"
            name="reporterEmail"
            type="email"
            maxLength={120}
            className={field}
            aria-describedby="email-help"
          />
          <p id="email-help" className="mt-1 text-sm text-silver-500">
            {t.report.emailHelp}{' '}
            <Link href={`/${locale}/privacy`} className="text-cyan-300 underline underline-offset-2">
              {t.report.emailHelpLink}
            </Link>
            .
          </p>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="goodFaith"
            name="goodFaith"
            type="checkbox"
            required
            className="mt-1 h-4 w-4"
            aria-describedby="goodfaith-help"
          />
          <label htmlFor="goodFaith" id="goodfaith-help" className="text-sm text-silver-400">
            {t.report.goodFaith}
          </label>
        </div>

        {/* Honeypot — скрит за хора, видим за ботове. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="website">{t.submit.honeypot}</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-ink-950 hover:bg-cyan-400"
        >
          {t.report.submitButton}
        </button>
      </form>

      <p className="mt-8 text-sm text-silver-500">
        {t.report.mailFallback}{' '}
        <a
          href={`mailto:${PUBLISHER.email}`}
          className="text-cyan-300 underline underline-offset-2"
        >
          {PUBLISHER.email}
        </a>
        . {t.report.mailTail}
      </p>
    </div>
  );
}
