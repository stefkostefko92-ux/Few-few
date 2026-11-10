import Link from 'next/link';

import { submitServerAction } from '@/app/actions/submit';
import { getDictionary, resolveLocale } from '@/i18n';
import { errorMessage } from '@/lib/messages';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string; error?: string; field?: string }>;
};

const field = 'field';

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
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
      {/* Две колони на широк екран: обяснението остава до формата, докато
          човек я попълва — точно тогава се чудиш „какво става после“. */}
      <header className="lg:sticky lg:top-28 lg:self-start">
      <h1 className="page-title">
        {t.submit.h1}
      </h1>
      <p className="lead mt-5">
        {t.submit.intro}{' '}
        <Link href={`/${locale}/terms`} className="link">
          {t.submit.introTerms}
        </Link>
        .
      </p>
      </header>
      <div className="min-w-0">

      {ok && (
        <p role="status" className="mb-6 rounded-xl border border-cyan-300/30 bg-cyan-400/[0.07] p-4 text-cyan-100">
          {t.submit.ok}
        </p>
      )}
      {message && (
        <p
          id="form-error"
          role="alert"
          className="mb-6 rounded-xl border border-red-400/40 bg-red-950/40 p-4 text-red-100"
        >
          {message}
        </p>
      )}

      <form action={submitServerAction} className="panel space-y-6 p-6 sm:p-8">
        <input type="hidden" hidden name="locale" value={locale} />

        <div>
          <label htmlFor="serverName" className="field-label">{t.submit.nameLabel}</label>
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
          <label htmlFor="cfxJoinCode" className="field-label">{t.submit.cfxLabel}</label>
          <input
            id="cfxJoinCode"
            name="cfxJoinCode"
            placeholder="cfx.re/join/abcd12"
            maxLength={120}
            className={field}
            aria-describedby="cfx-help"
            {...flag('cfxJoinCode')}
          />
          <p id="cfx-help" className="field-help">
            {t.submit.cfxHelp}
          </p>
        </div>

        <div>
          <label htmlFor="address" className="field-label">{t.submit.addressLabel}</label>
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
          <label htmlFor="discordUrl" className="field-label">{t.submit.discordLabel}</label>
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
          <label htmlFor="contactEmail" className="field-label">{t.submit.emailLabel}</label>
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
          <p id="email-help" className="field-help">
            {t.submit.emailHelp}
          </p>
        </div>

        <div>
          <label htmlFor="note" className="field-label">{t.submit.noteLabel}</label>
          <textarea id="note" name="note" rows={4} maxLength={1000} className={field} />
        </div>

        {/* Honeypot — скрит за хора, видим за ботове. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="website">{t.submit.honeypot}</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <p className="text-sm text-silver-500">
          {t.submit.consent1}{' '}
          <Link href={`/${locale}/terms`} className="link">
            {t.footer.terms}
          </Link>
          {t.submit.consent2}{' '}
          <Link href={`/${locale}/privacy`} className="link">
            {t.footer.privacy}
          </Link>
          {t.submit.consent3}
        </p>

        <button
          type="submit"
          className="btn-primary"
        >
          {t.submit.submitButton}
        </button>
      </form>
      </div>
    </div>
  );
}
