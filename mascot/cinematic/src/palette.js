// Accent-tinted jelly palette: keeps the studio ramp's lightness/contrast (that carries the "jelly,
// not plastic" read — see materials.js) and rotates its hue to the caller's accent color, the same
// idea tools/agents/mascot-theme.mjs uses for the flat SVG mascot, reimplemented here self-contained
// (this package pins its own deps; it does not import across product boundaries).
const hex2rgb = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255); };
const rgb2hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return t.map((v) => v + m);
}

// The studio's default look (scene.js PALETTE, unchanged): deep shadow -> bottle -> neon -> olive
// (the hero midtone) -> pale rim. Hue is replaced per-agent; lightness is not, so the material's
// contrast (and with it its transmissive "light passes through" read) survives every accent.
export const BASE_RAMP = { deep: '#0D4A02', bottle: '#297F04', neon: '#5AB60D', olive: '#99E72A', pale: '#C8DDA6' };
// How far each stop drifts from the anchor hue, as a fraction of the fleet's per-agent spread:
// deep/bottle cool down (subsurface shadow), pale warms up (light escaping a thin edge) — mirrors
// tools/agents/mascot-theme.mjs's SPREAD table, trimmed to the five stops this package renders.
const SPREAD = { deep: -0.34, bottle: -0.18, neon: 0, olive: 0.18, pale: 0.42 };
const HEX6 = /^#[0-9a-fA-F]{6}$/;

function retint(rampHex, hue, satTarget) {
  const [, s0, l0] = rgb2hsl(...hex2rgb(rampHex));
  const s = Math.min(1, Math.max(0.3, s0 * satTarget));
  const l = Math.max(0.04, Math.min(0.94, l0));
  return rgb2hex(...hsl2rgb(((hue % 360) + 360) % 360, s, l));
}

/** Accent hex -> the tinted studio ramp (deep/bottle/neon/olive/pale) plus the fixed hero tokens
 *  (glasses/hat/bow/eye stay black/gold/white — the character's identity, not the agent's).
 *  Falls back to the base ramp's own hue for a missing/invalid accent, so a bad theme never breaks
 *  the render (see build's tintAll test: every accent must resolve to a valid #rrggbb 6-hex value). */
export function tintPalette(accentHex) {
  const accent = HEX6.test(accentHex || '') ? accentHex : BASE_RAMP.olive;
  const [h0, s0] = rgb2hsl(...hex2rgb(accent));
  const satTarget = 0.55 + s0 * 0.55;
  // Warm drift toward ~40deg (amber), the same anchor the flat mascot uses for its subsurface
  // warmth — an accent already near there gets a smaller, but never zero, spread.
  const drift = ((40 - h0 + 540) % 360) - 180;
  const spreadDeg = (Math.sign(drift) || 1) * Math.min(70, Math.max(26, Math.abs(drift)));
  const out = {};
  for (const k of Object.keys(BASE_RAMP)) out[k] = retint(BASE_RAMP[k], h0 + spreadDeg * SPREAD[k], satTarget);
  return {
    bg: '#050706',
    ink: '#0A0C0A',
    inkSoft: '#2A2E24',
    eye: '#F4FAEA',
    gold: '#D9A521',
    softOlive: retint('#848D68', h0 + spreadDeg * 0.08, Math.max(0.4, satTarget * 0.6)),
    ...out,
  };
}
