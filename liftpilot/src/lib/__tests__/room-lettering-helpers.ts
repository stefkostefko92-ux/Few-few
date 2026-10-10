// What the tests of the machine room's lettering share (room-lettering*.test.ts): installations built from the default
// one, the drawing set of one, the sheet's own views of its machine room (the layout, the machine and the area the set
// takes them with), and the letterings as drawn — each turned as it is, a reference as the square round its circle, a
// dimension's value marked (the kernel places those: dims.ts) — with how deep two of them overlap.
import assert from 'node:assert/strict';
import { drawingArea, type Entity, type Pt, type Shape } from '@/drawing';
import { textQuad } from '@/drawing/metrics';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '@/lib/lift/marks';
import { analyse } from '@/lib/present/analysis';
import { buildTavole, inset, setLayout } from '@/lib/tavole/build';
import { storedInput } from '@/lib/tavole/compose';
import { machineOf, roomView, sheetLayoutOf, type View } from '@/lib/tavole/views';

type Room = NonNullable<LiftInputs['shaft']['room']>;
export const base = (): LiftInputs => newLift();
const room = (L: LiftInputs): Room => L.shaft.room as Room;
export const withRoom = (L: LiftInputs, r: Partial<Room>): LiftInputs => ({ ...L, shaft: { ...L.shaft, room: { ...room(L), ...r } } });
export const calc = (L: LiftInputs, c: Record<string, string>): LiftInputs => ({ ...L, calc: { ...L.calc, ...c } });
export const cw = (L: LiftInputs, side: 'rear' | 'left' | 'right', cwPos?: number): LiftInputs =>
  ({ ...L, shaft: { ...L.shaft, cw: side, ...(cwPos !== undefined ? { plan: { ...(L.shaft.plan ?? {}), cwPos } } : {}) } });

/** The stored input of the drawing set of an installation. */
function inputOf(inp: LiftInputs) {
  const d = deriveLift(inp), marks = valueMarks(inp.auto, d, d.bottom, d.collaudo), project = { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: '', client: '' };
  const x = storedInput(d.values, d.layout, { number: '26-001', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] }, null, marks);
  assert.ok(x);
  return x;
}

/** The drawing set of an installation. */
export const sheets = (inp: LiftInputs) => buildTavole(inputOf(inp));

/** The machine room's plan and section B-B as sheets 8 and 9 take them (build.ts roomSheet). */
export function roomViews(inp: LiftInputs): { plan: View & { entities: Entity[] }; section: View & { entities: Entity[] } } {
  const x = inputOf(inp), L0 = setLayout(x), a = analyse(x.values), M = machineOf(a, x.plant, L0, x.marks?.catalog ?? null), L = sheetLayoutOf(a, L0, M, null);
  const area = inset(drawingArea(true), 8, 8, 8, 8), plan = roomView(L, M, 'plan', area), section = roomView(L, M, 'section', area);
  assert.ok(plan && section);
  return { plan, section };
}

/** How deep two convex outlines overlap (separating axes) [mm]; 0 apart. */
export function depth(A: readonly Pt[], B: readonly Pt[]): number {
  let best = Infinity;
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n: Pt = [a[1] - b[1], b[0] - a[0]], l = Math.hypot(n[0], n[1]) || 1;
    const pa = A.map((p) => (p[0] * n[0] + p[1] * n[1]) / l), pb = B.map((p) => (p[0] * n[0] + p[1] * n[1]) / l);
    const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (o <= 0) return 0;
    best = Math.min(best, o);
  }
  return best;
}

/** A lettering as drawn: its text, its outline, whether it is a dimension's value. */
export interface Lettering {
  text: string;
  q: readonly Pt[];
  dim: boolean;
}

/** The letterings of a view or a sheet as drawn: each text turned as it is, a reference (a circle on paper with its
 *  letters in its middle: view.ts tag) as the square round its circle; `dims` the dimensions' values among them. */
export function letterings(shapes: readonly Shape[], dims: ReadonlySet<Shape> = new Set()): Lettering[] {
  const mid = (s: Shape, c: Shape): boolean => s.t === 'text' && c.t === 'circle' && Math.hypot(s.at[0] - c.c[0], s.at[1] + s.size * 0.36 - c.c[1]) < 0.5;
  const tags = shapes.flatMap((c) => {
    if (c.t !== 'circle' || c.fill?.k !== 'solid' || c.fill.ink !== 'paper' || c.r < 2.4 - 1e-9) return [];
    const t = shapes.find((s) => mid(s, c));
    return t?.t === 'text' ? [{ c, t }] : [];
  });
  return [
    ...shapes.flatMap((s) => (s.t === 'text' && !tags.some((g) => g.t === s) ? [{ text: s.text, q: textQuad(s), dim: dims.has(s) }] : [])),
    ...tags.map(({ c, t }) => ({ text: `(${t.text})`, dim: false, q: [[c.c[0] - c.r, c.c[1] - c.r], [c.c[0] + c.r, c.c[1] - c.r], [c.c[0] + c.r, c.c[1] + c.r], [c.c[0] - c.r, c.c[1] + c.r]] as const })),
  ];
}

/** The pairs of letterings that overlap (deeper than 0,4 mm), those `keep` lets through. */
export function overlapsOf(ls: readonly Lettering[], keep: (a: Lettering, b: Lettering) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const [i, a] of ls.entries()) for (const b of ls.slice(i + 1)) if (depth(a.q, b.q) > 0.4 && keep(a, b)) out.push(`«${a.text}» × «${b.text}»`);
  return out;
}

export const overlaps = (shapes: readonly Shape[]): string[] => overlapsOf(letterings(shapes));

/** The letterings of a view, its dimensions' values marked (the shapes of its chains). */
export function viewLetterings(v: View & { entities: readonly Entity[] }): Lettering[] {
  const dims = new Set(v.r.parts.flatMap((p, i) => (v.entities[i]?.e === 'chain' ? p : [])));
  return letterings(v.r.shapes, dims);
}
