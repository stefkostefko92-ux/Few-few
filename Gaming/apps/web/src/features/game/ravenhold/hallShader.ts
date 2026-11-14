import { GRADE_GLSL } from "./gradeGlsl";

/**
 * The Рейвънхолд hall — one full-screen fragment shader drawn behind every game
 * table (WebGL2, half resolution, governed). A castle hall at night in the
 * spirit of boy's courtyard: ashlar stone lit by two torches, cold moon shafts
 * with drifting dust, rising embers, a wet flagstone floor that mirrors the
 * fire, height fog with warm in-scattering, then boy's ACES/split-tone/grain
 * grade. Everything procedural — no images.
 *
 * Safety: torch flicker is smooth value noise (≤ 4 Hz, ±4–10 % luminance, in
 * small regions) — no flashes, no strobe. With `uMotion = 0` (reduced motion)
 * the time is frozen by the host and the frame is fully static.
 */
export const HALL_VERT = /* glsl */ `#version 300 es
  in vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const HALL_FRAG = /* glsl */ `#version 300 es
  precision highp float;
  out vec4 fragColor;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uFire;
  uniform float uFireAmt;
  uniform vec3 uMoon;
  uniform float uMoonAmt;
  uniform vec3 uFog;
  uniform float uEmbers;
  uniform float uExposure;
  uniform float uGrain;

  ${GRADE_GLSL}

  float h12(vec2 p) { return ravenHash(p); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  // Ashlar wall in running bond: per-block tone, grain, pitting, bevel, mortar.
  vec3 stone(vec2 q) {
    vec2 b = q * vec2(3.4, 7.2);
    float row = floor(b.y);
    b.x += mod(row, 2.0) * 0.5 + h12(vec2(row, 3.0)) * 0.3;
    vec2 cell = floor(b), f = fract(b);
    float edge = min(min(f.x, 1.0 - f.x) * 2.1, min(f.y, 1.0 - f.y));
    float mortar = smoothstep(0.0, 0.07, edge);
    float tone = h12(cell);
    float grain = fbm(q * 26.0 + cell * 3.1);
    float pits = smoothstep(0.62, 0.82, fbm(q * 64.0 + cell));
    vec3 base = mix(vec3(0.055, 0.050, 0.046), vec3(0.095, 0.086, 0.076), tone);
    base *= 0.72 + 0.56 * grain;
    base *= 1.0 - 0.38 * pits;
    float bevel = smoothstep(0.0, 0.14, f.y) - 0.6 * smoothstep(0.86, 1.0, f.y);
    base *= 0.82 + 0.3 * bevel;
    return base * mix(0.22, 1.0, mortar);
  }

  float flicker(float t, float seed) {
    return 0.86 + 0.1 * vnoise(vec2(t * 1.7, seed)) + 0.04 * vnoise(vec2(t * 4.1, seed + 3.7));
  }

  // Point glow of a torch on a surface at q (inverse-square with a soft core).
  vec3 torchLight(vec2 q, vec2 t, float fl) {
    vec2 d = q - t;
    return uFire * uFireAmt * fl * 0.02 / (dot(d, d) + 0.0035);
  }

  // Cold moon shafts falling from high windows off the top-left of the frame.
  float shafts(vec2 q, float A, float t) {
    vec2 S = vec2(-A * 0.5 - 0.15, 0.78);
    vec2 D = normalize(vec2(0.62, -1.0));
    vec2 N = vec2(-D.y, D.x);
    float m = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 o = S + N * (fi * 0.34 - 0.05);
      float along = dot(q - o, D);
      float across = abs(dot(q - o, N));
      float w = 0.035 + along * 0.06;
      float beam = smoothstep(w, w * 0.25, across) * smoothstep(-0.05, 0.25, along) * exp(-along * 0.9);
      m += beam * (0.75 + 0.25 * vnoise(vec2(fi * 7.0, t * 0.08)));
    }
    return m;
  }

  vec3 embers(vec2 q, vec2 src, float t, float seed) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      if (fi >= uEmbers) break;
      float h1 = h12(vec2(fi, seed)), h2 = h12(vec2(fi + 7.0, seed * 1.3)), h3 = h12(vec2(fi * 3.1, seed + 11.0));
      float life = 3.0 + 3.0 * h1;
      float age = fract((t + h2 * life) / life);
      vec2 p = src + vec2((h3 - 0.5) * 0.04 + sin(t * 0.9 + fi) * 0.02 * age, age * 0.3);
      float d = length(q - p);
      float glow = exp(-d * d * 70000.0) * (1.0 - age) * smoothstep(0.0, 0.06, age);
      acc += vec3(1.0, 0.42, 0.1) * glow * 4.5;
    }
    return acc;
  }

  // A torch flame + iron sconce, drawn emissive (so it blooms through ACES).
  vec3 flame(vec2 q, vec2 t, float time, float seed, out float cover) {
    vec2 p = (q - t) / vec2(0.016, 0.042);
    p.x += (vnoise(vec2(p.y * 1.5 - time * 3.0, seed)) - 0.5) * 0.6 * max(p.y, 0.0);
    float body = smoothstep(1.0, 0.0, length(p * vec2(1.0, 0.72) - vec2(0.0, 0.25)));
    float core = smoothstep(0.55, 0.0, length(p * vec2(1.2, 0.9) - vec2(0.0, -0.05)));
    vec3 col = mix(vec3(0.9, 0.18, 0.03), vec3(1.0, 0.62, 0.22), body) * body * 6.0 + vec3(1.0, 0.86, 0.6) * core * 9.0;
    vec2 s = (q - t - vec2(0.0, -0.028)) / vec2(0.022, 0.012);
    cover = smoothstep(1.0, 0.8, length(s)) * step(s.y, 0.2);
    return col * uFireAmt;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float A = uRes.x / uRes.y;
    vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float t = uTime;
    const float FLOOR = -0.34;

    vec2 tL = vec2(-A * 0.5 + 0.085, 0.06);
    vec2 tR = vec2(A * 0.5 - 0.085, 0.06);
    float fL = flicker(t, 1.3), fR = flicker(t, 5.9);
    float moonM = shafts(q, A, t);
    vec3 col;

    if (q.y > FLOOR) {
      // ── the wall ──
      vec3 alb = stone(q);
      vec3 light = vec3(0.012, 0.014, 0.02) + torchLight(q, tL, fL) + torchLight(q, tR, fR);
      light += uFire * uFireAmt * 0.22 * exp(-dot(q - vec2(0.0, 0.62), q - vec2(0.0, 0.62)) * 3.0);
      light += uMoon * uMoonAmt * moonM * 0.9;
      col = alb * light;
      float cL, cR;
      vec3 fl1 = flame(q, tL, t, 2.0, cL);
      vec3 fl2 = flame(q, tR, t, 8.0, cR);
      col = mix(col, vec3(0.004), max(cL, cR)) + fl1 + fl2;
    } else {
      // ── wet flagstone floor in perspective, mirroring the torches ──
      float dz = FLOOR - q.y;
      float z = 0.16 / (dz + 0.025);
      vec2 fp = vec2(q.x * z * 2.2, z * 3.0);
      vec2 fc = floor(fp), ff = fract(fp);
      float seam = smoothstep(0.0, 0.05, min(min(ff.x, 1.0 - ff.x), min(ff.y, 1.0 - ff.y)));
      vec3 alb = mix(vec3(0.04, 0.038, 0.036), vec3(0.07, 0.064, 0.058), h12(fc)) * mix(0.35, 1.0, seam);
      float wet = smoothstep(0.42, 0.62, fbm(fp * 0.6 + 4.0));
      vec3 light = vec3(0.01, 0.012, 0.018) + torchLight(q, tL, fL) * 0.6 + torchLight(q, tR, fR) * 0.6;
      col = alb * light;
      // mirrored fire, stretched vertically and broken by ripples
      float rip = vnoise(vec2(fp.x * 6.0, fp.y * 6.0 + t * 0.35)) - 0.5;
      vec2 mq = vec2(q.x + rip * 0.012, 2.0 * FLOOR - q.y);
      vec2 dL = (mq - tL) * vec2(1.0, 0.3), dR = (mq - tR) * vec2(1.0, 0.3);
      vec3 refl = uFire * uFireAmt * (fL * 0.004 / (dot(dL, dL) + 0.0009) + fR * 0.004 / (dot(dR, dR) + 0.0009));
      refl += uMoon * uMoonAmt * moonM * 0.25;
      col += refl * mix(0.08, 0.55, wet) * smoothstep(0.0, 0.03, dz);
    }

    // rising embers from both torches
    col += embers(q, tL + vec2(0.0, 0.03), t, 1.0) + embers(q, tR + vec2(0.0, 0.03), t, 2.0);

    // dust motes drifting inside the moon shafts
    float dust = pow(vnoise(q * 150.0 + vec2(t * 0.04, -t * 0.11)), 40.0);
    col += uMoon * uMoonAmt * (moonM * 0.03 + moonM * moonM * dust * 1.2);

    // height fog: cold, thickest at the floor and the upper corners; warm near fire
    vec2 dLf = q - tL, dRf = q - tR;
    vec3 fogCol = uFog + uFire * uFireAmt * 0.004 * (1.0 / (dot(dLf, dLf) + 0.03) + 1.0 / (dot(dRf, dRf) + 0.03));
    float fogAmt = 0.3 + 0.45 * smoothstep(FLOOR + 0.1, -0.5, q.y) + 0.2 * smoothstep(0.2, 0.5, abs(q.x) / A + q.y * 0.3);
    col = mix(col, fogCol, clamp(fogAmt, 0.0, 0.85));

    col = ravenGrade(col * uExposure, uv, A, t, uGrain, 0.45);
    fragColor = vec4(col, 1.0);
  }
`;
