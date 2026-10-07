// The landing page's story as numbers (landing/timeline.js): where the reader is from the steps on screen, what the
// scene shows at each moment, and the pose math that lays every part face A up on its sheet without mirroring it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserModule } from './editor-modules.js';

type Vec = [number, number, number];
type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
interface Frame {
  eu: Axis;
  ev: Axis;
  n: Axis;
}
interface State {
  open: number;
  explode: number;
  fly: number;
  bed: number;
  hardware: number;
  path: number;
}
interface Timeline {
  storyT(centres: number[], line: number): number;
  stepOf(t: number): number;
  storyState(t: number): State;
  partFlight(fly: number, index: number, count: number, spread?: number): number;
  arc(k: number): number;
  flatBasis(rot: boolean): { u: Vec; v: Vec; n: Vec };
  flatRotation(frame: Frame, rot: boolean): number[];
  sheetPoint(origin: Vec, x: number, y: number, scale: number): Vec;
  sheetLayout(
    sheets: Array<{ w: number; h: number }>,
    perRow?: number,
    gap?: number,
  ): { origins: Array<{ x: number; y: number }>; width: number; height: number };
  frameWatch(): { frame(now: number, moves: boolean): boolean; pause(): void };
}

const tl = await browserModule<Timeline>('landing/timeline.js', [
  'storyT',
  'stepOf',
  'storyState',
  'partFlight',
  'arc',
  'flatBasis',
  'flatRotation',
  'sheetPoint',
  'sheetLayout',
  'frameWatch',
]);

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const grid = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

const AXES: Record<Axis, Vec> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};
// + 0 turns −0 into 0: the strict deep equality below tells them apart
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1] + 0,
  a[2] * b[0] - a[0] * b[2] + 0,
  a[0] * b[1] - a[1] * b[0] + 0,
];
const apply = (m: number[], v: Vec): Vec =>
  [0, 1, 2].map((r) => m[r * 3]! * v[0] + m[r * 3 + 1]! * v[1] + m[r * 3 + 2]! * v[2] + 0) as Vec;
const det = (m: number[]) => {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
};
// every frame the engine can give a part: eu × ev = n (engine/panel.js derives ev so)
const FRAMES: Frame[] = [];
for (const eu of Object.keys(AXES) as Axis[])
  for (const ev of Object.keys(AXES) as Axis[]) {
    const n = (Object.keys(AXES) as Axis[]).find(
      (k) => cross(AXES[eu], AXES[ev]).join() === AXES[k].join(),
    );
    if (n) FRAMES.push({ eu, ev, n });
  }

test('t: 0..3 with a step centre on the reading line, linear between, −1 above and 4 past the steps', () => {
  const centres = [100, 600, 1100, 1600];
  close(tl.storyT(centres, 100), 0);
  close(tl.storyT(centres, 350), 0.5);
  close(tl.storyT(centres, 600), 1);
  close(tl.storyT(centres, 1600), 3);
  close(tl.storyT(centres, 1850), 3.5);
  close(tl.storyT(centres, 2100), 4);
  close(tl.storyT(centres, 9000), 4);
  close(tl.storyT(centres, -150), -0.5);
  close(tl.storyT(centres, -9000), -1);
  close(tl.storyT([], 300), -1);
  // the first step may be shorter than the rest: each gap is its own
  close(tl.storyT([100, 300, 900], 200), 0.5);
  close(tl.storyT([100, 300, 900], 600), 1.5);
});

test('t never runs backwards while the reader scrolls on', () => {
  const centres = [1180, 1650, 2350, 3050];
  let last = -Infinity;
  for (const line of grid(-2000, 6000, 7)) {
    const t = tl.storyT(centres, line);
    assert.ok(t >= last, `t fell from ${last} to ${t} at ${line}`);
    assert.ok(t >= -1 && t <= 4);
    last = t;
  }
});

test('the step shown is the nearest one, 1..4', () => {
  assert.deepEqual(
    [-1, -0.49, 0.49, 0.5, 1.2, 2.5, 3.9, 4].map(tl.stepOf),
    [1, 1, 1, 2, 2, 4, 4, 4],
  );
});

