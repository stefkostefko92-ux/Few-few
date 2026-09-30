// Symbols of fixed paper size: the spaces for the maintenance person (● free area on the car roof, ▲ refuge space
// crouching, ■ lying), the overtravels of the car (circle with quadrants, half circle), plumb lines, junction boxes,
// the shaft light; and the arrow of a section line. All in paper millimetres around the given centre.
import type { SymbolName } from './model';
import { STYLES } from './style';
import type { Pt, Shape } from './types';

const DARK = { k: 'solid', ink: 'dark' } as const;
const PAPER = { k: 'solid', ink: 'paper' } as const;

function sector(c: Pt, r: number, a0: number, a1: number): Pt[] {
  const pts: Pt[] = [c];
  for (let i = 0; i <= 12; i++) {
    const a = ((a0 + ((a1 - a0) * i) / 12) * Math.PI) / 180;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

export function symbol(sym: SymbolName, [x, y]: Pt, size = 3.4): Shape[] {
  const h = size / 2, thin = { ink: 'ink', w: 0.18 } as const;
  switch (sym) {
    case 'dot':
      return [{ t: 'circle', c: [x, y], r: h, fill: DARK }];
    case 'tri':
      return [{ t: 'path', pts: [[x - h, y - h * 0.85], [x + h, y - h * 0.85], [x, y + h * 0.9]], closed: true, fill: DARK }];
    case 'square':
      return [
        { t: 'path', pts: [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]], closed: true, fill: DARK },
        { t: 'line', a: [x - h * 0.8, y + h * 0.8], b: [x + h * 0.8, y - h * 0.8], s: { ink: 'paper', w: 0.3 } },
      ];
    case 'overUp':
      return [
        { t: 'circle', c: [x, y], r: h, fill: PAPER, s: thin },
        { t: 'path', pts: sector([x, y], h, 0, 90), closed: true, fill: DARK },
        { t: 'path', pts: sector([x, y], h, 180, 270), closed: true, fill: DARK },
        { t: 'line', a: [x - h, y], b: [x + h, y], s: thin },
        { t: 'line', a: [x, y - h], b: [x, y + h], s: thin },
      ];
    case 'overDown':
      return [
        { t: 'circle', c: [x, y], r: h, fill: PAPER, s: thin },
        { t: 'path', pts: sector([x, y], h, 0, 180), closed: true, fill: DARK },
        { t: 'line', a: [x - h, y], b: [x + h, y], s: thin },
      ];
    case 'plumb':
      return [
        { t: 'line', a: [x - h * 0.7, y], b: [x + h * 0.7, y], s: { ink: 'axis', w: 0.22 } },
        { t: 'line', a: [x, y - h * 0.7], b: [x, y + h * 0.7], s: { ink: 'axis', w: 0.22 } },
      ];
    case 'box': {
      const q = h * 0.55;
      return [
        { t: 'path', pts: [[x - q, y - q], [x + q, y - q], [x + q, y + q], [x - q, y + q]], closed: true, s: thin, fill: PAPER },
        { t: 'line', a: [x - q, y - q], b: [x + q, y + q], s: thin },
        { t: 'line', a: [x - q, y + q], b: [x + q, y - q], s: thin },
      ];
    }
    case 'light': {
      const r = h * 0.6;
      return [
        { t: 'circle', c: [x, y], r, s: thin, fill: PAPER },
        { t: 'line', a: [x - r, y], b: [x + r, y], s: thin },
        { t: 'line', a: [x, y - r], b: [x, y + r], s: thin },
        ...[-45, 0, 45].map((a): Shape => {
          const t = ((90 + a) * Math.PI) / 180;
          return { t: 'line', a: [x + Math.cos(t) * r * 1.35, y + Math.sin(t) * r * 1.35], b: [x + Math.cos(t) * r * 1.9, y + Math.sin(t) * r * 1.9], s: thin };
        }),
      ];
    }
  }
}

/** Filled arrowhead with its tip at `tip`, pointing along the angle `dir` [rad]. */
export function arrowhead(tip: Pt, dir: number, len = 2.2, half = 0.42): Shape {
  const [x, y] = tip, cx = Math.cos(dir), cy = Math.sin(dir);
  return { t: 'path', pts: [[x, y], [x - len * cx - half * cy, y - len * cy + half * cx], [x - len * cx + half * cy, y - len * cy - half * cx]], closed: true, fill: { k: 'solid', ink: 'ink' } };
}

/** Section mark: a short heavy stroke, the arrow of the direction of view and the letter. `dir` is the viewing direction. */
export function sectionMark(at: Pt, dir: 'up' | 'down' | 'left' | 'right', letter: string): Shape[] {
  const [x, y] = at, v: Pt = dir === 'up' ? [0, 1] : dir === 'down' ? [0, -1] : dir === 'left' ? [-1, 0] : [1, 0];
  const n: Pt = [-v[1], v[0]], L = 6;
  return [
    { t: 'line', a: [x - n[0] * 2.4, y - n[1] * 2.4], b: [x + n[0] * 2.4, y + n[1] * 2.4], s: STYLES.heavy },
    { t: 'line', a: [x, y], b: [x + v[0] * L, y + v[1] * L], s: STYLES.thin },
    arrowhead([x + v[0] * L, y + v[1] * L], Math.atan2(v[1], v[0]), 2.4, 0.9),
    { t: 'text', at: [x + v[0] * (L + 2.6) - 0.9, y + v[1] * (L + 2.6) - 0.9], text: letter, size: 2.8, align: 'l', cond: true },
  ];
}
