import Link from 'next/link';

import { submitServerAction } from '@/app/actions/submit';
import { getDictionary, resolveLocale } from '@/i18n';
import { errorMessage } from '@/lib/messages';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string; error?: string; field?: string }>;
};

const field = 'mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-silver-100';

export async function generateMetadata({ params }: Pick<Props, 'params'>) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.submit.title,
    description: t.submit.description,
    path: '/submit',
    // По ЛОКАЛ, не общ списък. Дотук страницата подаваше едни и същи смесени
    // български и английски думи и на двата езика — тоест обявяваше английски
    // термини на българската страница и обратно. Всички останали страници се
    // разклоняват; тази и `/news` бяха изключенията.
    keywords:
      locale === 'bg'
        ? ['добави FiveM сървър', 'листване на FiveM сървър', 'промотиране на FiveM сървър']
        : ['add FiveM server', 'list a FiveM server', 'FiveM server promotion'],
  });
}

export default async function SubmitPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const { ok, error, field: badField } = await searchParams;

  // През URL пътува само КОД на грешката — текстът се чете от речника. Иначе
  // всеки може да сподели …/submit?error=<чужд+текст> и на нашия домейн, в
  // нашия дизайн, ще се покаже неговото съобщение.
  const message = errorMessage(error, t);
  /** Маркира точно проблемното поле за екранния четец (WCAG 3.3.1). */
  const flag = (name: string) =>
    badField === name ? ({ 'aria-invalid': true, 'aria-errormessage': 'form-error' } as const) : {};

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{t.submit.h1}</span>
      </h1>
      <p className="mt-3 text-silver-400">
        {t.submit.intro}{' '}
        <Link href={`/${locale}/terms`} className="text-cyan-300 underline underline-offset-2">
          {t.submit.introTerms}
        </Link>
        .
      </p>

      {ok && (
        <p role="status" className="mt-6 rounded-lg border border-cyan-600 bg-ink-900 p-3">
          {t.submit.ok}
        </p>
      )}
      {message && (
        <p
          id="form-error"
          role="alert"
          className="mt-6 rounded-lg border border-red-500/60 bg-red-950/40 p-3"
        >
          {message}
        </p>
      )}

      <form action={submitServerAction} className="mt-8 space-y-5">
        <input type="hidden" name="locale" value={locale} />

        <div>
          <label htmlFor="serverName">{t.submit.nameLabel}</label>
          <input
            id="serverName"
            name="serverName"
            required
            maxLength={80}
            className={field}
            {...flag('serverName')}
          />
        </div>

        <div>
          <label htmlFor="cfxJoinCode">{t.submit.cfxLabel}</label>
          <input
            id="cfxJoinCode"
            name="cfxJoinCode"
            placeholder="cfx.re/join/abcd12"
            maxLength={120}
            className={field}
            aria-describedby="cfx-help"
            {...flag('cfxJoinCode')}
          />
          <p id="cfx-help" className="mt-1 text-sm text-silver-500">
            {t.submit.cfxHelp}
          </p>
        </div>

        <div>
          <label htmlFor="address">{t.submit.addressLabel}</label>
          <input
            id="address"
            name="address"
            placeholder="1.2.3.4:30120"
            maxLength={120}
            className={field}
            {...flag('address')}
          />
        </div>

        <div>
          <label htmlFor="discordUrl">{t.submit.discordLabel}</label>
          <input
            id="discordUrl"
            name="discordUrl"
            type="url"
            placeholder="https://discord.gg/…"
            maxLength={200}
            className={field}
            {...flag('discordUrl')}
          />
        </div>

        <div>
          <label htmlFor="contactEmail">{t.submit.emailLabel}</label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            maxLength={120}
            className={field}
            aria-describedby="email-help"
            {...flag('contactEmail')}
          />
          <p id="email-help" className="mt-1 text-sm text-silver-500">
            {t.submit.emailHelp}
          </p>
        </div>

        <div>
          <label htmlFor="note">{t.submit.noteLabel}</label>
          <textarea id="note" name="note" rows={4} maxLength={1000} className={field} />
        </div>

        {/* Honeypot — скрит за хора, видим за ботове. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="website">{t.submit.honeypot}</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <p className="text-sm text-silver-500">
          {t.submit.consent1}{' '}
          <Link href={`/${locale}/terms`} className="text-cyan-300 underline underline-offset-2">
            {t.footer.terms}
          </Link>
          {t.submit.consent2}{' '}
          <Link href={`/${locale}/privacy`} className="text-cyan-300 underline underline-offset-2">
            {t.footer.privacy}
          </Link>
          {t.submit.consent3}
        </p>

        <button
          type="submit"
          className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-ink-950 hover:bg-cyan-400"
        >
          {t.submit.submitButton}
        </button>
      </form>
    </div>
  );
}
