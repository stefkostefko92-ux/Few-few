/**
 * The display grade of boy/src/post-final.js as a reusable GLSL chunk: ACES
 * RRT/ODT, sRGB, 92 % saturation, a cool-shadow / warm-highlight split tone, a
 * gentle S-curve, luma-weighted film grain and a 1/255 dither. Shared by the
 * hall backdrop and (in WebGL2) the 3D scenes' final pass, so both halves of
 * the screen are graded by the very same maths.
 *
 * `ravenGrade(linearCol, uv, aspect, time, grain, vignette, acesOn)` returns an
 * sRGB colour. Grain uses `gl_FragCoord`, so it is resolution-true; with a
 * frozen `time` (reduced motion) the grain is static.
 */
export const GRADE_GLSL = /* glsl */ `
  const vec3 RAVEN_LUMA = vec3(0.2126, 0.7152, 0.0722);
  const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 ravenRrtOdt(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  float ravenHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // Split-tone + S-curve + grain on an already display-referred (sRGB) colour.
  vec3 ravenLook(vec3 col, float time, float grain) {
    float l = dot(col, RAVEN_LUMA);
    col = mix(vec3(l), col, 0.92);
    col += vec3(-0.012, 0.004, 0.02) * (1.0 - l) * (1.0 - l);
    col += vec3(0.03, 0.012, -0.018) * l * l;
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
    float g = ravenHash(gl_FragCoord.xy + fract(time * 7.13) * 431.0) - 0.5;
    col += g * grain * (1.0 - l * 0.7);
    col += (ravenHash(gl_FragCoord.xy * 1.37 + 17.0) - 0.5) / 255.0;
    return clamp(col, 0.0, 1.0);
  }
  // Full grade from LINEAR scene colour (used by the hall backdrop).
  vec3 ravenGrade(vec3 col, vec2 uv, float aspect, float time, float grain, float vignette) {
    vec2 d = (uv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(d, d);
    col *= clamp(1.0 - vignette * pow(r2 * 1.6, 1.3), 0.0, 1.0);
    col = clamp(ACESOut * ravenRrtOdt(ACESIn * col), 0.0, 1.0);
    col = pow(col, vec3(1.0 / 2.2));
    return ravenLook(col, time, grain);
  }
`;
