import Link from 'next/link';

import { submitServerAction } from '@/app/actions/submit';
import { errorMessage } from '@/lib/messages';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Добави своя FiveM сървър',
  description:
    'Подай своя български FiveM RP сървър за листване в директорията. Заявките минават през ръчна модерация — безплатно.',
  path: '/submit',
  keywords: ['добави FiveM сървър', 'листване FiveM сървър', 'партньорство FiveM'],
});

type Props = { searchParams: Promise<{ ok?: string; error?: string; field?: string }> };

const field = 'mt-1 w-full rounded-lg border border-white/15 bg-fivem-900 px-3 py-2 text-slate-100';

export default async function SubmitPage({ searchParams }: Props) {
  const { ok, error, field: badField } = await searchParams;
  // През URL пътува само КОД на грешката — текстът се чете от фиксирана
  // таблица. Иначе всеки може да сподели …/submit?error=<чужд+текст> и на
  // нашия домейн, в нашия дизайн, ще се покаже неговото съобщение.
  const message = errorMessage(error);
  /** Маркира точно проблемното поле за екранния четец (WCAG 3.3.1). */
  const flag = (name: string) =>
    badField === name ? ({ 'aria-invalid': true, 'aria-errormessage': 'form-error' } as const) : {};

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">Добави своя сървър</h1>
      <p className="mt-3 text-slate-300">
        Основното листване е безплатно. Заявката влиза в опашка и се публикува след ръчна проверка —
        така списъкът остава чист от мъртви и фалшиви сървъри. Отделно предлагаме платено
        промотиране, което само вдига мястото в подредбата и е обозначено със значка — условията и
        параметрите на класирането са в{' '}
        <Link href="/terms" className="text-fivem-400 underline underline-offset-2">
          Общите условия
        </Link>
        .
      </p>

      {ok && (
        <p role="status" className="mt-6 rounded-lg border border-fivem-600 bg-fivem-900 p-3">
          Получихме заявката. Ще пишем на посочения имейл след прегледа.
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
        <div>
          <label htmlFor="serverName">Име на сървъра</label>
          <input id="serverName" name="serverName" required maxLength={80} className={field} {...flag('serverName')} />
        </div>

        <div>
          <label htmlFor="cfxJoinCode">cfx.re код</label>
          <input
            id="cfxJoinCode"
            name="cfxJoinCode"
            placeholder="cfx.re/join/abcd12"
            maxLength={120}
            className={field}
            aria-describedby="cfx-help"
            {...flag('cfxJoinCode')}
          />
          <p id="cfx-help" className="mt-1 text-sm text-slate-400">
            Или адрес по-долу — нужно е поне едно от двете.
          </p>
        </div>

        <div>
          <label htmlFor="address">Адрес (host:port)</label>
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
          <label htmlFor="discordUrl">Discord покана</label>
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
          <label htmlFor="contactEmail">Имейл за връзка</label>
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
          <p id="email-help" className="mt-1 text-sm text-slate-400">
            Ползваме го само за отговор по тази заявка (чл. 13 ОРЗД). Не се публикува и не влиза в
            списък за писма.
          </p>
        </div>

        <div>
          <label htmlFor="note">Кратко описание</label>
          <textarea id="note" name="note" rows={4} maxLength={1000} className={field} />
        </div>

        {/* Honeypot — скрит за хора, видим за ботове. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="website">Не попълвай това поле</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <p className="text-sm text-slate-400">
          С изпращането потвърждаваш, че имаш право да представляваш този сървър и че подадените
          текстове и линкове са твои или имаш разрешение за тях (виж{' '}
          <Link href="/terms" className="text-fivem-400 underline underline-offset-2">
            Общи условия
          </Link>
          ). Как обработваме имейла ти — виж{' '}
          <Link href="/privacy" className="text-fivem-400 underline underline-offset-2">
            Политиката за поверителност
          </Link>
          . Това не е съгласие по смисъла на ОРЗД: основанието е чл. 6, ал. 1, б. „б“ и „е“.
        </p>

        <button
          type="submit"
          className="rounded-lg bg-fivem-500 px-4 py-2 font-medium text-fivem-950 hover:bg-fivem-400"
        >
          Изпрати заявката
        </button>
      </form>
    </div>
  );
}
