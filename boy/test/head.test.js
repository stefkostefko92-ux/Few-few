// The head bake: open eyes that show the iris and close in a blink, lids (and lashes) that never
// cut into the eyeballs, lashes that ride the lid margins, lips that meet at rest and part with
// the jaw, a Warden who differs from Ser Aldric everywhere but around the eyes, and arrays the
// renderer can load as they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { processHead, MORPHS } from '../bake/head.mjs';
import { eyeFront } from '../src/eye-shape.js';
import { EXPRESSIONS } from '../src/face.js';

const head = processHead(readFileSync(new URL('../assets/head/LeePerrySmith.glb', import.meta.url)), () => [0.62, 0.5, 0.45]);
const A = head.identities.A.position;
const morph = Object.fromEntries(head.morphs.map((m) => [m.name, m.position]));
const posed = (weights) => {
  const P = Float32Array.from(A);
  for (const [name, w] of Object.entries(weights)) for (let i = 0; i < P.length; i++) P[i] += morph[name][i] * w;
  return P;
};
const lining = (i) => head.regions[i * 12 + 4] >= 128;

// Does any triangle cover the point (x, y) seen from the front, in front of depth z?
function covered(P, x, y, z) {
  const I = head.index;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
    const d = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
    if (Math.abs(d) < 1e-14) continue;
    const w1 = ((P[b + 1] - P[c + 1]) * (x - P[c]) + (P[c] - P[b]) * (y - P[c + 1])) / d;
    const w2 = ((P[c + 1] - P[a + 1]) * (x - P[c]) + (P[a] - P[c]) * (y - P[c + 1])) / d;
    if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue;
    if (P[a + 2] * w1 + P[b + 2] * w2 + P[c + 2] * (1 - w1 - w2) > z) return true;
  }
  return false;
}

test('the renderer drives exactly the baked expression targets', () => {
  assert.deepEqual(MORPHS, EXPRESSIONS);
});

test('every baked array is finite and the index stays in range', () => {
  assert.ok(head.count < 65536);
  assert.ok(head.index.every((v) => v < head.count));
  for (const g of Object.values(head.identities)) for (const arr of [g.position, g.normal]) assert.ok(arr.every(Number.isFinite));
  for (const m of head.morphs) {
    assert.ok(m.position.every((v) => Number.isFinite(v) && Math.abs(v) < 0.025), `${m.name} moves too far`);
    assert.ok(m.normal.every(Number.isFinite), `${m.name} normals`);
  }
});

test('open eyes show the pupil and a blink covers it', () => {
  head.eyes.forEach(({ centre: c }, k) => {
    const apex = c[2] + eyeFront(0);
    assert.ok(!covered(A, c[0], c[1], apex), `eye ${k} is covered while open`);
    assert.ok(covered(posed({ [k ? 'blinkL' : 'blinkR']: 1 }), c[0], c[1], apex), `eye ${k} stays open in a blink`);
  });
});

test('the lids never cut into the eyeballs, open, blinking or squinting', () => {
  head.eyes.forEach(({ centre: c }, k) => {
    const blink = k ? 'blinkL' : 'blinkR';
    const poses = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ [blink]: f })).concat([{ squint: 0.5 }, { squint: 1 }, { squint: 1, [blink]: 0.4 }]);
    for (const w of poses) {
      const P = posed(w);
      let worst = Infinity;
      for (let i = 0; i < head.count; i++) {
        if (lining(i)) continue;
        const d = [P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]];
        const r = Math.hypot(...d);
        if (r > 0.02) continue;
        worst = Math.min(worst, r - eyeFront(Math.acos(d[2] / r)));
      }
      assert.ok(worst > 0, `eye ${k} ${JSON.stringify(w)}: skin ${(-worst * 1000).toFixed(2)} mm inside the eyeball`);
    }
  });
});

test('the lips meet at rest and part when the jaw drops', () => {
  const { lipY, lipZ } = head.mouth;
  assert.ok(covered(A, 0, lipY, lipZ - 0.006), 'the lips do not meet at rest');
  assert.ok(!covered(posed({ jawOpen: 1 }), 0, lipY - 0.004, lipZ - 0.008), 'the mouth does not open');
});

