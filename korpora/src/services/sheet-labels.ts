/**
 * Номерата на детайлите върху листа от разкроя (витрината и брошурата). Отворите се рисуват над номерата — иначе
 * ореолът на номера би ги скрил, — затова номерът заобикаля отворите и линиите на фрезата: стои възможно най-близо
 * до средата на детайла, там, където нищо не минава през него.
 */

/** Правоъгълник в координатите на чертежа (y надолу). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Отвор на чертежа: център и радиус. */
export interface Hole {
  x: number;
  y: number;
  r: number;
}

/** Права линия на фрезата (канал, контур): краищата и половината от дебелината на щриха. */
export interface Stroke {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  half: number;
}

/** Номерът е с JetBrains Mono: ширина на знака 0,6 em, главна буква и цифра — 0,73 em над базовата линия. */
const ADVANCE = 0.6;
const CAP = 0.73;
/** Ореолът на номера (stroke-width 9 в CSS) и въздух до отвора, линията и ръба на детайла. */
const CLEAR = 12;
/** Най-малкият номер, който още се чете на телефон и на A4; най-големият — за да не надвиква чертежа. */
const MIN_LABEL = 32;
const MAX_LABEL = 64;

const round = (v: number) => Math.round(v * 10) / 10;

/** Точките от `mid` навън на стъпка `step`, които са между `lo` и `hi` (празно, ако там няма място). */
function around(mid: number, lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  if (hi < lo) return out;
  for (let k = 0; ; k += 1) {
    const a = mid - k * step;
    const b = mid + k * step;
    if (a < lo && b > hi) return out;
    if (a >= lo && a <= hi) out.push(a);
    if (k > 0 && b >= lo && b <= hi) out.push(b);
  }
}

/** Колко неща минават през номера с горен ляв ъгъл (x, top), ширина w и височина h (заедно с въздуха). */
function crossings(
  x: number,
  top: number,
  w: number,
  h: number,
  holes: Hole[],
  strokes: Stroke[],
): number {
  const x0 = x - CLEAR;
  const x1 = x + w + CLEAR;
  const y0 = top - CLEAR;
  const y1 = top + h + CLEAR;
  let n = 0;
  for (const c of holes) {
    const dx = Math.max(x0 - c.x, 0, c.x - x1);
    const dy = Math.max(y0 - c.y, 0, c.y - y1);
    if (dx * dx + dy * dy < c.r * c.r) n += 1;
  }
  for (const s of strokes) {
    const sx0 = Math.min(s.x0, s.x1) - s.half;
    const sx1 = Math.max(s.x0, s.x1) + s.half;
    const sy0 = Math.min(s.y0, s.y1) - s.half;
    const sy1 = Math.max(s.y0, s.y1) + s.half;
    if (sx0 < x1 && sx1 > x0 && sy0 < y1 && sy1 > y0) n += 1;
  }
  return n;
}

/**
 * Мястото (базовата линия) и размерът на номера в детайла: най-близо до средата, без отвор и линия на фрезата под
 * него и с въздух до ръба. Ако такова място няма — по-малък номер; накрая средата.
 */
export function labelSpot(
  part: Box,
  text: string,
  holes: Hole[],
  strokes: Stroke[] = [],
): { x: number; y: number; size: number } {
  // само това, което стига до детайла
  const near = (x: number, y: number, pad: number) =>
    x + pad > part.x && x - pad < part.x + part.w && y + pad > part.y && y - pad < part.y + part.h;
  const own = holes.filter((c) => near(c.x, c.y, c.r + CLEAR));
  const lines = strokes.filter(
    (s) =>
      Math.max(s.x0, s.x1) + s.half + CLEAR > part.x &&
      Math.min(s.x0, s.x1) - s.half - CLEAR < part.x + part.w &&
      Math.max(s.y0, s.y1) + s.half + CLEAR > part.y &&
      Math.min(s.y0, s.y1) - s.half - CLEAR < part.y + part.h,
  );
  const start = Math.min(MAX_LABEL, Math.max(MIN_LABEL, Math.min(part.w, part.h) * 0.2));
  for (const size of [start, Math.max(MIN_LABEL, start * 0.75)]) {
    const w = text.length * ADVANCE * size;
    const h = CAP * size;
    const cx = part.x + (part.w - w) / 2;
    const cy = part.y + (part.h - h) / 2;
    // местата за горния ляв ъгъл на номера: от средата навън на стъпки от четвърт буква, с въздух до ръба
    const step = size / 4;
    const xs = around(cx, part.x + CLEAR, part.x + part.w - CLEAR - w, step);
    const tops = around(cy, part.y + CLEAR, part.y + part.h - CLEAR - h, step);
    let best: { x: number; top: number; d: number } | null = null;
    for (const top of tops) {
      for (const x of xs) {
        const d = (x - cx) ** 2 + (top - cy) ** 2;
        if (best && d >= best.d) continue;
        if (crossings(x, top, w, h, own, lines) === 0) best = { x, top, d };
      }
    }
    if (best) return { x: round(best.x), y: round(best.top + h), size: round(size) };
  }
  const w = text.length * ADVANCE * start;
  return {
    x: round(part.x + (part.w - w) / 2),
    y: round(part.y + (part.h + CAP * start) / 2),
    size: round(start),
  };
}
