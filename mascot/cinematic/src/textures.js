// Procedural PBR surfaces: every map is generated at load time, tileable, no external images.
// Domain-specific to the mascot (carbon twill sealed inside the jelly, satin weave for the
// bow tie, felt for the mortarboard) — written for this package, not copied from boy/.
import { Noise2, rng, smooth } from './noise.js';
import { dataTexture, heightToNormal, grayToRGBA } from './texture-util.js';

export { setMaxAnisotropy } from './texture-util.js';

// 2x2 diagonal twill, barely-there height so the weave reads as a material under the transmissive
// jelly rather than a printed pattern (defect #3: the body was a flat matte olive before).
// Also carries the jelly's own skin micro-imperfections (2026-09-25 brief: "прекалено гладък, без
// несъвършенства") — a sparse field of shallow dimples and a handful of soft smudge blobs, layered
// on top of the weave at a much higher frequency, so the surface reads as a real molded/handled
// object rather than a mathematically perfect shell.
export function carbonTwillTextures(size = 256, cells = 18) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const nz = new Noise2(31);
  const grime = new Noise2(97);
  const speckRand = rng(19);
  // A dozen faint smudge centers (fingerprint/handling marks) at random tileable positions.
  const specks = Array.from({ length: 10 }, () => [speckRand(), speckRand(), 0.05 + speckRand() * 0.06]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const diag = (Math.floor(gx) + Math.floor(gy)) % 4;
      const fx = gx - Math.floor(gx);
      const fy = gy - Math.floor(gy);
      const strand = diag < 2 ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
      const fiber = nz.fbm(gx * 3, gy * 3, cells * 3, 3);
      // High-frequency pore/dimple noise: much finer period than the weave, tiny amplitude — a
      // near-imperceptible skin texture, not a pattern of its own.
      const pores = grime.fbm(gx * 9 + 4, gy * 9 + 4, cells * 9, 2) - 0.5;
      const u = x / size;
      const v = y / size;
      let smudge = 0;
      for (const [sx, sy, sr] of specks) {
        const dx = Math.min(Math.abs(u - sx), 1 - Math.abs(u - sx));
        const dy = Math.min(Math.abs(v - sy), 1 - Math.abs(v - sy));
        smudge += Math.max(0, 1 - Math.hypot(dx, dy) / sr);
      }
      smudge = Math.min(1, smudge);
      H[i] = strand * 0.35 + fiber * 0.1 + pores * 0.1;
      R[i] = 0.32 + 0.14 * strand + 0.06 * fiber + pores * 0.09 + smudge * 0.16;
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 0.9), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Plain-weave satin: long soft floats (low-frequency sine) instead of a tight basket weave, so
// the sheen highlight reads as fabric, not plastic. Used for the bow tie.
export function satinTextures(size = 256, cells = 10) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const nz = new Noise2(58);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const float = Math.sin(gx * Math.PI * 2) * 0.15;
      const fiber = nz.fbm(gx * 4, gy * 4, cells * 4, 3);
      H[i] = float + fiber * 0.22;
      R[i] = 0.22 + 0.1 * fiber;
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 1.1), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Felted wool for the mortarboard cap and band: fine irregular bump, no directional grain.
export function feltTextures(size = 192) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const nz = new Noise2(11);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const fiber = nz.fbm(u * 40, v * 40, 40, 4);
      H[i] = fiber * 0.5;
      R[i] = 0.6 + 0.2 * fiber;
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 1.4), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Radial iris fiber pattern: fine spokes from the pupil to the limbus plus a soft dark ring at the
// rim, so the eye reads as a real iris under a close-up instead of a flat painted disc — the
// catchlights themselves stay separate sparkle meshes (face.js), this only supplies the fiber detail.
export function irisTextures(size = 128) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const nz = new Noise2(71);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (x - cx) / (size / 2);
      const dy = (y - cy) / (size / 2);
      const r = Math.min(1, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      const spokes = Math.sin(a * 24 + nz.fbm(r * 4, a, 8, 2) * 3) * 0.5 + 0.5;
      H[i] = spokes * (0.15 + r * 0.35) + nz.fbm(dx * 6 + 8, dy * 6 + 8, 12, 3) * 0.12;
      R[i] = 0.28 + 0.22 * spokes - 0.12 * smooth(0.72, 1, r); // glossy limbus ring
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 1.6), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Fine directional micro-scratches for the lacquered acetate frames (brief: "микро драскотини") —
// thin, mostly-one-direction streaks at a low amplitude, the kind of handling wear real acetate
// picks up, not a pattern that reads as deliberate engraving.
export function scratchTextures(size = 128, streaks = 40) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const rand = rng(83);
  const lines = Array.from({ length: streaks }, () => ({ y: rand(), depth: 0.15 + rand() * 0.5, width: 0.004 + rand() * 0.01, slope: (rand() - 0.5) * 0.3 }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      let h = 0;
      for (const l of lines) {
        const yy = (l.y + u * l.slope) % 1;
        const d = Math.min(Math.abs(v - yy), 1 - Math.abs(v - yy));
        h += Math.max(0, 1 - d / l.width) * l.depth;
      }
      H[i] = Math.min(1, h) * 0.4;
      R[i] = 0.4 + Math.min(1, h) * 0.25;
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 0.7), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Soft radial falloff, used for the floor contact glow and the fake AO disc under the mascot.
export function radialTextures(size = 128) {
  const n = size * size;
  const A = new Uint8Array(n * 4);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const d = Math.hypot(x - cx, y - cy) / (size / 2);
      const a = 1 - smooth(0.15, 1, d);
      A[i * 4] = A[i * 4 + 1] = A[i * 4 + 2] = 255;
      A[i * 4 + 3] = Math.min(255, a * 255);
    }
  }
  return dataTexture(A, size, size, false);
}

