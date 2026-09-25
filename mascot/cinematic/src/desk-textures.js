// Procedural PBR surfaces for the desk SET the mascot sits inside of (desk.js) — split out of
// textures.js (the mascot's own material bakes) purely to stay under the house 300-line cap; same
// conventions (Noise2/rng, dataTexture/heightToNormal/grayToRGBA). Also the bake source: `bake/
// index.mjs` imports these same functions at a larger `size` and writes the result to
// `dist/tex/*.webp` — one generator, two callers (runtime fallback + offline bake).
import { Noise2, rng, smooth } from './noise.js';
import { dataTexture, heightToNormal, grayToRGBA } from './texture-util.js';

// Dark lacquered walnut desktop: six individually-toned PLANKS (a seam is what actually reads as
// "wood furniture" rather than one continuous streaky sheet — 2026-09-25 review regression, the
// single-sine-wave version read as "wavy silvery paper/water"), each with its own irregular
// cathedral-grain streaks (warped fbm bands, not a pure sine — real timber grain wanders, it does
// not repeat on a clean period) and a sparse scatter of fine lacquer micro-scratches baked into
// the roughness so the gloss breaks up instead of mirroring flat.
export function woodTextures(size = 512, planks = 6) {
  const n = size * size;
  const H = new Float32Array(n);
  const R = new Float32Array(n);
  const Al = new Uint8Array(n * 4);
  const grainNz = new Noise2(41);
  const toneRand = rng(41);
  // A little darker/redder or lighter/yellower per plank — real boards from the same tree still
  // vary, which is exactly what sells "assembled from planks" over "one printed sheet".
  const tones = Array.from({ length: planks }, () => [
    92 + toneRand() * 26 - 13, 56 + toneRand() * 16 - 8, 28 + toneRand() * 10 - 5,
  ]);
  const dark = [30, 16, 8];
  // Genuinely MICRO scratches: a few thousandths of the desk's own length each, and a light touch
  // on roughness — the first bake ran these far too long/bright and they read as a scratched-glass
  // grid instead of the lacquer's own faint handling wear (2026-09-25 review regression).
  const scratchRand = rng(205);
  const scratches = Array.from({ length: 26 }, () => ({ x: scratchRand(), y: scratchRand(), len: 0.006 + scratchRand() * 0.018, ang: scratchRand() * Math.PI, w: 0.0006 + scratchRand() * 0.0007 }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const plankF = u * planks;
      const plankI = Math.min(planks - 1, Math.floor(plankF));
      const pu = plankF - plankI; // 0..1 across this plank's own width
      const seam = Math.min(pu, 1 - pu) * planks; // 0 at the seam, 1 mid-plank
      const seamShade = smooth(0, 0.06, seam); // dark groove right at each plank edge
      // Irregular grain: warped fbm bands along the plank's length (v), amplitude modulated by a
      // slower fbm so streaks fade in and out instead of running edge-to-edge uniformly.
      const warp = grainNz.fbm(pu * 2 + plankI * 7, v * 1.1, 6, 3) * 1.6;
      const bandPhase = (v * 7 + warp + plankI * 3.1) % 1;
      const band = Math.pow(Math.abs(Math.sin(bandPhase * Math.PI)), 4);
      const streakPresence = smooth(0.25, 0.85, grainNz.fbm(pu * 3 + plankI * 5, v * 0.8 + 9, 5, 2));
      const fiber = grainNz.fbm(pu * 40 + plankI * 11, v * 40, 40, 3);
      const grain = band * streakPresence * 0.75 + fiber * 0.25;
      let scratch = 0;
      for (const s of scratches) {
        const dx = u - s.x;
        const dy = v - s.y;
        const along = dx * Math.cos(s.ang) + dy * Math.sin(s.ang);
        const across = -dx * Math.sin(s.ang) + dy * Math.cos(s.ang);
        if (Math.abs(along) < s.len && Math.abs(across) < s.w) scratch = Math.max(scratch, 1 - Math.abs(across) / s.w);
      }
      H[i] = grain * 0.4 + fiber * 0.08 - seamShade * -0.5 - (1 - seamShade) * 0.35;
      // Roughness stays off the periodic `grain` band on purpose — that period, under a direct
      // specular light, aliased into a bright/dark grid (2026-09-25 review regression: "чете като
      // решетка"). Non-periodic fiber noise only, so the lacquer sheen varies smoothly.
      R[i] = 0.16 + 0.08 * fiber + (1 - seamShade) * 0.3 + scratch * 0.1;
      const t = Math.min(1, grain * 0.85 + (1 - seamShade) * 0.9);
      const base = tones[plankI];
      Al[i * 4] = base[0] + (dark[0] - base[0]) * t;
      Al[i * 4 + 1] = base[1] + (dark[1] - base[1]) * t;
      Al[i * 4 + 2] = base[2] + (dark[2] - base[2]) * t;
      Al[i * 4 + 3] = 255;
    }
  }
  return {
    albedoMap: dataTexture(Al, size, size, true),
    normalMap: dataTexture(heightToNormal(H, size, size, 1.3), size, size, false),
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
