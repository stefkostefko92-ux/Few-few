// The landing page's story as numbers, without three.js: where the reader is (t, from the scroll position of the four
// "how it works" steps) and what that means for the scene — doors, explosion, the flight of the parts onto the sheets,
// the router path. Kept apart from the scene so the mapping and the pose math are tested on their own.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
// smoothstep: eases in and out, flat at both ends
export const smooth = (x) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
export const ramp = (t, a, b) => smooth((t - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;

// t from the steps on screen. `centres` are the viewport y of each step's centre (top to bottom), `line` the reading
// line. A step's centre on the line is t = 0, 1, 2, 3; between two steps t grows linearly; above the first step (the
// hero) it runs down to -1; past the last it goes on to 4 over one more step's height, so the router path can finish.
export function storyT(centres, line) {
  const n = centres.length;
  if (!n) return -1;
  const gap = n > 1 ? Math.max(1, centres[1] - centres[0]) : 600;
  if (line < centres[0]) return Math.max(-1, -(centres[0] - line) / gap);
  for (let i = 0; i < n - 1; i++)
    if (line < centres[i + 1])
      return i + (line - centres[i]) / Math.max(1, centres[i + 1] - centres[i]);
  const last = n > 1 ? Math.max(1, centres[n - 1] - centres[n - 2]) : gap;
  return Math.min(n, n - 1 + (line - centres[n - 1]) / last);
}

// The step a t belongs to (1-based, as the steps are numbered on the page).
export const stepOf = (t) => Math.min(4, Math.max(1, Math.floor(t + 0.5) + 1));

// What the scene shows at t. Every value runs 0..1.
//   open      doors swing open around step 1 and close again before the explosion
//   explode   the parts move apart along the engine's explode vectors (step 2)
//   fly       the parts leave the furniture for their places on the sheets (step 3)
//   bed       the machine bed and the sheets fade in under them
//   hardware  hinges, handles, legs and the worktop: on until the parts take off
//   path      share of the router path of sheet 1 already cut (step 4)
export function storyState(t) {
  return {
    open: ramp(t, -0.35, 0.3) * (1 - ramp(t, 0.45, 0.85)),
    explode: ramp(t, 0.55, 1.4),
    fly: ramp(t, 1.5, 2.55),
    bed: ramp(t, 1.45, 1.9),
    hardware: 1 - ramp(t, 1.42, 1.6),
    path: ramp(t, 2.8, 3.45),
  };
}

// One part's own share of the flight: the parts take off one after another over `spread` of the whole flight, each
// taking the rest, so the first are on the sheet while the last are still leaving.
export function partFlight(fly, index, count, spread = 0.55) {
  const start = count > 1 ? (index / (count - 1)) * spread : 0;
  return smooth((fly - start) / (1 - spread));
}

// Height of the arc a part flies along, as a share of its peak: 0 at both ends, 1 half way.
export const arc = (k) => Math.sin(Math.PI * clamp01(k));

const AXES = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

// Where the part's own axes go when it lies on the CNC table: face A up (+y), its length (u) along the sheet's x
// (world +x) — or, for a rotated placement, along the sheet's y — and the sheet's y runs to world −z, so u × v = n stays
// right-handed and the part is never mirrored (the same frame cam.js cuts in: (u, v) → (x + u, y + v), rotated
// (x + W − v, y + u)).
export function flatBasis(rot) {
  return rot
    ? { u: [0, 0, -1], v: [-1, 0, 0], n: [0, 1, 0] }
    : { u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] };
}

// The rotation (row-major 3 × 3) that turns the part from its place in the furniture to its place on the sheet:
// R = D · Sᵀ, where the columns of S are the part's u, v, n in the furniture and the columns of D the same on the sheet.
export function flatRotation(frame, rot) {
  const s = [AXES[frame.eu], AXES[frame.ev], AXES[frame.n]];
  const d = flatBasis(rot);
  const dst = [d.u, d.v, d.n];
  const m = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      m.push(dst[0][r] * s[0][c] + dst[1][r] * s[1][c] + dst[2][r] * s[2][c]);
  return m;
}

// A point of a sheet (mm, sheet coordinates) on the floor of the scene (m): the sheet's x to world x, its y to world −z.
export function sheetPoint(origin, x, y, scale) {
  return [origin[0] + x * scale, origin[1], origin[2] - y * scale];
}

// The sheets side by side in rows of `perRow`, with `gap` mm between them; returns each sheet's (x, z) origin in mm
// relative to the first one's, and the size of the whole layout.
export function sheetLayout(sheets, perRow = 3, gap = 260) {
  const w = Math.max(...sheets.map((s) => s.w));
  const h = Math.max(...sheets.map((s) => s.h));
  const origins = sheets.map((_, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    return { x: col * (w + gap), y: row * (h + gap) };
  });
  const cols = Math.min(perRow, sheets.length);
  const rows = Math.ceil(sheets.length / perRow);
  return { origins, width: cols * w + (cols - 1) * gap, height: rows * h + (rows - 1) * gap };
}

// The frame-rate watch that gives a slow device's stage back to the stills: half of the first `judge` frames that
// moved the scene slower than `slowMs` (~14 fps), or — much slower — three of the first four over `crawlMs` (~4 fps).
// A frame's cost shows in the gap to the next one, whether that one moves again or not. The very first moving frame
// is not counted: it compiles the shaders and draws the first shadows, which says nothing about the pace after it.
export function frameWatch({ judge = 45, slowMs = 70, crawlMs = 250 } = {}) {
  let prev = 0;
  let moved = false;
  let warm = false;
  let frames = 0;
  let slow = 0;
  let crawl = 0;
  return {
    // now: the frame's time (ms); moves: whether this frame moves the scene. True when the device is too slow.
    frame(now, moves) {
      let tooSlow = false;
      if (moved && prev) {
        if (!warm) warm = true;
        else if (frames < judge) {
          frames += 1;
          if (now - prev > slowMs) slow += 1;
          if (now - prev > crawlMs) crawl += 1;
          tooSlow = (frames <= 4 && crawl >= 3) || (frames === judge && slow / frames > 0.5);
        }
      }
      prev = now;
      moved = moves;
      return tooSlow;
    },
    // a hidden page or stage: the gap until it shows again says nothing about the device
    pause() {
      prev = 0;
    },
  };
}
