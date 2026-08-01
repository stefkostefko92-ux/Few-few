import { submitServerAction } from '@/app/actions/submit';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Добави своя FiveM сървър',
  description:
    'Подай своя български FiveM RP сървър за листване в директорията. Заявките минават през ръчна модерация — безплатно.',
  path: '/submit',
  keywords: ['добави FiveM сървър', 'листване FiveM сървър', 'партньорство FiveM'],
});

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

const field = 'mt-1 w-full rounded-lg border border-white/15 bg-fivem-900 px-3 py-2 text-slate-100';

export default async function SubmitPage({ searchParams }: Props) {
  const { ok, error } = await searchParams;

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">Добави своя сървър</h1>
      <p className="mt-3 text-slate-300">
        Листването е безплатно. Заявката влиза в опашка и се публикува след ръчна проверка — така
        списъкът остава чист от мъртви и фалшиви сървъри.
      </p>

      {ok && (
        <p role="status" className="mt-6 rounded-lg border border-fivem-600 bg-fivem-900 p-3">
          Получихме заявката. Ще пишем на посочения имейл след прегледа.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-red-500/60 bg-red-950/40 p-3">
          {error}
        </p>
      )}

      <form action={submitServerAction} className="mt-8 space-y-5">
        <div>
          <label htmlFor="serverName">Име на сървъра</label>
          <input id="serverName" name="serverName" required maxLength={80} className={field} />
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
