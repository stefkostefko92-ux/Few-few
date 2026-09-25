// Riveted 4-in-1 mail, one tile = 0.08 m: 8 mm rings of 1.2 mm wire, alternate rows tilted,
// the gambeson showing dark through the gaps. Metalness drops to zero in the gaps.
const COLS = 10;
const ROWS = 22;

export default {
  name: 'mail',
  size: 2048,
  tile: 0.08,
  seed: 81,
  normalStrength: 1,
  aoRadii: [0.0006, 0.002],
  aoWeights: [0.6, 0.4],

  setup(seed) {
    return { seed };
  },

  shade(ctx, u, v, o) {
    const W = 0.08;
    const x = u * W;
    const y = v * W;
    const cw = W / COLS;
    const rh = W / ROWS;
    const R = 0.0034;
    const wire = 0.0006;
    let best = -1;
    let seen = 0;
    const row0 = Math.floor(y / rh);
    for (let dr = -2; dr <= 2; dr++) {
      const r = row0 + dr;
      const off = r & 1 ? cw * 0.5 : 0;
      const col0 = Math.floor((x - off) / cw);
      const tilt = r & 1 ? 0.35 : -0.35;
      for (let dc = -1; dc <= 1; dc++) {
        const cx = (col0 + dc) * cw + off + cw * 0.5;
        const cy = r * rh + rh * 0.5;
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        const q = wire * wire - (d - R) * (d - R);
        if (q <= 0) continue;
        const h = Math.sqrt(q) + 0.0012 + tilt * dy * 0.3;
        if (h > best) best = h;
        seen++;
      }
    }
    const ring = best > 0;
    o.h = ring ? best : 0;
    o.r = o.g = o.b = ring ? 0.94 : 0.05;
    o.rough = ring ? 0.55 + 0.08 * Math.min(1, seen / 3) : 0.95;
    o.metal = ring ? 1 : 0;
    o.mask = ring ? 1 : 0;
  },
};
