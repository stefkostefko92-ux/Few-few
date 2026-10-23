import Link from 'next/link';

import { submitReportAction } from '@/app/actions/report';
import { getDictionary, resolveLocale } from '@/i18n';
import { errorMessage } from '@/lib/messages';
import { pageMetadata } from '@/lib/seo';
import { PUBLISHER } from '@/lib/site';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string; error?: string; url?: string }>;
};

const field = 'field';

export async function generateMetadata({ params }: Pick<Props, 'params'>) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
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
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const { ok, error, url } = await searchParams;
  const message = errorMessage(error, t);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
      {/* Две колони на широк екран: обяснението остава до формата, докато
          човек я попълва — точно тогава се чудиш „какво става после“. */}
      <header className="lg:sticky lg:top-28 lg:self-start">
      <h1 className="page-title">
        {t.report.h1}
      </h1>
      <p className="lead mt-5">{t.report.intro}</p>
      </header>
      <div className="min-w-0">

      {ok && (
        <p role="status" className="mb-6 rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-4 text-cyan-100">
          {t.report.ok}
        </p>
      )}
      {message && (
        <p role="alert" className="mb-6 rounded-xl border border-red-400/40 bg-red-950/40 p-4 text-red-100">
          {message}
        </p>
      )}

      <form action={submitReportAction} className="panel space-y-6 p-6 sm:p-8">
        <input type="hidden" hidden name="locale" value={locale} />

        <div>
          <label htmlFor="targetUrl" className="field-label">{t.report.urlLabel}</label>
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
          <p id="target-help" className="field-help">
            {t.report.urlHelp}
          </p>
        </div>

        <div>
          <label htmlFor="reason" className="field-label">{t.report.reasonLabel}</label>
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
          <p id="reason-help" className="field-help">
            {t.report.reasonHelp}
          </p>
        </div>

        {/* Чл. 16, ал. 2, б. „в“ DSA ИЗРИЧНО не изисква име и имейл при
            уведомление за престъпленията по чл. 3–7 от Дир. 2011/93/ЕС.
            Безусловно задължителните полета бяха по-ограничителни от закона и
            възпираха точно най-тежкия сигнал — затова изключението стои ПРЕДИ
            тях, а не скрито в дребен шрифт отдолу. */}
        <div className="flex items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.02] p-4">
          <input
            id="anonymousAllowed"
            name="anonymousAllowed"
            type="checkbox"
            className="mt-0.5"
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
          <label htmlFor="reporterName" className="field-label">{t.report.nameLabel}</label>
          <input id="reporterName" name="reporterName" maxLength={120} className={field} />
        </div>

        <div>
          <label htmlFor="reporterEmail" className="field-label">{t.report.emailLabel}</label>
          <input
            id="reporterEmail"
            name="reporterEmail"
            type="email"
            maxLength={120}
            className={field}
            aria-describedby="email-help"
          />
          <p id="email-help" className="field-help">
            {t.report.emailHelp}{' '}
            <Link href={`/${locale}/privacy`} className="link">
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
            className="mt-0.5"
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
          className="btn-primary"
        >
          {t.report.submitButton}
        </button>
      </form>

      <p className="mt-8 text-sm text-silver-500">
        {t.report.mailFallback}{' '}
        <a
          href={`mailto:${PUBLISHER.email}`}
          className="link"
        >
          {PUBLISHER.email}
        </a>
        . {t.report.mailTail}
      </p>
      </div>
    </div>
  );
}
