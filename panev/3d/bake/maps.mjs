// Neighbourhood passes over a baked height field (millimetres) on a w x h texel grid that wraps
// at the borders: blur, tangent-space normals, cavity occlusion, and the packing of the maps.

export function blurWrap(src, w, h, radius, passes = 3) {
  let a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  const r = Math.max(1, Math.round(radius));
  const inv = 1 / (2 * r + 1);
  const m = (i, n) => ((i % n) + n) % n;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + m(k, w)];
      for (let x = 0; x < w; x++) {
        b[row + x] = s * inv;
        s += a[row + m(x + r + 1, w)] - a[row + m(x - r, w)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[m(k, h) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s * inv;
        s += b[m(y + r + 1, h) * w + x] - b[m(y - r, h) * w + x];
      }
    }
  }
  return a;
}

// OpenGL-convention normals (+Y up the texture) from heights; px = [mm per texel in x, in y].
export function normals(hf, w, h, px, strength = 1) {
  const out = new Float32Array(w * h * 3);
  const kx = strength / (2 * px[0]);
  const ky = strength / (2 * px[1]);
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w;
    const yd = ((y + 1) % h) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const dx = (hf[row + ((x + 1) % w)] - hf[row + ((x - 1 + w) % w)]) * kx;
      const dy = (hf[yu + x] - hf[yd + x]) * ky;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) * 3;
      out[i] = -dx * inv;
      out[i + 1] = -dy * inv;
      out[i + 2] = inv;
    }
  }
  return out;
}

// Cavity occlusion: how far each texel sits below its blurred surroundings, per radius (mm).
export function cavity(hf, w, h, px, radii, weights) {
  const ao = new Float32Array(w * h).fill(1);
  radii.forEach((rm, n) => {
    const blurred = blurWrap(hf, w, h, rm / px[0]);
    for (let i = 0; i < hf.length; i++) {
      const d = blurred[i] - hf[i];
      if (d > 0) ao[i] -= weights[n] * Math.min(1, d / rm);
    }
  });
  for (let i = 0; i < ao.length; i++) ao[i] = Math.max(0, ao[i]);
  return ao;
}

const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const byte = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

export function packAlbedo(img, n) {
  const out = new Uint8Array(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    out[j] = byte(toSRGB(img.r[i]));
    out[j + 1] = byte(toSRGB(img.g[i]));
    out[j + 2] = byte(toSRGB(img.b[i]));
  }
  return out;
}

export function packNormal(nm, n) {
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n * 3; i++) out[i] = byte(nm[i] * 0.5 + 0.5);
  return out;
}

// R = ambient occlusion, G = roughness factor x 0.5 (so 1.0 sits mid-range), B = the set's `metal`
// channel (every material here is fully metallic: the zinc keeps its passivation film's thickness there).
export function packORM(img, ao, n) {
  const out = new Uint8Array(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    out[j] = byte(ao[i]);
    out[j + 1] = byte(img.rough[i] * 0.5);
    out[j + 2] = byte(img.metal[i]);
  }
  return out;
}