test('the story: the closed kitchen, the doors, the explosion, the flight, then the router', () => {
  const at = tl.storyState;
  assert.deepEqual(at(-1), { open: 0, explode: 0, fly: 0, bed: 0, hardware: 1, path: 0 });
  for (const t of grid(-1, 4, 0.01)) {
    const s = at(t);
    for (const [k, v] of Object.entries(s)) assert.ok(v >= 0 && v <= 1, `${k} = ${v} at t = ${t}`);
  }
  // step 1 opens the doors wide; they are shut again before the parts leave
  close(at(0.35).open, 1);
  for (const t of grid(0.85, 4, 0.05)) close(at(t).open, 0);
  // the explosion is complete before the first part takes off
  close(at(1.4).explode, 1);
  close(at(1.5).fly, 0);
  // the bed is there before the first part lands on it
  for (const t of grid(1.5, 2.6, 0.01)) {
    const s = at(t);
    if (tl.partFlight(s.fly, 0, 87) >= 1 - 1e-9) close(s.bed, 1);
  }
  // hardware is gone once the parts are in the air
  for (const t of grid(1.6, 4, 0.05)) close(at(t).hardware, 0);
  // the router starts only once every part lies on its sheet, and finishes within the steps' reach
  close(at(2.8).path, 0);
  close(at(2.8).fly, 1);
  close(at(3.45).path, 1);
  assert.deepEqual(at(4), { open: 0, explode: 1, fly: 1, bed: 1, hardware: 0, path: 1 });
});

test('the parts take off one after another and all land by the end of the flight', () => {
  const n = 87;
  for (let i = 0; i < n; i++) {
    close(tl.partFlight(0, i, n), 0);
    close(tl.partFlight(1, i, n), 1);
  }
  close(tl.partFlight(0.55, n - 1, n), 0); // the last leaves when the spread is over
  close(tl.partFlight(0.45, 0, n), 1); // the first has landed by then
  close(tl.partFlight(0.45, 0, 1), 1); // a lone part leaves at once and lands when a first one would
  for (const fly of grid(0, 1, 0.02))
    for (let i = 1; i < n; i++)
      assert.ok(
        tl.partFlight(fly, i - 1, n) >= tl.partFlight(fly, i, n),
        `part ${i} overtook at ${fly}`,
      );
});

test('the flight arc is flat at both ends and highest half way', () => {
  close(tl.arc(0), 0);
  close(tl.arc(0.5), 1);
  close(tl.arc(1), 0, 1e-12);
  close(tl.arc(-1), 0);
  close(tl.arc(2), 0, 1e-12);
});

test('every part lands face A up, along the sheet as nested, and is never mirrored', () => {
  assert.equal(FRAMES.length, 24);
  for (const rot of [false, true]) {
    const d = tl.flatBasis(rot);
    // the sheet's own frame is right-handed too: u × v = n, face A up
    assert.deepEqual(cross(d.u, d.v), d.n);
    assert.deepEqual(d.n, [0, 1, 0]);
    for (const frame of FRAMES) {
      const m = tl.flatRotation(frame, rot);
      close(det(m), 1);
      assert.deepEqual(apply(m, AXES[frame.eu]), d.u, `${JSON.stringify(frame)} rot ${rot}: u`);
      assert.deepEqual(apply(m, AXES[frame.ev]), d.v, `${JSON.stringify(frame)} rot ${rot}: v`);
      assert.deepEqual(
        apply(m, AXES[frame.n]),
        [0, 1, 0],
        `${JSON.stringify(frame)} rot ${rot}: n`,
      );
    }
  }
});

