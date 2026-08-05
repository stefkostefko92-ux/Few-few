import { countryShape, MAP_HEIGHT, MAP_WIDTH } from "@/lib/world-map.generated";

/**
 * Локатор на света.
 *
 * Съзнателно е карта на ДЪРЖАВА, а не карта с игличка. Причината е в числата:
 * геолокацията по IP познава държавата в ~99% от случаите, но града — в около
 * две трети, и то „в рамките на 50 км“. Игличка върху град рисува увереност,
 * каквато данните нямат; оцветена държава рисува точно толкова, колкото знаем.
 *
 * Силуетът идва от статичния `/world-mask.svg` през CSS маска: браузърът го
 * сваля веднъж и го кешира, цветът се взима от темата, а в самия HTML влиза
 * само пътят на ЕДНА държава (стотина байта). Нула външни доставчици на
 * плочки — значи и нула изтичане на това какво си търсил.
 */
export default function WorldMap({
  code,
  label,
}: {
  code: string;
  /** Как се казва мястото на български — влиза в достъпното описание. */
  label: string;
}) {
  const shape = countryShape(code);
  if (!shape) return null;

  return (
    <figure className="mt-4">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-border bg-surface-raised"
        style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
        role="img"
        aria-label={`Карта на света с откроена държава: ${label}`}
      >
        {/* Континентите — статична, кеширана маска, оцветена от темата. */}
        <div className="world-silhouette absolute inset-0" />

        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <path d={shape.d} fill="var(--c-accent)" fillRule="evenodd" fillOpacity="0.85" />
          {/* Кръгът НЕ е местоположение — той е приблизителният център на
              държавата. Затова е кух пръстен, а не игличка: пръстенът се чете
              като „някъде тук“, игличката — като „точно тук“. */}
          <circle
            cx={shape.cx}
            cy={shape.cy}
            r="9"
            fill="none"
            stroke="var(--c-accent-strong)"
            strokeWidth="2.5"
          />
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-text-faint">
        Откроена е цялата държава, защото толкова знаем. Пръстенът е географският център на държавата,
        а не местоположение на адреса.
      </figcaption>
    </figure>
  );
}

/** Градусите на центъра на държавата — за картата „координати“ в резултата. */
export function countryCentre(code: string): { lat: number; lon: number } | null {
  const shape = countryShape(code);
  return shape ? { lat: shape.lat, lon: shape.lon } : null;
}

/** Форматира градуси в човешкия запис „42.78° С, 25.20° И“. */
export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? "С" : "Ю";
  const ew = lon >= 0 ? "И" : "З";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}
