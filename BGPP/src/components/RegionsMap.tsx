import { OBLAST_PATHS, OBLAST_VIEWBOX } from "@/data/oblasti-geo";

// Прагове за цвета (брой предприятия със седалище в областта).
const BUCKETS: { min: number; fill: string; label: string }[] = [
  { min: 10, fill: "#1e3a5f", label: "10+" },
  { min: 5, fill: "#2f6fb0", label: "5–9" },
  { min: 3, fill: "#5b9bd5", label: "3–4" },
  { min: 2, fill: "#9cc3e6", label: "2" },
  { min: 1, fill: "#cfe2f3", label: "1" },
  { min: 0, fill: "#eef2f6", label: "0" },
];

function fillFor(count: number): string {
  return (BUCKETS.find((b) => count >= b.min) ?? BUCKETS[BUCKETS.length - 1]).fill;
}

/**
 * Хороплетна карта на 28-те области, оцветена по брой държавни предприятия със
 * седалище в областта. Сървърна, инлайн SVG (без външни ресурси). Всяка област е
 * връзка към нейната секция в таблицата отдолу; `<title>` дава изсказ при посочване.
 */
export function RegionsMap({ counts }: { counts: Map<string, number> }) {
  return (
    <figure className="m-0">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        <svg
          viewBox={OBLAST_VIEWBOX}
          role="img"
          aria-label="Карта на България по области, оцветена по брой държавни предприятия със седалище там"
          className="mx-auto h-auto w-full max-w-3xl"
        >
          <g strokeLinejoin="round">
            {OBLAST_PATHS.map((o) => {
              const count = counts.get(o.name) ?? 0;
              return (
                <a key={o.code} href={`#obl-${o.code}`} aria-label={`${o.name}: ${count} предприятия`}>
                  <path
                    d={o.d}
                    fill={fillFor(count)}
                    stroke="#33475b"
                    strokeWidth={0.8}
                    className="transition-[fill] hover:fill-brand-500"
                  >
                    <title>
                      {o.name}: {count} предприятия
                    </title>
                  </path>
                </a>
              );
            })}
          </g>
          {/* Числа в областите с поне едно предприятие */}
          <g
            fill="#0f172a"
            fontSize="13"
            fontWeight="700"
            textAnchor="middle"
            style={{ paintOrder: "stroke" }}
            stroke="#ffffff"
            strokeWidth={2.4}
            strokeLinejoin="round"
          >
            {OBLAST_PATHS.map((o) => {
              const count = counts.get(o.name) ?? 0;
              if (count === 0) return null;
              return (
                <text key={o.code} x={o.cx} y={o.cy} dominantBaseline="central" pointerEvents="none">
                  {count}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Брой предприятия:</span>
        {BUCKETS.slice()
          .reverse()
          .map((b) => (
            <span key={b.label} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border border-slate-300"
                style={{ backgroundColor: b.fill }}
                aria-hidden
              />
              {b.label}
            </span>
          ))}
        <span className="ml-auto">
          Карта: <span className="font-medium">Natural Earth</span> (обществено достояние)
        </span>
      </figcaption>
    </figure>
  );
}
