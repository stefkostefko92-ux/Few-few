import { redirect } from 'next/navigation';

import { Badge } from '@/components/Badge';
import { isAdmin } from '@/lib/admin/auth';
import { isLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

/**
 * Панелът е ВАЛИДАТОР, не хранилище. Тук няма поле, в което да поставиш ключ —
 * и това е нарочно, по препоръка на червения екип:
 *
 *  - ключ в базата значи, че SQL injection и всеки откраднат бекъп започват да
 *    връщат ключове, каквото днес не се случва (базата няма нито едно тайно поле);
 *  - шифроване с главен ключ в същия `.env` помага срещу открадната база, но не
 *    и срещу компрометиран процес — там нападателят има и ключа, и данните;
 *  - Postgres пази старите стойности в мъртви редове и в WAL, тоест „ротирах
 *    изтеклия ключ“ не го маха от архивите.
 *
 * Затова тук се показва само НАЛИЧНОСТ (никога стойност, дори маскирана) и се
 * дава точният ред за `.env` на сървъра.
 */
const INTEGRATIONS = [
  {
    badge: 'twitch',
    name: 'Twitch',
    vars: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
    note: 'Откриване на български GTA V стриймъри: Helix /streams?game_id=32982&language=bg. Ключовете са безплатни от dev.twitch.tv.',
  },
  {
    badge: 'youtube',
    name: 'YouTube',
    vars: ['YOUTUBE_API_KEY'],
    note: 'search.list с eventType=live. Квотата е тясна — 100 единици на заявка при 10 000 на ден.',
  },
  {
    badge: 'cfx',
    name: 'Kick',
    vars: [],
    note: 'Публичният списък не иска ключ. Официалното API иска OAuth и още не се ползва.',
  },
  {
    badge: 'tiktok',
    name: 'TikTok',
    vars: [],
    note: 'НЯМА публично откриване на живи излъчвания. Стриймърите тук се добавят само ръчно — това е ограничение на платформата, не наше.',
  },
];

export default async function AdminIntegrations({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'bg';
  if (!(await isAdmin())) redirect(`/${locale}/admin/login`);

  // Чете се САМО наличието. Стойността не напуска процеса.
  const present = (name: string) => Boolean(process.env[name]);

  return (
    <div className="max-w-2xl">
      <p className="rounded-lg border border-cyan-700/40 bg-cyan-900/10 p-4 text-sm text-silver-300">
        Тук няма поле за поставяне на ключ — нарочно. Ключ, който мине през уеб форма, минава през
        процеса, мрежата и евентуален лог, а щом се запише, вече има какво да се открадне при пробив
        в базата. Тайните остават във файл на сървъра с права 600.
      </p>

      <ul className="mt-6 space-y-4">
        {INTEGRATIONS.map((item) => {
          const missing = item.vars.filter((name) => !present(name));
          const ready = item.vars.length === 0 || missing.length === 0;
          return (
            <li key={item.name} className="rounded-xl border border-white/10 bg-ink-900/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge name={item.badge} size={32} />
                <strong className="text-silver-100">{item.name}</strong>
                <span
                  className={
                    ready
                      ? 'flex items-center gap-1 rounded bg-cyan-700/25 px-2 py-0.5 text-xs text-cyan-200'
                      : 'flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-xs text-silver-500'
                  }
                >
                  <Badge name={ready ? 'success' : 'offline'} size={24} />
                  {ready ? 'готово' : 'липсва ключ'}
                </span>
              </div>

              <p className="mt-2 text-sm text-silver-400">{item.note}</p>

              {item.vars.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {item.vars.map((name) => (
                    <li key={name} className="flex items-center gap-2">
                      <Badge name={present(name) ? 'success' : 'warning'} size={24} />
                      <code className="text-silver-300">{name}</code>
                      <span className="text-silver-500">{present(name) ? 'зададен' : 'липсва'}</span>
                    </li>
                  ))}
                </ul>
              )}

              {missing.length > 0 && (
                <pre className="mt-3 overflow-x-auto rounded border border-white/10 bg-ink-950 p-3 text-xs text-silver-400">
{`# на сървъра, в .env на продукта
${missing.map((name) => `${name}=…`).join('\n')}
chmod 600 .env`}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
