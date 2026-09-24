// Procedural PBR surfaces: every map is generated at load time, tileable, no external images.
import { Noise2, Voronoi, rng, clamp01, smooth } from './noise.js';
import { dataTexture, heightToNormal, grayToRGBA } from './texture-util.js';

export { setMaxAnisotropy } from './texture-util.js';

export function cobbleTextures(size = 1024) {
  const vor = new Voronoi(14, 11, 0.8);
  const nz = new Noise2(7);
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const A = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      vor.query(u, v);
      const edge = vor.f2 - vor.f1;
      const stone = smooth(0.03, 0.15, edge);
      const dome = Math.sqrt(clamp01(1 - vor.f1 * 1.05));
      const n1 = nz.fbm(u * 16, v * 16, 16, 4);
      const n2 = nz.fbm(u * 96 + 3.1, v * 96 + 7.7, 96, 3);
      H[i] = stone * (0.5 + 0.38 * dome + 0.12 * n1) + 0.07 * n2 * stone;
      const c = vor.cell;
      const c2 = (c * 7.13) % 1;
      const c3 = (c * 13.7) % 1;
      const base = (0.3 + 0.2 * c) * (0.72 + 0.5 * n1) * (0.9 + 0.2 * n2);
      const sr = base * (0.96 + 0.1 * c2);
      const sg = base * (0.95 + 0.06 * c3);
      const sb = base * (0.93 + 0.1 * (1 - c2));
      const mud = 0.1 + 0.05 * n1;
      A[i * 4] = Math.min(255, (mud + (sr - mud) * stone) * 255);
      A[i * 4 + 1] = Math.min(255, (mud * 0.9 + (sg - mud * 0.9) * stone) * 255);
      A[i * 4 + 2] = Math.min(255, (mud * 0.8 + (sb - mud * 0.8) * stone) * 255);
      A[i * 4 + 3] = 255;
      R[i] = 0.2 + (0.52 + 0.3 * n2 - 0.2) * stone;
    }
  }
  return {
    map: dataTexture(A, size, size, true),
    normalMap: dataTexture(heightToNormal(H, size, size, 7), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Ashlar masonry, one tile = 4 m x 4 m, nine courses.
export function wallTextures(size = 1024) {
  const rand = rng(99);
  const nz = new Noise2(33);
  const rows = 9;
  const rowEdges = [];
  for (let r = 0; r < rows; r++) {
    const cuts = [0];
    let acc = 0;
    while (acc < 1) {
      acc += 0.14 + 0.15 * rand();
      cuts.push(acc);
    }
    const scale = 1 / acc;
    rowEdges.push({ cuts: cuts.map((c) => c * scale), shift: rand(), tint: cuts.map(() => rand()) });
  }
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const A = new Uint8Array(n * 4);
  const mortarW = 0.006;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rf = v * rows;
    const r = Math.floor(rf);
    const inRowY = rf - r;
    const dyEdge = Math.min(inRowY, 1 - inRowY) / rows;
    const row = rowEdges[r];
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const us = (u + row.shift) % 1;
      let k = 1;
      while (k < row.cuts.length - 1 && row.cuts[k] < us) k++;
      const dxEdge = Math.min(us - row.cuts[k - 1], row.cuts[k] - us);
      const e = Math.min(dxEdge, dyEdge);
      const chip = nz.fbm(u * 40, v * 40, 40, 3);
      const block = smooth(mortarW, mortarW + 0.012 + 0.01 * chip, e);
      const n1 = nz.fbm(u * 8, v * 8, 8, 5);
      const streak = nz.fbm(u * 24, v * 2, 24, 3);
      const wet = smooth(0.52, 0.7, streak);
      H[i] = block * (0.75 + 0.25 * chip) + 0.08 * n1;
      const t = row.tint[k] ?? 0.5;
      const b = (0.34 + 0.14 * t) * (0.78 + 0.4 * n1) * (1 - 0.32 * wet);
      const mortar = 0.3 * (0.85 + 0.3 * n1);
      const val = mortar + (b - mortar) * block;
      A[i * 4] = Math.min(255, val * 1.04 * 255);
      A[i * 4 + 1] = Math.min(255, val * 0.99 * 255);
      A[i * 4 + 2] = Math.min(255, val * 0.92 * 255);
      A[i * 4 + 3] = 255;
      R[i] = (0.86 - 0.36 * wet) * (0.9 + 0.1 * chip);
    }
  }
  return {
    map: dataTexture(A, size, size, true),
    normalMap: dataTexture(heightToNormal(H, size, size, 5), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Worn plate: smudged roughness, hammer dents, fine scratches.
export function metalTextures(size = 512) {
  const nz = new Noise2(21);
  const rand = rng(5);
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      R[i] = 0.62 + 0.42 * nz.fbm(u * 5, v * 5, 5, 5);
      H[i] = 0.5 * nz.fbm(u * 14 + 5, v * 14 + 9, 14, 3);
    }
  }
  for (let s = 0; s < 340; s++) {
    let px = rand() * size;
    let py = rand() * size;
    const ang = rand() * Math.PI * 2;
    const len = 8 + rand() * 110;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const depth = 0.04 + rand() * 0.1;
    for (let k = 0; k < len; k++) {
      const ix = ((Math.floor(px) % size) + size) % size;
      const iy = ((Math.floor(py) % size) + size) % size;
      const i = iy * size + ix;
      R[i] = Math.min(1, R[i] + 0.25);
      H[i] -= depth;
      px += dx;
      py += dy;
    }
  }
  return {
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
    normalMap: dataTexture(heightToNormal(H, size, size, 2.2), size, size, false),
  };
}

export function fabricTextures(size = 256) {
  const nz = new Noise2(44);
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const P = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const cx = Math.floor(x / P);
      const cy = Math.floor(y / P);
      const fx = (x % P) / P;
      const fy = (y % P) / P;
      const over = (cx + cy) % 2 === 0;
      const fuzz = nz.fbm(x / 6, y / 6, size / 6, 3);
      H[i] = (over ? Math.sin(Math.PI * fy) * (0.7 + 0.3 * Math.sin(Math.PI * fx)) : Math.sin(Math.PI * fx) * (0.7 + 0.3 * Math.sin(Math.PI * fy))) * 0.8 + 0.2 * fuzz;
      R[i] = 0.82 + 0.18 * fuzz;
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 1.6), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Riveted mail, 8 x 8 rings per tile with staggered rows.
export function mailTextures(size = 256) {
  const n = size * size;
  const H = new Float32Array(n);
  const A = new Uint8Array(n * 4);
  const cells = 8;
  const ring = (px, py, cx, cy) => {
    const d = Math.hypot(px - cx, py - cy);
    const t = Math.abs(d - 0.36) / 0.12;
    return t < 1 ? Math.sqrt(1 - t * t) : 0;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      let h = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const row = Math.floor(gy) + dj;
          const off = (((row % 2) + 2) % 2) * 0.5;
          const col = Math.floor(gx - off) + di;
          const hh = ring(gx, gy, col + off + 0.5, row + 0.5);
          if (hh > h) h = hh;
        }
      }
      H[i] = h;
      const val = h > 0.02 ? 0.35 + 0.35 * h : 0.03;
      A[i * 4] = val * 255;
      A[i * 4 + 1] = val * 255;
      A[i * 4 + 2] = val * 1.05 * 255;
      A[i * 4 + 3] = 255;
    }
  }
  return {
    map: dataTexture(A, size, size, true),
    normalMap: dataTexture(heightToNormal(H, size, size, 3), size, size, false),
  };
}

