/**
 * Стълбовидна графика без нито една зависимост — 24 стойности не заслужават
 * библиотека за 40 kB. Числата са и в текст (`title` на всяка колона + резюме),
 * защото графика без текстов еквивалент е недостъпна (WCAG 1.1.1).
 *
 * Колоните са HTML (flex), не SVG. Предишният SVG имаше `viewBox` 288×56 и
 * `h-16 w-full`: браузърът го мащабира ПО ВИСОЧИНА и го центрира, тоест на
 * широк екран 24-те стълба стояха като тясна ивица по средата на празна лента,
 * а на тесен — се свиваха. Flex колоните запълват точно ширината на всяка.
 */
export function PlayersChart({
  values,
  labels,
  label,
  emptyLabel,
  peakLabel,
  playersLabel,
}: {
  values: number[];
  /** Етикет на всяка кофа („14 ч.“), в реда на `values`. */
  labels: string[];
  label: string;
  emptyLabel: string;
  peakLabel: string;
  playersLabel: string;
}) {
  const peak = Math.max(...values, 0);
  const empty = values.length === 0 || peak === 0;

  return (
    <figure className="rounded-xl border border-white/10 bg-ink-900/70 p-5">
      <div className="flex items-end justify-between gap-4">
        <figcaption className="text-sm text-silver-400">{label}</figcaption>
        {!empty && (
          <p className="text-right text-sm text-silver-400">
            {peakLabel}{' '}
            <span className="font-display text-2xl font-medium tabular-nums tracking-[-0.02em] text-silver-100">
              {peak}
            </span>
          </p>
        )}
      </div>

      {empty ? (
        <p className="mt-4 text-sm text-silver-500">{emptyLabel}</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${label}: ${peakLabel} ${peak} ${playersLabel}`}
            className="mt-4 flex h-28 items-end gap-[3px] border-b border-white/10"
          >
            {values.map((value, index) => (
              // Колоната е на цялата височина: мишката хваща и празното над
              // ниския стълб, иначе при 2 играча целта е 2 пиксела висока.
              <div
                key={index}
                // Часът и МАКСИМУМЪТ за него — кофата вече е максимум, не средно
                // (виж `bucketByHour`), значи това е точно „най-многото играчи“.
                title={`${labels[index] ?? ''} · ${peakLabel} ${value} ${playersLabel}`}
                className="flex h-full flex-1 items-end"
              >
                <div
                  // cyan-600, не cyan-700. Измерено срещу реалния фон на картата
                  // (`ink-900/70` върху `ink-950`): cyan-700 дава ≈3,1:1 — точно на
                  // ръба на 1.4.11 за нетекстово съдържание, cyan-600 дава ≈4,8:1.
                  className={`w-full rounded-t-[3px] ${value === peak ? 'bg-cyan-300' : 'bg-cyan-600'}`}
                  style={{ height: `${Math.max(2, (value / peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          {/* Четири опорни часа вместо 24 етикета: на 390 px 24 надписа се
              застъпват. Последният е „сега“ — дясната колона. */}
          <div aria-hidden="true" className="mt-2 flex justify-between text-xs tabular-nums text-silver-500">
            {[...new Set([0, 8, 16, labels.length - 1])].filter((index) => index < labels.length).map((index) => (
              <span key={index}>{labels[index] ?? ''}</span>
            ))}
          </div>
        </>
      )}
    </figure>
  );
}
