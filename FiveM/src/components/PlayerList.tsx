import type { Dictionary } from '@/i18n';

/**
 * Кой играе в момента — разгъващ се списък под броя играчи.
 *
 * `<details>`, а не React състояние: нула клиентски JavaScript, работи с
 * клавиатура и с екранен четец по подразбиране, и остава Server Component.
 *
 * ТОВА СА ЛИЧНИ ДАННИ. Затова:
 *  - показваме САМО име (`identifiers` от `players.json` не се четат изобщо);
 *  - „не знаем“ (`playersSeenAt === null`) се различава от „няма никого“
 *    (празен списък) — иначе твърдим, че сървър е празен, когато той просто
 *    не ни казва;
 *  - до списъка стои откъде идва и как се маха (чл. 14 и чл. 21 ОРЗД).
 */
export function PlayerList({
  names,
  seenAt,
  t,
}: {
  names: string[];
  seenAt: Date | null;
  t: Dictionary;
}) {
  // Няма видимост → нищо не се обещава. Празен списък при налична проверка е
  // истинска информация и се показва.
  if (seenAt === null) {
    return <p className="mt-2 text-xs text-silver-500">{t.server.playersHidden}</p>;
  }

  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer list-none text-sm text-cyan-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
        {t.server.playersOpen} ({names.length})
      </summary>

      {names.length === 0 ? (
        <p className="mt-2 text-sm text-silver-400">{t.server.playersNone}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {names.map((name, index) => (
            // Ключът носи и индекса: двама играчи с еднакъв ник са двама
            // играчи, а не дубликат, който да се слее.
            <li
              key={`${name}-${index}`}
              className="rounded border border-white/10 bg-ink-900 px-2 py-0.5 text-xs text-silver-300"
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-silver-500">{t.server.playersNote}</p>
    </details>
  );
}
