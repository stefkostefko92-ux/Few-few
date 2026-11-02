// Neighbourhood passes over baked height fields: blur, normals, cavity AO, curvature, packing.
// Every operation wraps at the borders so the maps stay tileable.

// Separable box blur with wrap-around, repeated `passes` times (3 passes ~ Gaussian).
export function blurWrap(src, size, radius, passes = 3) {
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  const r = Math.max(1, Math.round(radius));
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + ((k % size) + size) % size];
      for (let x = 0; x < size; x++) {
        b[row + x] = s * inv;
        s += a[row + ((x + r + 1) % size)] - a[row + ((x - r) % size + size) % size];
      }
    }
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[(((k % size) + size) % size) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = s * inv;
        s += b[((y + r + 1) % size) * size + x] - b[(((y - r) % size + size) % size) * size + x];
      }
    }
  }
  b = null;
  return a;
}

// Tangent-space normals (OpenGL convention, +Y up the texture) from a height field in metres.
export function normals(h, size, metresPerPixel, strength = 1) {
  const out = new Float32Array(size * size * 3);
  const k = strength / (2 * metresPerPixel);
  for (let y = 0; y < size; y++) {
    const yu = ((y - 1 + size) % size) * size;
    const yd = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size;
      const xr = (x + 1) % size;
      const dx = (h[row + xr] - h[row + xl]) * k;
      const dy = (h[yu + x] - h[yd + x]) * k;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) * 3;
      out[i] = -dx * inv;
      out[i + 1] = -dy * inv;
      out[i + 2] = inv;
    }
  }
  return out;
}

// Multi-scale cavity occlusion: how far each texel sits below its blurred surroundings.
// Returns ambient occlusion in [0, 1] (1 = open) and the raw cavity depth in metres.
export function cavity(h, size, metresPerPixel, radiiMetres, weights) {
  const ao = new Float32Array(size * size).fill(1);
  const depth = new Float32Array(size * size);
  radiiMetres.forEach((rm, n) => {
    const blurred = blurWrap(h, size, rm / metresPerPixel);
    const w = weights[n];
    for (let i = 0; i < h.length; i++) {
      const d = blurred[i] - h[i];
      if (d > 0) {
        depth[i] += d * w;
        ao[i] -= w * Math.min(1, d / rm);
      }
    }
  });
  for (let i = 0; i < ao.length; i++) ao[i] = Math.max(0, ao[i]);
  return { ao, depth };
}

// Discrete Laplacian of height at a given scale; positive on convex edges, negative in creases.
export function curvature(h, size, radiusPx) {
  const blurred = blurWrap(h, size, radiusPx, 2);
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) out[i] = h[i] - blurred[i];
  return out;
}

const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const byte = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

export function packAlbedo(img, size) {
  const out = new Uint8Array(size * size * 3);
  for (let i = 0, j = 0; i < size * size; i++, j += 3) {
    out[j] = byte(toSRGB(img.r[i]));
    out[j + 1] = byte(toSRGB(img.g[i]));
    out[j + 2] = byte(toSRGB(img.b[i]));
  }
  return out;
}

// RGB = normal, A = height normalised over the texture's own range (for parallax / puddles).
export function packNormalHeight(n, h, size) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < h.length; i++) {
    if (h[i] < lo) lo = h[i];
    if (h[i] > hi) hi = h[i];
  }
  const span = hi - lo || 1;
  const out = new Uint8Array(size * size * 4);
  for (let i = 0, j = 0, k = 0; i < size * size; i++, j += 4, k += 3) {
    out[j] = byte(n[k] * 0.5 + 0.5);
    out[j + 1] = byte(n[k + 1] * 0.5 + 0.5);
    out[j + 2] = byte(n[k + 2] * 0.5 + 0.5);
    out[j + 3] = byte((h[i] - lo) / span);
  }
  return { data: out, heightRange: span };
}

// R = ambient occlusion, G = roughness, B = metalness, A = mask (wetness / wear, set specific).
export function packORM(img, size) {
  const out = new Uint8Array(size * size * 4);
  for (let i = 0, j = 0; i < size * size; i++, j += 4) {
    out[j] = byte(img.ao[i]);
    out[j + 1] = byte(img.rough[i]);
    out[j + 2] = byte(img.metal[i]);
    out[j + 3] = byte(img.mask[i]);
  }
  return out;
}