// Desk oak: long grain streaks + darker ring bands, baked straight to albedo (this is a lit set
// surface, not a tinted mascot material — it needs real colour variation, not a single flat hue).
export function woodTextures(size = 256) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const Al = new Uint8Array(n * 4);
  const nz = new Noise2(41);
  const ring = new Noise2(9);
  const base = [107, 68, 36];
  const dark = [58, 34, 16];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const warp = ring.fbm(u * 3 + 4, v * 0.6, 8, 2) * 0.6;
      const rings = Math.sin((v + warp) * 42) * 0.5 + 0.5;
      const grain = nz.fbm(u * 30, v * 2, 32, 4);
      const streak = Math.pow(rings, 3) * 0.7 + grain * 0.3;
      H[i] = streak * 0.45 + grain * 0.15;
      R[i] = 0.34 + 0.22 * streak;
      const t = Math.min(1, streak * 0.9 + grain * 0.2);
      Al[i * 4] = base[0] + (dark[0] - base[0]) * t;
      Al[i * 4 + 1] = base[1] + (dark[1] - base[1]) * t;
      Al[i * 4 + 2] = base[2] + (dark[2] - base[2]) * t;
      Al[i * 4 + 3] = 255;
    }
  }
  return {
    albedoMap: dataTexture(Al, size, size, true),
    normalMap: dataTexture(heightToNormal(H, size, size, 1.0), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Pebbled book-leather grain: shared by every cover on the desk (each book differs only by the
// material's own `color`, like the felt cap does), so one bake covers the whole stack.
export function leatherTextures(size = 96) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const nz = new Noise2(63);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const pebble = nz.fbm(u * 26, v * 26, 26, 4) - 0.5;
      H[i] = pebble * 0.6;
      R[i] = 0.5 + 0.22 * pebble;
    }
  }
  return {
    normalMap: dataTexture(heightToNormal(H, size, size, 1.3), size, size, false),
    roughnessMap: dataTexture(grayToRGBA(R), size, size, false),
  };
}

// Night sky through the study window: a cool gradient, a soft moon disc and a handful of far
// window-lights, baked once as an unlit albedo the camera's own shallow DOF then throws out of
// focus into bokeh — cheaper and steadier than real bokeh sprites for a background this far back.
export function windowSkyTexture(size = 192) {
  const n = size * size;
  const Al = new Uint8Array(n * 4);
  const rand = rng(207);
  const lights = Array.from({ length: 9 }, () => [rand(), 0.15 + rand() * 0.7, 0.5 + rand() * 0.5]);
  const moon = [0.68, 0.32];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const top = [0x09, 0x10, 0x1c];
      const bot = [0x18, 0x22, 0x30];
      const sky = smooth(0, 1, v);
      let r = top[0] + (bot[0] - top[0]) * sky;
      let g = top[1] + (bot[1] - top[1]) * sky;
      let b = top[2] + (bot[2] - top[2]) * sky;
      const dm = Math.hypot(u - moon[0], v - moon[1]);
      const moonCore = 1 - smooth(0.03, 0.05, dm);
      const moonHalo = (1 - smooth(0.05, 0.22, dm)) * 0.5;
      r += 210 * moonCore + 120 * moonHalo;
      g += 220 * moonCore + 140 * moonHalo;
      b += 200 * moonCore + 150 * moonHalo;
      for (const [lx, ly, lb] of lights) {
        const d = Math.hypot(u - lx, v - ly);
        const glow = (1 - smooth(0.0, 0.045, d)) * lb;
        r += 235 * glow;
        g += 200 * glow;
        b += 120 * glow;
      }
      Al[i * 4] = Math.min(255, r);
      Al[i * 4 + 1] = Math.min(255, g);
      Al[i * 4 + 2] = Math.min(255, b);
      Al[i * 4 + 3] = 255;
    }
  }
  return dataTexture(Al, size, size, true);
}

