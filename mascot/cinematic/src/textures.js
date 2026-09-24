// Procedural PBR surfaces: every map is generated at load time, tileable, no external images.
// Domain-specific to the mascot (carbon twill sealed inside the jelly, satin weave for the
// bow tie, felt for the mortarboard) — written for this package, not copied from boy/.
import { Noise2, rng, smooth } from './noise.js';
import { dataTexture, heightToNormal, grayToRGBA } from './texture-util.js';

export { setMaxAnisotropy } from './texture-util.js';

// 2x2 diagonal twill, barely-there height so the weave reads as a material under the transmissive
// jelly rather than a printed pattern (defect #3: the body was a flat matte olive before).
export function carbonTwillTextures(size = 256, cells = 18) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const nz = new Noise2(31);
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
      H[i] = strand * 0.35 + fiber * 0.1;
      R[i] = 0.32 + 0.14 * strand + 0.06 * fiber;
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

// Sparse pit noise used only as the emissive mask for the jelly's inner glow core, so the glow
// breathes with faint internal structure instead of a flat sphere.
export function coreGlowTexture(size = 64) {
  const n = size * size;
  const A = new Uint8Array(n * 4);
  const rand = rng(4);
  const nz = new Noise2(4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const v = 0.6 + 0.4 * nz.fbm((x / size) * 6, (y / size) * 6, 6, 4);
      A[i * 4] = A[i * 4 + 1] = A[i * 4 + 2] = Math.min(255, v * 255);
      A[i * 4 + 3] = 255;
    }
  }
  void rand;
  return dataTexture(A, size, size, false);
}
