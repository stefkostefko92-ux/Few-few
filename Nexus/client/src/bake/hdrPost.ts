// Постобработка върху HDR пикселите (линейни, premultiplied alpha от MSAA): bloom по яркото
// (специфики на метал + енчант), мека падаща сянка, ACES тонмапинг → 8-bit straight RGBA.
// Чист JS върху Float32Array — детерминиран, без втори GPU пас.

export interface Hdr { w: number; h: number; data: Float32Array } // RGBA premult, горе-надолу

const ACES = (x: number): number => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const toSrgb = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/** Разделимо кутийно замъгляване ×3 ≈ Гаус. Канал по канал, in-place върху копие. */
function blur(src: Float32Array, w: number, h: number, ch: number, radius: number): Float32Array {
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  const r = Math.max(1, Math.round(radius / 2));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < ch; c++) {
        let sum = 0;
        for (let x = -r; x <= r; x++) sum += a[(y * w + Math.min(w - 1, Math.max(0, x))) * ch + c];
        for (let x = 0; x < w; x++) {
          b[(y * w + x) * ch + c] = sum / (2 * r + 1);
          sum += a[(y * w + Math.min(w - 1, x + r + 1)) * ch + c] - a[(y * w + Math.max(0, x - r)) * ch + c];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) sum += b[(Math.min(h - 1, Math.max(0, y)) * w + x) * ch + c];
        for (let y = 0; y < h; y++) {
          a[(y * w + x) * ch + c] = sum / (2 * r + 1);
          sum += b[(Math.min(h - 1, y + r + 1) * w + x) * ch + c] - b[(Math.max(0, y - r) * w + x) * ch + c];
        }
      }
    }
  }
  b = new Float32Array(0);
  return a;
}

export interface PostOpts { exposure: number; bloom: number; bloomThreshold: number; shadow: number; shadowOffset: [number, number]; shadowBlur: number; glowTint?: [number, number, number] }

/** HDR premult → straight 8-bit RGBA с bloom и сянка (alpha-aware). */
export function finish(hdr: Hdr, o: PostOpts): Uint8ClampedArray<ArrayBuffer> {
  const { w, h, data } = hdr;
  const n = w * h;
  // Яркост-маска (над прага) за bloom, на половин резолюция за скорост.
  const hw = w >> 1; const hh = h >> 1;
  const bright = new Float32Array(hw * hh * 3);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      let r = 0; let g = 0; let b = 0;
      for (let k = 0; k < 4; k++) { const i = ((y * 2 + (k >> 1)) * w + x * 2 + (k & 1)) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
      r = r / 4 * o.exposure; g = g / 4 * o.exposure; b = b / 4 * o.exposure;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const k = l > o.bloomThreshold ? (l - o.bloomThreshold) / l : 0;
      const o3 = (y * hw + x) * 3;
      bright[o3] = r * k; bright[o3 + 1] = g * k; bright[o3 + 2] = b * k;
    }
  }
  const b1 = blur(bright, hw, hh, 3, 6);
  const b2 = blur(bright, hw, hh, 3, 22);
  const b3 = blur(bright, hw, hh, 3, 60);
  // Алфа на обекта за сянката.
  const alpha = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) alpha[y * hw + x] = data[((y * 2) * w + x * 2) * 4 + 3];
  const sh = blur(alpha, hw, hh, 1, o.shadowBlur);
  const out = new Uint8ClampedArray(new ArrayBuffer(n * 4));
  const tint = o.glowTint ?? [1, 1, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const hx = Math.min(hw - 1, x >> 1); const hy = Math.min(hh - 1, y >> 1);
      const bi = (hy * hw + hx) * 3;
      const bl = [0, 1, 2].map((c) => (b1[bi + c] * 0.5 + b2[bi + c] * 0.35 + b3[bi + c] * 0.5) * o.bloom * tint[c]);
      const bAlpha = Math.min(1, (bl[0] * 0.2126 + bl[1] * 0.7152 + bl[2] * 0.0722) * 0.9);
      const a = data[i + 3];
      // падаща сянка (изместена) — само под обекта
      const sx = Math.min(hw - 1, Math.max(0, hx - Math.round(o.shadowOffset[0] / 2))); const sy = Math.min(hh - 1, Math.max(0, hy - Math.round(o.shadowOffset[1] / 2)));
      const s = sh[sy * hw + sx] * o.shadow;
      const objA = Math.min(1, Math.max(a, bAlpha));
      const aOut = objA + s * (1 - objA);
      if (aOut <= 0.002) { out[i + 3] = 0; continue; }
      // обектният HDR (линеен, premult) + bloom, тонмапнат като straight върху обектната алфа
      const inv = objA > 1e-4 ? 1 / objA : 0;
      for (let c = 0; c < 3; c++) {
        const lin = (data[i + c] * o.exposure + bl[c]) * inv;
        const col = toSrgb(ACES(lin)) * objA;
        out[i + c] = Math.round((col / aOut) * 255);
      }
      out[i + 3] = Math.round(aOut * 255);
    }
  }
  return out;
}
