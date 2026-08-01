import { submitReportAction } from '@/app/actions/report';
import { errorMessage } from '@/lib/messages';
import { pageMetadata } from '@/lib/seo';
import { PUBLISHER } from '@/lib/site';

export const metadata = pageMetadata({
  title: 'Сигнал за незаконно съдържание',
  description:
    'Подай сигнал за незаконно съдържание в директорията по чл. 16 от Регламент (ЕС) 2022/2065 (Законодателен акт за цифровите услуги).',
  path: '/report',
  noindex: true,
});

type Props = { searchParams: Promise<{ ok?: string; error?: string; url?: string }> };

const field = 'mt-1 w-full rounded-lg border border-white/15 bg-fivem-900 px-3 py-2 text-slate-100';

export default async function ReportPage({ searchParams }: Props) {
  const { ok, error, url } = await searchParams;
  const message = errorMessage(error);

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">Сигнал за незаконно съдържание</h1>
      <p className="mt-3 text-slate-300">
        Формата е механизмът за уведомяване по чл. 16 от Регламент (ЕС) 2022/2065. Разглеждаме всеки
        сигнал своевременно и без произвол, изпращаме потвърждение за получаване и след решението те
        уведомяваме заедно с информация за възможностите за оспорване.
      </p>

      {ok && (
        <p role="status" className="mt-6 rounded-lg border border-fivem-600 bg-fivem-900 p-3">
          Получихме сигнала. Изпратихме потвърждение на посочения имейл и ще пишем след решението.
        </p>
      )}
      {message && (
        <p role="alert" className="mt-6 rounded-lg border border-red-500/60 bg-red-950/40 p-3">
          {message}
        </p>
      )}

      <form action={submitReportAction} className="mt-8 space-y-5">
        <div>
          <label htmlFor="targetUrl">Точен адрес на съдържанието</label>
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
          <p id="target-help" className="mt-1 text-sm text-slate-400">
            Копирай адреса от лентата на браузъра — чл. 16, ал. 2, б. „б“.
          </p>
        </div>

        <div>
          <label htmlFor="reason">Защо смяташ съдържанието за незаконно</label>
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
          <p id="reason-help" className="mt-1 text-sm text-slate-400">
            Достатъчно обоснована и подробна обосновка — чл. 16, ал. 2, б. „а“.
          </p>
        </div>

        <div>
          <label htmlFor="reporterName">Име</label>
          <input id="reporterName" name="reporterName" required maxLength={120} className={field} />
        </div>

        <div>
          <label htmlFor="reporterEmail">Имейл</label>
          <input
            id="reporterEmail"
            name="reporterEmail"
            type="email"
            required
            maxLength={120}
            className={field}
            aria-describedby="email-help"
          />
          <p id="email-help" className="mt-1 text-sm text-slate-400">
            Ползваме го само за потвърждението и за решението по този сигнал. Основание: чл. 6, ал. 1,
            б. „в“ ОРЗД (правно задължение по DSA). Подробности — в{' '}
            <a href="/privacy" className="text-fivem-400 underline underline-offset-2">
              политиката за поверителност
            </a>
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
          <label htmlFor="goodFaith" id="goodfaith-help" className="text-sm text-slate-300">
            Декларирам добросъвестно, че информацията и твърденията в този сигнал са точни и пълни —
            чл. 16, ал. 2, б. „г“.
          </label>
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
          Изпрати сигнала
        </button>
      </form>

      <p className="mt-8 text-sm text-slate-400">
        Ако предпочиташ имейл:{' '}
        <a
          href={`mailto:${PUBLISHER.email}`}
          className="text-fivem-400 underline underline-offset-2"
        >
          {PUBLISHER.email}
        </a>
        . Сигналите с изчерпателна обосновка и точен адрес се обработват най-бързо.
      </p>
    </div>
  );
}
