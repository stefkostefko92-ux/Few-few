/**
 * Тренд-линия за карта с число (label · стойност · делта · тренд). Чиста функция:
 * числа → SVG, без библиотека и без скрипт на страницата (строгият CSP не пуска външни ресурси).
 *
 * Спазва мерките на нашата визуализация: линия 2px със заоблени краища, площ под нея като
 * ~12% измиване, крайна точка с пръстен в цвета на повърхността, никакви етикети по всяка точка.
 * Една серия — затова няма легенда; какво е показано казва заглавието на картата.
 */
export interface SparkPoint {
  /** Стойност по y; `null` е дупка в данните и не се рисува. */
  value: number | null;
  /** Какво пише при посочване с мишката (нативен SVG tooltip, без скрипт). */
  label: string;
}

export interface SparklineOptions {
  width?: number;
  height?: number;
  /** Колко точки най-много да се покажат — по-старите се изрязват. */
  maxPoints?: number;
}

export interface Sparkline {
  svg: string;
  /** Последната известна стойност — числото над линията. */
  last: number | null;
  /** Разлика спрямо първата известна стойност; `null` при по-малко от две точки. */
  delta: number | null;
}

const PADDING = 4;

function escapeText(value: string): string {
  return value.replace(/[<>&"]/g, (char) =>
    char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '&' ? '&amp;' : '&quot;',
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Празен или едноточков ред НЕ се рисува като линия — една точка не е тренд.
 * Връща `svg: ''`, а извикващият показва само числото.
 */
export function sparkline(points: SparkPoint[], options: SparklineOptions = {}): Sparkline {
  const { width = 260, height = 64, maxPoints = 60 } = options;
  const visible = points.slice(-maxPoints);
  const known = visible.filter(
    (point): point is SparkPoint & { value: number } => point.value !== null,
  );
  const last = known.length ? known[known.length - 1]!.value : null;
  const delta = known.length >= 2 ? known[known.length - 1]!.value - known[0]!.value : null;
  if (known.length < 2) return { svg: '', last, delta };

  const values = known.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerWidth = width - PADDING * 2;
  const innerHeight = height - PADDING * 2;
  const stepX = innerWidth / (visible.length - 1 || 1);
  // Редица без разлика няма къде да се мащабира — ляга по средата, не на дъното.
  const yOf = (value: number): number =>
    span === 0
      ? round(height / 2)
      : round(PADDING + innerHeight - ((value - min) / span) * innerHeight);
  const coords = visible.map((point, index) => ({
    ...point,
    x: round(PADDING + index * stepX),
    y: point.value === null ? null : yOf(point.value),
  }));
  const drawn = coords.filter(
    (point): point is (typeof coords)[number] & { y: number } => point.y !== null,
  );

  const line = drawn.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
  const area = `${line} L${drawn[drawn.length - 1]!.x} ${height} L${drawn[0]!.x} ${height} Z`;
  const end = drawn[drawn.length - 1]!;
  // Прозрачни мишени за посочване — по-широки от самата точка, за да са хващаеми.
  const hits = drawn
    .map(
      (point) =>
        `<circle class="spark-hit" cx="${point.x}" cy="${point.y}" r="${round(Math.max(stepX / 2, 5))}"><title>${escapeText(point.label)}</title></circle>`,
    )
    .join('');

  const svg = [
    // Пропорционално мащабиране: разтегнатият viewBox би направил крайната точка елипса.
    // Числата са и в таблицата под картата, затова самата линия е декоративна за четеца.
    `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">`,
    `<path class="spark-area" d="${area}"/>`,
    `<path class="spark-line" d="${line}"/>`,
    `<circle class="spark-end" cx="${end.x}" cy="${end.y}" r="4"/>`,
    hits,
    '</svg>',
  ].join('');

  return { svg, last, delta };
}
