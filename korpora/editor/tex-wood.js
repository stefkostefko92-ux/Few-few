// Wood decors as a sawn log, not as stripes: every plank of the print is cut from its own log at some depth below
// the pith, the log tapers, so the growth rings cross the face as straight grain at the edges and as cathedral arches
// in the middle. Then fibres, open pores in the early wood, rays, knots, and for rustic decors saw marks and cracks.
// The species and the style come from the decor name; the colour from the catalogue (calibrated in the baker).
import * as THREE from 'three';
import { tones, woodLook } from './tex-wood-species.js';

const WOOD_GLSL = /* glsl */ `
float plankAt(float y, out float y0, out float w) {
  float pw = uPlank.x;
  float c = floor(y / pw);
  float b0 = c * pw + (hash11(c * 1.37 + uSeed) - 0.5) * uPlank.y;
  float b1 = (c + 1.0) * pw + (hash11((c + 1.0) * 1.37 + uSeed) - 0.5) * uPlank.y;
  if (y < b0) { c -= 1.0; b1 = b0; b0 = c * pw + (hash11(c * 1.37 + uSeed) - 0.5) * uPlank.y; }
  else if (y >= b1) { c += 1.0; b0 = b1; b1 = (c + 1.0) * pw + (hash11((c + 1.0) * 1.37 + uSeed) - 0.5) * uPlank.y; }
  y0 = b0;
  w = b1 - b0;
  return c;
}

void pattern(vec2 p, inout Surface s) {
  float x = p.x;
  float yp0;
  float pw;
  float pid = plankAt(p.y, yp0, pw);
  float y = p.y - yp0;
  // floor boards end in joints (uJoint = board length); a decor print runs its boards the whole length
  float jid = 0.0;
  float seamX = 1e4;
  if (uJoint > 0.0) {
    float sh = hash11(pid * 3.7 + uSeed) * uJoint;
    jid = floor((x + sh) / uJoint);
    float lx = x + sh - jid * uJoint;
    seamX = min(lx, uJoint - lx);
    x = lx + jid * 913.0;
  }
  vec3 h = hash32(vec2(pid, jid) * 1.73 + uSeed);
  vec3 h2 = hash32(vec2(jid, pid) * 2.11 + uSeed + 9.0);
  // how this plank was sawn: flat (pith under the plank, rings cross the face as cathedral arches) or rift/quarter
  // (pith far to the side, the rings run along the plank as straight lines)
  bool flatSawn = h2.z < uCathedral;
  float y0 = flatSawn ? mix(0.2, 0.8, h.x) * pw : (h.x < 0.5 ? -1.0 : 1.0) * mix(90.0, 320.0, h.y) + (h.x < 0.5 ? 0.0 : pw);
  float d0 = flatSawn ? mix(22.0, 150.0, h.y * h.y) : mix(4.0, 45.0, h.y);
  float taper = mix(0.012, 0.05, h.z) * (h2.x < 0.5 ? 1.0 : -1.0) * (flatSawn ? 1.0 : 0.2);
  float wave = fbm(vec2(x * 0.0011, p.y * 0.0042) + h.xy * 50.0, 4) * (8.0 + 50.0 * uFigure);
  float yy = y - y0 + wave + fbm(vec2(x * 0.006, p.y * 0.05), 3) * 2.0;
  float dd = d0 + taper * x + fbm(vec2(x * 0.0012, p.y * 0.011) + 31.0, 3) * (1.5 + 4.0 * uFigure);
  float r = sqrt(yy * yy + dd * dd);
  // knots: a branch cut across, darker, with its own tight rings, a rim of bark and radial checks; the rings of the
  // board swirl around it in an eye a few diameters long. Each knot belongs to one plank, as in glued boards.
  float knot = 0.0;
  float knotShade = 1.0;
  float knotLine = 0.0;
  float halo = 0.0;
  if (uKnots > 0.0) {
    float kx0 = floor(x / 420.0);
    for (int i = -1; i <= 1; i++) {
      float kx = kx0 + float(i);
      vec3 kh = hash32(vec2(kx, pid) * 3.1 + uSeed + 2.0);
      if (kh.z > uKnots) continue;
      float rk = mix(4.0, 10.0, hash11(kx * 5.3 + pid * 1.7 + uSeed));
      vec2 d = vec2(x, y) - vec2((kx + 0.15 + 0.7 * kh.x) * 420.0, mix(0.3, 0.7, kh.y) * pw);
      float elong = mix(1.25, 2.1, fract(kh.x * 7.31));
      vec2 q = d / vec2(rk * elong, rk);
      vec2 e = d / vec2(rk * elong * 3.2, rk * 1.8);
      float ee = dot(e, e);
      r += uRing * 3.5 * exp(-ee);
      halo = max(halo, exp(-ee * 1.4));
      float ang = atan(q.y, q.x);
      float dist = length(q) / (1.0 + 0.32 * (vnoise(vec2(cos(ang), sin(ang)) * 1.6 + kh.xy * 17.0) - 0.5));
      if (dist < 1.15) {
        knot = max(knot, 1.0 - smoothstep(0.98, 1.1, dist));
        // end grain of the branch: its own fine rings, darker towards the bark
        float own = 0.5 + 0.5 * sin(dist * rk * 3.6 + vnoise(q * 2.5 + kh.xy * 9.0) * 3.0);
        knotShade = 0.75 - 0.3 * own * smoothstep(0.1, 0.3, dist) - 0.2 * smoothstep(0.5, 0.95, dist);
        float rim = smoothstep(0.8, 0.95, dist) * (1.0 - smoothstep(1.0, 1.1, dist));
        // one or two drying checks from near the pith outwards, at random angles, a fraction of a millimetre wide
        float checks = 0.0;
        for (int c = 0; c < 2; c++) {
          vec2 ch = hash22(vec2(kx, pid) * 7.7 + float(c) * 3.3 + uSeed);
          if (ch.y > 0.55) continue;
          float da = ang - ch.x * 6.283;
          float across = abs(sin(da)) * dist * rk;
          checks = max(checks, (1.0 - smoothstep(0.15, 0.45, across)) * step(0.0, cos(da))
            * smoothstep(0.15, 0.3, dist) * (1.0 - smoothstep(0.8, 0.95, dist)));
        }
        float pith = 1.0 - smoothstep(0.04, 0.09, dist);
        knotLine = max(knotLine, max(rim, max(checks, pith)));
      }
    }
  }
  // uneven growth: some years wide, some narrow
  float rr = r + fbm(vec2(r * 0.045, h.x * 13.0 + pid), 3) * uRing * 2.2;
  float ring = rr / (uRing * mix(0.85, 1.2, h2.y)) + fbm(vec2(x * 0.004, p.y * 0.03), 2) * 0.25;
  float f = fract(ring);
  float late = smoothstep(0.5, 0.8, f) * (1.0 - smoothstep(0.965, 1.0, f));
  float ringK = mix(0.45, 1.15, hash11(floor(ring) * 7.13 + pid * 3.1 + uSeed));
  // the straight grain of rift planks shows thinner, fainter rings than the arches of flat ones
  float arch = 1.0 - smoothstep(0.4, 2.2, abs(yy) / max(dd, 1.0));
  float lateW = mix(0.55, 1.0, arch);
  // fibres along the grain and broad colour streaks
  float fib = fbm(vec2(x * 0.012, yy * 0.75), 4);
  float fine = vnoise(vec2(x * 0.06, yy * 3.2)) - 0.5;
  float streak = fbm(vec2(x * 0.0022, yy * 0.085) + h.yz * 30.0, 4);
  // colour drift along the plank and between planks (heartwood, sapwood, mineral streaks)
  float drift = fbm(vec2(x * 0.0007, p.y * 0.0045) + h.yz * 70.0, 3);
  float t = (h.x - 0.5) * 2.0 * uPlankTone + drift * 0.5 * (0.5 + uRustic) + streak * 0.75 * uContrast
    - late * ringK * lateW * uContrast + fib * 0.32 + fine * 0.14 - halo * 0.3 * uContrast;
  // pores: open in the early wood, finer and scattered in the late wood
  float pores = 0.0;
  if (uPores > 0.0) {
    // vessels cut lengthwise: thin dark streaks a few millimetres long
    vec3 w = worley(vec2(x / 9.0, yy / 0.85));
    float ew = mix(0.25, 1.0, 1.0 - smoothstep(0.0, 0.3, f));
    pores = (1.0 - smoothstep(0.16, 0.4, w.x)) * step(w.z, uPores * ew);
  }
  // rays: short silvery flecks where the cut is radial (oak, beech)
  float rays = 0.0;
  if (uRays > 0.0) {
    float radial = smoothstep(0.6, 2.5, abs(yy) / max(dd, 1.0));
    vec3 w = worley(vec2(x / 7.0, yy / 1.1));
    rays = (1.0 - smoothstep(0.2, 0.45, w.x)) * step(w.z, 0.45) * radial * uRays;
  }
  // rustic: band-saw marks across the grain (thin, slightly slanted, uneven in pitch, only in patches) and dark
  // cracks along it
  float crack = 0.0;
  float saw = 0.0;
  if (uRustic > 0.0) {
    float pitch = x + y * 0.12 + fbm(vec2(x * 0.004, p.y * 0.006) + 7.0, 2) * 30.0;
    saw = pow(0.5 + 0.5 * sin(pitch * 0.62), 3.0) *
      smoothstep(0.45, 0.85, vnoise(vec2(x * 0.0025, p.y * 0.008) + 4.0)) * uRustic;
    vec2 cc = vec2(260.0, 70.0);
    vec2 cg = floor(vec2(x, p.y) / cc);
    vec3 ch = hash32(cg * 1.9 + uSeed + 13.0);
    if (ch.z < 0.22 * uRustic) {
      float cx = (cg.x + 0.5) * cc.x;
      float hl = cc.x * mix(0.15, 0.45, ch.x);
      float along = 1.0 - smoothstep(hl * 0.5, hl, abs(x - cx));
      float cy = (cg.y + 0.2 + 0.6 * ch.y) * cc.y + fbm(vec2(x * 0.02, cg.y), 2) * 4.0;
      float width = 0.7 * along;
      crack = (1.0 - smoothstep(width * 0.4, width, abs(p.y - cy))) * along;
    }
  }
  // glued boards show their joints; veneer-like decors only change from piece to piece
  float seam = 0.0;
  if (uSeam > 0.0) {
    seam = 1.0 - smoothstep(0.0, 0.7, min(y, pw - y));
    if (uJoint > 0.0) seam = max(seam, 1.0 - smoothstep(0.0, 0.7, seamX));
    seam *= uSeam;
  }
  vec3 col = t < 0.0 ? mix(uMid, uDark, min(-t, 1.0)) : mix(uMid, uLight, min(t, 1.0));
  col = mix(col, uDark * 0.7, pores * 0.4);
  col = mix(col, uLight * 1.05, rays * 0.5);
  col = mix(col, uDark * 0.8, saw * 0.08);
  col = mix(col, mix(uDark * knotShade, uDark * 0.32, knotLine), knot);
  col = mix(col, uDark * 0.18, crack);
  col = mix(col, uDark * 0.55, seam * 0.6);
  s.albedo = col;
  s.height = -pores * 0.045 - crack * 0.35 + late * lateW * uRelief + fib * 0.012 - seam * 0.08
    - knot * (0.02 + knotLine * 0.05) - saw * 0.008;
  s.rough = clamp(uGloss + pores * 0.18 + crack * 0.3 - late * 0.03 - rays * 0.05, 0.05, 1.0);
  s.metal = 0.0;
}
`;

