// GLSL building blocks for the baked surface textures: hashes, value and gradient noise, fBm, Worley cells.
// Coordinates are millimetres on the board, so every pattern keeps its real size whatever the texture size.
export const NOISE = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = hash22(i) * 2.0 - 1.0;
  vec2 gb = hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0;
  vec2 gc = hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0;
  vec2 gd = hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0;
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);
}
// fractal sums with a fixed loop bound; octaves beyond n are skipped
float fbm(vec2 p, int n) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= n) break;
    s += a * gnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.3;
    a *= 0.5;
  }
  return s;
}
float vfbm(vec2 p, int n) {
  float s = 0.0;
  float a = 0.5;
  float t = 0.0;
  for (int i = 0; i < 7; i++) {
    if (i >= n) break;
    s += a * vnoise(p);
    t += a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
    a *= 0.5;
  }
  return s / t;
}
float ridged(vec2 p, int n) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= n) break;
    s += a * (1.0 - abs(gnoise(p) * 2.0));
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 5.1;
    a *= 0.5;
  }
  return s;
}
// Worley: x = distance to the nearest feature point, y = to the second one, z = hash of the nearest cell
vec3 worley(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 9.0;
  float d2 = 9.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(i + g);
      float d = length(g + o - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash12(i + g + 7.7);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(d1, d2, id);
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;

// The surface every pattern fills in: linear albedo, height in millimetres (for the normal map), roughness, metal.
export const SURFACE = /* glsl */ `
struct Surface {
  vec3 albedo;
  float height;
  float rough;
  float metal;
};
`;
