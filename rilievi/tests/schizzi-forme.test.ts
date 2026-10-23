import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { elementoSchema, pesoDi } from '../src/schizzi/elementi.js';
import { primitiviDi, type ElementoDisegno, type Primitivo } from '../src/schizzi/forme.js';
import { VISTA_SCHIZZO } from '../src/schizzi/model.js';
import { NOMI_SIMBOLI } from '../src/schizzi/simboli.js';

interface Browser {
  primitivesOf: (el: ElementoDisegno) => Primitivo[];
  valido: (el: unknown) => boolean;
  normalizza: (el: unknown) => Record<string, unknown> | null;
  pesoDi: (el: unknown) => number;
  moved: (el: unknown, dx: number, dy: number) => Record<string, unknown>;
  limitMove: (els: unknown[], dx: number, dy: number) => [number, number];
}

/** The browser's geometry and rules (public/js/schizzo-forme.js, schizzo-regole.js), run as the page runs them. */
function browser(): Browser {
  const window: Record<string, unknown> = {};
  const context = { window };
  runInNewContext(readFileSync('public/js/schizzo-forme.js', 'utf8'), context);
  runInNewContext(readFileSync('public/js/schizzo-regole.js', 'utf8'), context);
  // Through JSON, as the page gets the sizes (`schizzi-vista`).
  const view: unknown = JSON.parse(JSON.stringify(VISTA_SCHIZZO));
  const forme = (window.rilieviForme as (v: unknown) => Browser)(view);
  const regole = (window.rilieviRegole as (v: unknown, f: unknown) => Browser)(view, forme);
  return { ...forme, ...regole };
}
/** Values that cross a JSON boundary, compared as plain data. */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** Every number of a value is finite — JSON would hide a NaN as null on both sides. */
function assertFinite(value: unknown, where: string): void {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), where);
  else if (Array.isArray(value)) value.forEach((v) => assertFinite(v, where));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => assertFinite(v, where));
}

/** A seeded pseudo-random source (mulberry32): the same elements on every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elements around every limit of every kind — valid and not (outside, fractions, strings, extra keys). */
function generated(count: number): unknown[] {
  const rnd = seeded(20261023);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T;
  const coord = (max: number) =>
    pick([0, 1, max - 1, max, max + 1, -1, Math.floor(rnd() * max), 10.5, '7']);
  const size = (min: number, max: number) =>
    pick([min - 1, min, min + 1, max, max + 1, Math.floor(rnd() * max), 0.5]);
  const text = () =>
    pick(['1600', ' ', '\u0007', 'a'.repeat(40), 'a'.repeat(41), 'a'.repeat(121), 'Ø 600', '']);
  const out: unknown[] = [];
  for (let i = 0; i < count; i += 1) {
    const base: Record<string, unknown> = { c: pick(['k', 'r', 'b', 'g']), s: pick([1, 2, 2, 3]) };
    if (rnd() < 0.3) base.k = pick([1, 1, 0, true]);
    const t = pick(['p', 'x', 'e', 'a', 'q', 's']);
    let el: Record<string, unknown>;
    if (t === 'p')
      el = {
        t,
        ...base,
        d: pick(['M10 20l5 -3', 'M1400 1000l-5 0z', 'M1401 0l1 1', 'M10 20', 'M0 0l1e3 2']),
      };
    else if (t === 'x') el = { t, c: base.c, s: base.s, x: coord(1400), y: coord(1000), v: text() };
    else if (t === 'e')
      el = { t, ...base, x: coord(1400), y: coord(1000), rx: size(1, 1400), ry: size(1, 1400) };
    else if (t === 'a') {
      el = { t, ...base, x1: coord(1400), y1: coord(1000), x2: coord(1400), y2: coord(1000) };
      if (rnd() < 0.5) el.v = text();
    } else if (t === 'q') {
      el = {
        t,
        c: base.c,
        s: base.s,
        x1: coord(1400),
        y1: coord(1000),
        x2: coord(1400),
        y2: coord(1000),
        o: pick([0, 5, -8, 9, 1400, -1401, 60]),
        v: text(),
      };
      if (rnd() < 0.3) el.m = pick(['r', 'x']);
    } else {
      el = {
        t,
        ...base,
        n: pick([...NOMI_SIMBOLI, 'constructor', 'toString']),
        x: coord(1400),
        y: coord(1000),
        w: size(10, 1400),
        h: size(10, 1400),
        r: pick([0, 1, 2, 3, 4, -1]),
      };
      if (rnd() < 0.3) el.f = pick([1, 0]);
    }
    if (rnd() < 0.05) el.extra = 1;
    out.push(el);
  }
  return out;
}