export function woodSpec(d, seed) {
  const sp = woodLook(`${d.name ?? ''} ${d.nameEn ?? ''} ${d.code ?? ''}`);
  const rustic = sp.rustic;
  const mid = new THREE.Color(d.hex);
  const { dark, light } = tones(mid, sp.contrast);
  const gloss =
    { gloss: 0.18, 'high-gloss': 0.1, satin: 0.36, pearl: 0.38, matt: 0.5, 'super-matt': 0.62 }[
      d.finish
    ] ?? 0.48;
  return {
    kind: 'wood',
    glsl: WOOD_GLSL,
    span: [2400, 800],
    size: [2048, 1024],
    color: d.hex,
    uniforms: {
      uMid: { value: mid },
      uLight: { value: light },
      uDark: { value: dark },
      uRing: { value: sp.ring },
      uContrast: { value: Math.min(1, sp.contrast) },
      uPlank: { value: new THREE.Vector2(rustic ? 190 : 230, rustic ? 90 : 120) },
      uJoint: { value: 0 },
      uPlankTone: { value: sp.tone },
      uCathedral: { value: sp.cathedral },
      uPores: { value: sp.pores },
      uRays: { value: sp.rays },
      uKnots: { value: sp.knots },
      uRustic: { value: rustic },
      uSeam: { value: rustic ? 1 : 0 },
      uFigure: { value: sp.figure },
      uRelief: { value: 0.03 },
      uGloss: { value: gloss },
      uSeed: { value: (seed % 997) * 0.731 },
    },
  };
}
