// Motion-captured body layer (CMU Graphics Lab Motion Capture Database, subject 02, swordplay):
// the capture's pelvis sway, torso follow-through, head motion, hip bob and weight shift, aligned
// to each knight's choreography by dynamic time warping on activity (hand and torso speed), so the
// body works hardest where the duel's strikes are. The choreography keeps the blade, the feet and
// every contact; the capture only moves the body around them.
import MOCAP from '../data/mocap/cmu-swordplay.json' with { type: 'json' };

export const MOCAP_FPS = MOCAP.fps;
export const CHANNELS = ['pelvisYaw', 'pelvisPitch', 'pelvisRoll', 'twist', 'lean', 'side', 'headYaw', 'headPitch', 'headRoll', 'hipY', 'shiftX', 'shiftZ'];
// How much of the captured motion reaches the knights (armour is heavier than the actor's kit).
const GAIN = { pelvisYaw: 0.35, pelvisPitch: 0.5, pelvisRoll: 0.6, twist: 0.6, lean: 0.5, side: 0.5, headYaw: 0.4, headPitch: 0.4, headRoll: 0.4, hipY: 0.6, shiftX: 0.8, shiftZ: 0.8 };
// Channels that change sign when the capture is mirrored left to right.
const MIRRORED = new Set(['pelvisYaw', 'pelvisRoll', 'twist', 'side', 'headYaw', 'headRoll', 'shiftX']);

// All takes back to back: one long reel of captured swordplay.
function reel() {
  const out = { act: [] };
  for (const c of CHANNELS) out[c] = [];
  for (const take of Object.values(MOCAP.takes)) {
    out.act.push(...take.ch.act);
    for (const c of CHANNELS) out[c].push(...take.ch[c]);
  }
  return out;
}
const REEL = reel();

// Scales a signal so its 90th percentile is 1: alignment compares rhythm, not magnitude.
function normalise(xs) {
  const sorted = Float32Array.from(xs).sort();
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 1;
  return Float32Array.from(xs, (x) => x / p90);
}

// Subsequence dynamic time warping: maps every story frame i to a capture frame j(i). Per story
// frame the capture advances by 1 (plain), 2 (double speed) or 0 (hold), the last two with a cost,
// so playback stays between a freeze and twice real time and never runs backwards.
export function alignActivity(story, capture, { skip = 0.08, hold = 0.12 } = {}) {
  const a = normalise(story);
  const b = normalise(capture);
  const n = a.length;
  const m = b.length;
  let prev = new Float32Array(m);
  let cur = new Float32Array(m);
  const from = new Uint8Array(n * m);
  for (let j = 0; j < m; j++) prev[j] = (a[0] - b[j]) ** 2;
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const c = (a[i] - b[j]) ** 2;
      let best = prev[j] + hold;
      let step = 0;
      if (j >= 1 && prev[j - 1] < best) {
        best = prev[j - 1];
        step = 1;
      }
      if (j >= 2 && prev[j - 2] + skip < best) {
        best = prev[j - 2] + skip;
        step = 2;
      }
      cur[j] = c + best;
      from[i * m + j] = step;
    }
    [prev, cur] = [cur, prev];
  }
  let j = 0;
  for (let k = 1; k < m; k++) if (prev[k] < prev[j]) j = k;
  const path = new Float32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    path[i] = j;
    j -= from[i * m + j];
  }
  return path;
}

// Gaussian-smoothed warp: the staircase of the discrete alignment would read as jitter.
function smooth(path, sigma) {
  const r = Math.ceil(sigma * 3);
  return Float32Array.from(path, (_, i) => {
    let s = 0;
    let t = 0;
    for (let k = -r; k <= r; k++) {
      const w = Math.exp(-((k / sigma) ** 2) / 2);
      s += path[Math.min(path.length - 1, Math.max(0, i + k))] * w;
      t += w;
    }
    return s / t;
  });
}

export class BodyLayer {
  // storyActivity: activity of this knight's choreography sampled at MOCAP_FPS from T = 0.
  constructor(storyActivity, { mirror = false } = {}) {
    this.path = smooth(alignActivity(storyActivity, REEL.act), 3);
    this.sign = mirror ? -1 : 1;
  }

  // Body offsets at story time T (radians and metres), written into `out`.
  sample(T, out = {}) {
    const x = Math.min(this.path.length - 1, Math.max(0, T * MOCAP_FPS));
    const i = Math.floor(x);
    const f = x - i;
    const j = this.path[i] + (this.path[Math.min(i + 1, this.path.length - 1)] - this.path[i]) * f;
    const j0 = Math.min(REEL.act.length - 1, Math.floor(j));
    const j1 = Math.min(REEL.act.length - 1, j0 + 1);
    const g = j - j0;
    for (const c of CHANNELS) {
      const v = REEL[c][j0] + (REEL[c][j1] - REEL[c][j0]) * g;
      out[c] = v * GAIN[c] * (MIRRORED.has(c) ? this.sign : 1);
    }
    return out;
  }
}

export const MOCAP_CREDIT = MOCAP.terms;
