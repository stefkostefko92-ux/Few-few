/**
 * Стълбовидна графика без нито една зависимост — 24 стойности не заслужават
 * библиотека за 40 kB. Числата са и в текст (`<title>` + резюме), защото
 * графика без текстов еквивалент е недостъпна (WCAG 1.1.1).
 */
export function PlayersChart({
  values,
  label,
  emptyLabel,
  peakLabel,
}: {
  values: number[];
  label: string;
  emptyLabel: string;
  peakLabel: string;
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
          const height = peak === 0 ? 0 : Math.max(2, (value / peak) * (H - 4));
          return (
            <rect
              key={index}
              x={index * 12 + 2}
              y={H - height}
              width={8}
              height={height}
              rx={2}
              className={value === peak ? 'fill-cyan-300' : 'fill-cyan-700'}
            />
          );
        })}
      </svg>
      <figcaption className="mt-1 text-sm text-silver-500">
        {label} · {peakLabel} {peak}
      </figcaption>
    </figure>
  );
}
