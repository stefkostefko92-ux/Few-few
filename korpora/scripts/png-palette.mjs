// A small, dependency-free PNG encoder with a palette: the images of the brand (scripts/brand.mjs) and of the link
// preview (scripts/og-image.ts) are flat drawings with soft glows, which 256 colours hold without a visible loss
// at a quarter of the bytes of a 32-bit PNG. An image with 256 colours or fewer is written as it is (lossless);
// a richer one goes through a median cut (measured on these images: no visible banding, no diffusion needed).
//   encodePalettePng(width, height, rgba) -> Buffer     rgba: Uint8ClampedArray | Uint8Array | Buffer, 4 bytes a pixel
import { crc32, deflateSync } from 'node:zlib';

const MAX_COLOURS = 256;

/** Palette (array of [r, g, b, a]) by a median cut over the weighted histogram. */
function medianCut(histogram, limit) {
  let boxes = [{ items: histogram }];
  const spread = (items) => {
    const lo = [255, 255, 255, 255];
    const hi = [0, 0, 0, 0];
    for (const { c } of items)
      for (let k = 0; k < 4; k++) {
        if (c[k] < lo[k]) lo[k] = c[k];
        if (c[k] > hi[k]) hi[k] = c[k];
      }
    // the eye is most sensitive to green; the alpha edge of a glow matters as much as a hue
    const weight = [0.9, 1.2, 0.8, 1];
    let axis = 0;
    let best = -1;
    for (let k = 0; k < 4; k++) {
      const range = (hi[k] - lo[k]) * weight[k];
      if (range > best) {
        best = range;
        axis = k;
      }
    }
    return { axis, range: best };
  };
  for (const box of boxes) Object.assign(box, spread(box.items));
  while (boxes.length < limit) {
    let pick = -1;
    let score = 0;
    boxes.forEach((box, i) => {
      if (box.items.length < 2) return;
      // the biggest spread, weighted a little by the pixels it holds
      const s = box.range * Math.sqrt(box.items.reduce((sum, item) => sum + item.n, 0));
      if (s > score) {
        score = s;
        pick = i;
      }
    });
    if (pick < 0) break;
    const box = boxes[pick];
    box.items.sort((a, b) => a.c[box.axis] - b.c[box.axis]);
    const total = box.items.reduce((sum, item) => sum + item.n, 0);
    let run = 0;
    let cut = 1;
    for (let i = 0; i < box.items.length - 1; i++) {
      run += box.items[i].n;
      cut = i + 1;
      if (run >= total / 2) break;
    }
    const a = { items: box.items.slice(0, cut) };
    const b = { items: box.items.slice(cut) };
    Object.assign(a, spread(a.items));
    Object.assign(b, spread(b.items));
    boxes = boxes.filter((_, i) => i !== pick).concat(a, b);
  }
  return boxes.map(({ items }) => {
    const total = items.reduce((sum, item) => sum + item.n, 0);
    return [0, 1, 2, 3].map((k) =>
      Math.round(items.reduce((sum, item) => sum + item.c[k] * item.n, 0) / total),
    );
  });
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Scanlines with the filter that leaves the smallest sum of absolute values (the usual heuristic). */
function filtered(indices, width, height) {
  const rows = [];
  const zero = Buffer.alloc(width);
  for (let y = 0; y < height; y++) {
    const row = indices.subarray(y * width, (y + 1) * width);
    const up = y ? indices.subarray((y - 1) * width, y * width) : zero;
    const candidates = [0, 1, 2, 3, 4].map((type) => {
      const out = Buffer.alloc(width + 1);
      out[0] = type;
      for (let x = 0; x < width; x++) {
        const a = x ? row[x - 1] : 0;
        const b = up[x];
        const c = x ? up[x - 1] : 0;
        let predictor = 0;
        if (type === 1) predictor = a;
        else if (type === 2) predictor = b;
        else if (type === 3) predictor = (a + b) >> 1;
        else if (type === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        out[x + 1] = (row[x] - predictor) & 255;
      }
      let sum = 0;
      for (let x = 1; x <= width; x++) sum += out[x] < 128 ? out[x] : 256 - out[x];
      return { out, sum };
    });
    rows.push(candidates.reduce((best, next) => (next.sum < best.sum ? next : best)).out);
  }
  return Buffer.concat(rows);
}

export function encodePalettePng(width, height, rgba) {
  const count = width * height;
  const px = new Uint8Array(count * 4);
  const histogram = new Map();
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    // a transparent pixel has no colour: they all collapse into one entry
    const clear = rgba[o + 3] === 0;
    for (let k = 0; k < 4; k++) px[o + k] = clear ? 0 : rgba[o + k];
    const key = ((px[o] << 24) | (px[o + 1] << 16) | (px[o + 2] << 8) | px[o + 3]) >>> 0;
    const entry = histogram.get(key);
    if (entry) entry.n++;
    else histogram.set(key, { c: [px[o], px[o + 1], px[o + 2], px[o + 3]], n: 1 });
  }
  const exact = histogram.size <= MAX_COLOURS;
  const palette = exact
    ? [...histogram.values()].map((item) => item.c)
    : medianCut([...histogram.values()], MAX_COLOURS);
  const nearest = (r, g, b, a) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const d =
        (r - p[0]) ** 2 * 0.9 + (g - p[1]) ** 2 * 1.2 + (b - p[2]) ** 2 * 0.8 + (a - p[3]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const indices = Buffer.alloc(count);
  // one lookup per distinct colour; without diffusion the quantised soft gradients of these drawings do not band
  const slot = new Map();
  for (const [key, { c }] of histogram)
    slot.set(key, exact ? palette.indexOf(c) : nearest(c[0], c[1], c[2], c[3]));
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    indices[i] = slot.get(((px[o] << 24) | (px[o + 1] << 16) | (px[o + 2] << 8) | px[o + 3]) >>> 0);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8; // bit depth
  head[9] = 3; // colour type: palette
  const plte = Buffer.from(palette.flatMap((c) => [c[0], c[1], c[2]]));
  const alphas = palette.map((c) => c[3]);
  let lastSolid = alphas.length;
  while (lastSolid > 0 && alphas[lastSolid - 1] === 255) lastSolid--;
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('PLTE', plte),
  ];
  if (lastSolid > 0) parts.push(chunk('tRNS', Buffer.from(alphas.slice(0, lastSolid))));
  parts.push(
    chunk('IDAT', deflateSync(filtered(indices, width, height), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  );
  return Buffer.concat(parts);
}