test('the sheet frame matches cam.js: u along the sheet x, or along its y when rotated', () => {
  // cam.js: (u, v) → (x + u, y + v); rotated (x + W − v, y + u); the sheet's y runs to world −z
  assert.deepEqual(tl.flatBasis(false).u, [1, 0, 0]);
  assert.deepEqual(tl.flatBasis(false).v, [0, 0, -1]);
  assert.deepEqual(tl.flatBasis(true).u, [0, 0, -1]);
  assert.deepEqual(tl.flatBasis(true).v, [-1, 0, 0]);
  const p = tl.sheetPoint([1, 0, 2], 1000, 500, 0.001);
  close(p[0], 2);
  close(p[1], 0);
  close(p[2], 1.5);
});

test('the sheets lie in rows of three with a gap, each origin from the first one', () => {
  const six = Array.from({ length: 6 }, () => ({ w: 2800, h: 2070 }));
  const layout = tl.sheetLayout(six, 3, 260);
  assert.deepEqual(layout.origins, [
    { x: 0, y: 0 },
    { x: 3060, y: 0 },
    { x: 6120, y: 0 },
    { x: 0, y: 2330 },
    { x: 3060, y: 2330 },
    { x: 6120, y: 2330 },
  ]);
  assert.equal(layout.width, 3 * 2800 + 2 * 260);
  assert.equal(layout.height, 2 * 2070 + 260);
  const one = tl.sheetLayout([{ w: 2800, h: 2070 }]);
  assert.equal(one.width, 2800);
  assert.equal(one.height, 2070);
  // mixed sizes keep one grid: the largest sheet sets the pitch
  const mixed = tl.sheetLayout([
    { w: 2800, h: 2070 },
    { w: 2440, h: 1220 },
  ]);
  assert.deepEqual(mixed.origins[1], { x: 3060, y: 0 });
});

// Feeds a watch frame by frame: `cost` is how long a frame that moves the scene takes (or a function of the frame's
// index), 16.7 ms one that does not; `moving(i)` says which frames move. Returns the frame at which the watch gave up,
// or -1.
function run(
  cost: number | ((i: number) => number),
  frames: number,
  moving: (i: number) => boolean = () => true,
) {
  const watch = tl.frameWatch();
  let now = 1000;
  for (let i = 0; i < frames; i++) {
    const moves = moving(i);
    if (watch.frame(now, moves)) return i;
    now += moves ? (typeof cost === 'number' ? cost : cost(i)) : 16.7;
  }
  return -1;
}

test('a device that keeps up keeps the live scene, whatever the scroll does', () => {
  assert.equal(run(16.7, 600), -1);
  assert.equal(run(40, 600), -1);
  assert.equal(
    run(16.7, 600, (i) => i % 3 === 0),
    -1,
  );
});

test('a slow device gets the stills after 45 frames that moved, even when the scroll comes in steps', () => {
  // every frame moves: the first is the warm-up, the next 45 are judged
  assert.equal(run(100, 600), 46);
  // a step of the wheel, then a frame without movement, as the reader (or the e2e run) scrolls
  const stepped = run(100, 600, (i) => i % 2 === 0);
  assert.ok(stepped > 46 && stepped < 100, `gave up at ${stepped}`);
  // judged are the gaps after frames 1..45: 23 of them slow is too slow, 22 is not
  assert.equal(
    run((i) => (i % 2 === 1 ? 100 : 16.7), 600),
    46,
  );
  assert.equal(
    run((i) => (i % 2 === 0 ? 100 : 16.7), 600),
    -1,
  );
});

test('a crawling device gets the stills within the first moving frames', () => {
  assert.equal(run(400, 600), 4);
});

test('the first moving frame (shaders, first shadows) and a hidden page do not count', () => {
  const watch = tl.frameWatch();
  let now = 1000;
  assert.equal(watch.frame(now, true), false);
  // the warm-up frame took two seconds: not counted
  assert.equal(watch.frame((now += 2000), true), false);
  // two frames crawl…
  assert.equal(watch.frame((now += 300), true), false);
  assert.equal(watch.frame((now += 300), true), false);
  // …then the page is hidden for a minute: the gap is not a third crawling frame
  watch.pause();
  assert.equal(watch.frame((now += 60000), true), false);
  for (let k = 0; k < 100; k++) assert.equal(watch.frame((now += 16.7), true), false);
});