test('the Warden has his own face but the same eyes', () => {
  const B = head.identities.B.position;
  let sum = 0;
  let most = 0;
  for (let i = 0; i < A.length; i += 3) {
    const d = Math.hypot(B[i] - A[i], B[i + 1] - A[i + 1], B[i + 2] - A[i + 2]);
    sum += d;
    most = Math.max(most, d);
  }
  assert.ok(sum / head.count > 0.0002 && most > 0.004, `the faces barely differ (mean ${((sum / head.count) * 1000).toFixed(2)} mm, most ${(most * 1000).toFixed(1)} mm)`);
  for (const { centre: c } of head.eyes) {
    for (let i = 0; i < head.count; i++) {
      if (Math.hypot(A[i * 3] - c[0], A[i * 3 + 1] - c[1], A[i * 3 + 2] - c[2]) > 0.014) continue;
      assert.ok(Math.hypot(B[i * 3] - A[i * 3], B[i * 3 + 1] - A[i * 3 + 1], B[i * 3 + 2] - A[i * 3 + 2]) < 0.0003, 'the eyelids moved');
    }
  }
});

test('hair grows on the crown, the beard stays off the brow, wet lining only in eyes and mouth', () => {
  let top = 0;
  for (let i = 0; i < head.count; i++) if (A[i * 3 + 1] > A[top * 3 + 1]) top = i;
  assert.ok(head.regions[top * 12] > 200, 'no hair on the crown');
  for (let i = 0; i < head.count; i++) {
    const [x, y, z] = [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]];
    if (y > 0.13) assert.equal(head.regions[i * 12 + 1], 0, 'beard above the cheekbones');
    if (lining(i)) {
      const near = head.eyes.some(({ centre: c }) => Math.hypot(x - c[0], y - c[1], z - c[2]) < 0.025) || Math.hypot(x, y - 0.045, z - 0.078) < 0.04;
      assert.ok(near, 'wet lining outside the eyes and mouth');
    }
  }
});

test('the lashes grow from the lid margins, ride a blink down and point away from the eyes', () => {
  const first = Math.min(...head.index.subarray(head.lashes.start));
  assert.equal(head.lashes.start + head.lashes.count, head.index.length);
  const roots = [];
  for (let i = first; i < head.count; i++) if (head.uv[i * 2 + 1] === 0) roots.push(i);
  assert.ok(roots.length >= 80, `${roots.length} lash roots`);
  const eyeOf = (r) => (Math.abs(A[r * 3] - head.eyes[0].centre[0]) < Math.abs(A[r * 3] - head.eyes[1].centre[0]) ? 0 : 1);
  for (const w of [{}, { blinkR: 1 }, { blinkL: 1 }, { squint: 1 }, { browDown: 1 }]) {
    const P = posed(w);
    for (const r of roots) {
      let near = Infinity;
      for (let i = 0; i < first; i++) near = Math.min(near, Math.hypot(P[i * 3] - P[r * 3], P[i * 3 + 1] - P[r * 3 + 1], P[i * 3 + 2] - P[r * 3 + 2]));
      assert.ok(near < 0.0025, `${JSON.stringify(w)}: a lash root hangs ${(near * 1000).toFixed(2)} mm off the lid`);
    }
  }
  head.eyes.forEach(({ centre: c }, k) => {
    const P = posed({ [k ? 'blinkL' : 'blinkR']: 1 });
    const upper = roots.filter((r) => eyeOf(r) === k && A[r * 3 + 1] > c[1]);
    const drop = upper.reduce((sum, r) => sum + P[r * 3 + 1] - A[r * 3 + 1], 0) / upper.length;
    assert.ok(drop < -0.003, `eye ${k}: the upper lashes drop ${(drop * 1000).toFixed(1)} mm in a blink`);
  });
  for (const r of roots) {
    const c = head.eyes[eyeOf(r)].centre;
    const dist = (i) => Math.hypot(A[i * 3] - c[0], A[i * 3 + 1] - c[1], A[i * 3 + 2] - c[2]);
    let tip = r + 1;
    while (head.uv[tip * 2 + 1] !== 1) tip++;
    assert.ok(dist(tip) - dist(r) > 0.001, 'a lash grows into the eye');
  }
});
