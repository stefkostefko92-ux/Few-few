import { GRADE_GLSL } from "./gradeGlsl";

/**
 * The Рейвънхолд display grade for the 3D boards (boy/src/post-final.js):
 * vignette, 92 % saturation, cool-shadow/warm-highlight split tone, S-curve,
 * luma-weighted film grain and dither — applied AFTER tone mapping + sRGB, so
 * the scenes keep their ACES exposure and just take on the hall's look.
 *
 * WebGL2: a ShaderPass shader object (EffectComposer, dead-last). Alpha is
 * passed through untouched so a transparent board canvas still reveals the
 * hall behind it.
 */
export const RavenGradeShader = {
  uniforms: {
    tDiffuse: { value: null as unknown },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.35 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAspect;
    varying vec2 vUv;
    ${GRADE_GLSL}
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float a = texel.a;
      // The canvas composites premultiplied: grade the straight colour, then
      // premultiply again — otherwise the split tone lifts fully transparent
      // pixels and a faint blue box appears over the hall.
      vec3 col = a > 0.0001 ? texel.rgb / a : vec3(0.0);
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r2 = dot(d, d);
      col *= clamp(1.0 - uVignette * pow(r2 * 1.6, 1.3), 0.0, 1.0);
      gl_FragColor = vec4(ravenLook(col, uTime, uGrain) * a, a);
    }`,
};

type Tsl = typeof import("three/tsl");
type TslNode = ReturnType<Tsl["vec4"]>;

/** The per-frame time uniform that animates the grain (typed via inference). */
export const makeGradeTime = (tsl: Tsl) => tsl.uniform(0);
export type GradeTime = ReturnType<typeof makeGradeTime>;

/**
 * WebGPU: the same grade as a TSL node, applied to `renderOutput(...)` (i.e.
 * after ACES + sRGB) with PostProcessing.outputColorTransform = false. `time`
 * is a uniform the host advances per frame (frozen for reduced motion).
 */
export function ravenGradeNode(tsl: Tsl, input: TslNode, time: GradeTime, grain: number, vignette: number): TslNode {
  const { Fn, vec2, vec3, vec4, float, dot, mix, clamp, pow, fract, max, select, screenUV, screenSize, screenCoordinate } = tsl;
  const grade = Fn(() => {
    const a = input.a;
    const col = select(a.greaterThan(0.0001), input.rgb.div(max(a, 0.0001)), vec3(0)).toVar();
    const d = screenUV.sub(0.5).mul(vec2(screenSize.x.div(screenSize.y), 1));
    const r2 = dot(d, d);
    col.mulAssign(clamp(float(1).sub(pow(r2.mul(1.6), 1.3).mul(vignette)), 0, 1));
    const l = dot(col, vec3(0.2126, 0.7152, 0.0722)).toVar();
    col.assign(mix(vec3(l), col, 0.92));
    const inv = float(1).sub(l);
    col.addAssign(vec3(-0.012, 0.004, 0.02).mul(inv.mul(inv)));
    col.addAssign(vec3(0.03, 0.012, -0.018).mul(l.mul(l)));
    col.assign(mix(col, col.mul(col).mul(float(3).sub(col.mul(2))), 0.22));
    // boy's hash12 on the pixel coordinate, re-seeded every frame by time
    const p = screenCoordinate.xy.add(fract(time.mul(7.13)).mul(431));
    const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
    p3.addAssign(dot(p3, p3.yzx.add(33.33)));
    const g = fract(p3.x.add(p3.y).mul(p3.z)).sub(0.5);
    col.addAssign(g.mul(grain).mul(float(1).sub(l.mul(0.7))));
    return vec4(clamp(col, 0, 1).mul(a), a);
  });
  return grade();
}

/** Map the gfx panel's vignette (offset/darkness floor) onto boy's strength. */
export const vignetteStrength = (darkness: number): number => Math.max(0, Math.min(1, (1 - darkness) * 1.6));
