/**
 * Стълбовидна графика без нито една зависимост — 24 стойности не заслужават
 * библиотека за 40 kB. Числата са и в текст (`<title>` + резюме), защото
 * графика без текстов еквивалент е недостъпна (WCAG 1.1.1).
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
  if (values.length === 0 || peak === 0) {
    return <p className="mt-3 text-sm text-silver-500">{emptyLabel}</p>;
  }

  const W = 24 * 12;
  const H = 56;

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full"
        role="img"
        aria-label={`${label}: ${peakLabel} ${peak}`}
      >
        {values.map((value, index) => {
          // `peak` е гарантирано > 0: нулевият случай вече е върнал по-горе.
          // Тернарът тук беше недостижим клон, тоест мъртва защита, която
          // изглежда като жива.
          const height = Math.max(2, (value / peak) * (H - 4));
          return (
            // <g>, а не <rect> с <title>: мишката трябва да хване и празното над
            // ниския стълб, иначе при 2 играча целта е 2 пиксела висока.
            // Прозрачният `hit` покрива цялата колона, видимият стълб е под него.
            <g key={index}>
              {/* Часът и МАКСИМУМЪТ за него — кофата вече е максимум, не средно
                  (виж `bucketByHour`), значи това е точно „най-многото играчи“. */}
              <title>{`${labels[index] ?? ''} · ${peakLabel} ${value} ${playersLabel}`}</title>
              <rect
                x={index * 12 + 2}
                y={H - height}
                width={8}
                height={height}
                rx={2}
                // cyan-600, не cyan-700. Измерено срещу реалния фон на картата
                // (`ink-900/70` върху `ink-950`): cyan-700 дава ≈3,1:1 — точно на
                // ръба на 1.4.11 за нетекстово съдържание, cyan-600 дава ≈4,8:1.
                className={value === peak ? 'fill-cyan-300' : 'fill-cyan-600'}
              />
              <rect x={index * 12} y={0} width={12} height={H} className="fill-transparent" />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-sm text-silver-500">
        {label} · {peakLabel} {peak}
      </figcaption>
    </figure>
  );
}