export function leatherTextures(size = 256) {
  const vor = new Voronoi(28, 3, 0.9);
  const nz = new Noise2(8);
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      vor.query(u, v);
      const f = nz.fbm(u * 10, v * 10, 10, 4);
      H[i] = smooth(0, 0.2, vor.f2 - vor.f1) * 0.6 + 0.4 * f;
      R[i] = 0.55 + 0.35 * f;
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 2.5), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

export function woodTextures(size = 512) {
  const nz = new Noise2(61);
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const A = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const warp = nz.fbm(u * 4, v * 1, 4, 4) * 5;
      const grain = 0.5 + 0.5 * Math.sin((u * 46 + warp) * Math.PI * 2);
      const plank = Math.min((u * 4) % 1, 1 - ((u * 4) % 1));
      const seam = smooth(0.0, 0.02, plank);
      const f = nz.fbm(u * 12, v * 3, 12, 3);
      H[i] = seam * (0.6 + 0.25 * grain + 0.15 * f);
      const b = (0.26 + 0.1 * grain) * (0.75 + 0.45 * f) * (0.4 + 0.6 * seam);
      A[i * 4] = Math.min(255, b * 1.35 * 255);
      A[i * 4 + 1] = Math.min(255, b * 0.95 * 255);
      A[i * 4 + 2] = Math.min(255, b * 0.62 * 255);
      A[i * 4 + 3] = 255;
      R[i] = 0.62 + 0.3 * f;
    }
  }
  return {
    map: dataTexture(A, size, size, true),
    normalMap: dataTexture(heightToNormal(H, size, size, 3), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Rain beading on lacquered or oiled surfaces, used as a clearcoat normal map.
export function dropletTextures(size = 512) {
  const rand = rng(17);
  const H = new Float32Array(size * size);
  for (let k = 0; k < 900; k++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 1.5 + rand() * rand() * 7;
    const stretch = 1 + rand() * 1.6;
    const r2 = Math.ceil(r * stretch);
    for (let dy = -r2; dy <= r2; dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const q = (dx * dx) / (r * r) + (dy * dy) / (r * r * stretch * stretch);
        if (q >= 1) continue;
        const ix = ((Math.floor(cx + dx) % size) + size) % size;
        const iy = ((Math.floor(cy + dy) % size) + size) % size;
        const h = Math.sqrt(1 - q) * r * 0.25;
        const i = iy * size + ix;
        if (h > H[i]) H[i] = h;
      }
    }
  }
  return { normalMap: dataTexture(heightToNormal(H, size, size, 1.4), size, size, false) };
}