/** Every kind of element, every symbol and turn, dimensions in every direction. */
function fixtures(): ElementoDisegno[] {
  const out: ElementoDisegno[] = [
    { t: 'p', c: 'k', s: 1, d: 'M10 20l5 -3l0 0' },
    { t: 'p', c: 'b', s: 2, k: 1, d: 'M100 100l200 0l0 150l-200 0z' },
    { t: 'x', c: 'r', s: 2, x: 100, y: 200, v: 'Vano 1600 × 1400' },
    { t: 'e', c: 'k', s: 1, x: 700, y: 500, rx: 120, ry: 120 },
    { t: 'e', c: 'r', s: 2, k: 1, x: 10, y: 990, rx: 300, ry: 80 },
    { t: 'a', c: 'k', s: 1, x1: 500, y1: 500, x2: 300, y2: 400 },
    { t: 'a', c: 'b', s: 2, k: 1, x1: 500, y1: 500, x2: 700, y2: 650, v: 'Guida da sostituire' },
    { t: 'q', c: 'k', s: 1, x1: 100, y1: 900, x2: 1300, y2: 900, o: 0, v: '1600' },
    { t: 'q', c: 'r', s: 1, x1: 700, y1: 500, x2: 820, y2: 500, o: 0, v: 'R 120', m: 'r' },
  ];
  // Dimensions all around the compass, offsets on both sides and inside the gap.
  for (let i = 0; i < 16; i += 1) {
    const a = (i * Math.PI) / 8;
    out.push({
      t: 'q',
      c: 'b',
      s: i % 2 === 0 ? 1 : 2,
      x1: 700,
      y1: 500,
      x2: Math.round(700 + Math.cos(a) * 400),
      y2: Math.round(500 + Math.sin(a) * 400),
      o: [-60, 0, 5, 80][i % 4] ?? 0,
      v: `${1000 + i}`,
    });
  }
  for (const n of NOMI_SIMBOLI) {
    for (const r of [0, 1, 2, 3]) {
      out.push({
        t: 's',
        c: 'k',
        s: r % 2 === 0 ? 1 : 2,
        k: r === 3 ? 1 : undefined,
        n,
        x: 600,
        y: 400,
        w: 333,
        h: 127,
        r,
      });
    }
  }
  return out;
}

describe('the sketch geometry', () => {
  it('draws every element the same in the browser as on the server (print, PDF)', () => {
    const b = browser();
    for (const el of fixtures()) {
      // Through JSON, as the elements reach the browser.
      const json = plain(el) as ElementoDisegno;
      assert.deepEqual(plain(b.primitivesOf(json)), plain(primitiviDi(el)), JSON.stringify(el));
    }
  });

  it('takes in the browser exactly what the server takes, and fixes what the editor makes', () => {
    const b = browser();
    for (const el of generated(6000)) {
      const server = elementoSchema.safeParse(el);
      assert.equal(b.valido(el), server.success, JSON.stringify(el));
      // What the editor brings into shape is always taken, and weighs the same on both sides.
      const fixed = b.normalizza(el);
      if (fixed) assert.ok(elementoSchema.safeParse(fixed).success, JSON.stringify(fixed));
      if (server.success) {
        assert.equal(b.pesoDi(el), pesoDi(server.data));
        const drawn = primitiviDi(server.data);
        assertFinite(drawn, JSON.stringify(el));
        assert.deepEqual(
          plain(b.primitivesOf(plain(server.data) as ElementoDisegno)),
          plain(drawn),
        );
      }
    }
  });

  it('moves a selection only as far as the sheet goes, and the server takes the result', () => {
    const b = browser();
    const els = [
      { t: 'p', c: 'k', s: 1, d: 'M10 20l500 300' },
      { t: 'q', c: 'k', s: 1, x1: 1300, y1: 900, x2: 1390, y2: 990, o: 0, v: '1' },
      { t: 's', c: 'k', s: 1, n: 'cabina', x: 700, y: 500, w: 400, h: 300, r: 1 },
    ];
    for (const [dx, dy] of [
      [-500, -500],
      [500, 500],
      [3, -7],
      [0, 2000],
    ] as const) {
      const [mx, my] = b.limitMove(els, dx, dy);
      for (const el of els)
        assert.ok(elementoSchema.safeParse(b.moved(el, mx, my)).success, `${dx},${dy}`);
    }
    assert.deepEqual(plain(b.limitMove(els, -500, -500)), [-10, -20]);
    assert.deepEqual(plain(b.limitMove(els, 500, 500)), [10, 10]);
  });

  it('puts the dimension text above the line and never upside down', () => {
    const dim = (x2: number, y2: number) =>
      primitiviDi({ t: 'q', c: 'k', s: 1, x1: 500, y1: 500, x2, y2, o: 0, v: '1' }).find(
        (p) => p.p === 't',
      );
    const right = dim(900, 500);
    const left = dim(100, 500);
    const down = dim(500, 900);
    assert.deepEqual([right?.p === 't' && right.a, right?.p === 't' && right.y < 500], [0, true]);
    assert.deepEqual([left?.p === 't' && left.a, left?.p === 't' && left.y < 500], [0, true]);
    // Vertical: read from below, on the left of the line (UNI EN ISO 129-1).
    assert.deepEqual([down?.p === 't' && down.a, down?.p === 't' && down.x < 500], [-90, true]);
  });

  it('points the arrowheads at the measured points and the arrow at its tip', () => {
    const tips = primitiviDi({
      t: 'q',
      c: 'k',
      s: 1,
      x1: 100,
      y1: 100,
      x2: 500,
      y2: 100,
      o: 0,
      v: '4',
    })
      .filter((p) => p.p === 'f')
      .map((p) => (p.p === 'f' ? p.d.split('L')[0] : ''));
    assert.deepEqual(tips, ['M100 100', 'M500 100']);
    const arrow = primitiviDi({ t: 'a', c: 'k', s: 1, x1: 50, y1: 60, x2: 300, y2: 60 });
    assert.equal(arrow[1]?.p === 'f' && arrow[1].d.split('L')[0], 'M50 60');
  });

  it('stretches and turns a symbol inside its box', () => {
    const corners = (r: number) => {
      const [outline] = primitiviDi({
        t: 's',
        c: 'k',
        s: 1,
        n: 'cabina',
        x: 500,
        y: 400,
        w: 200,
        h: 100,
        r,
      });
      return outline?.p === 'l' ? outline.d : '';
    };
    assert.equal(corners(0), 'M400 350L600 350L600 450L400 450Z');
    // A quarter turn: the 200 x 100 box stands 100 x 200 around the same centre.
    assert.equal(corners(1), 'M550 300L550 500L450 500L450 300Z');
  });
});
