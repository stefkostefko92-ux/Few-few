// Display transform and film look, after boy's post-grade.js and post-lens.js (Nexus combat engine): lens
// chromatic aberration and vignette, a warm halation bloom, ACES (Stephen Hill fit) tone mapping, a gentle
// cool-shadow / warm-highlight grade, film grain and dithering. The output is display-referred sRGB: the render
// pipeline applies no colour transform after it. Toned down from the night duel: this is a product shot.
// Loaded only through the installation's 3D stage (src/components/lift3d/boot.ts), lazily.
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, vec4, float, uv, dot, pow, clamp, max, mix, fract, screenCoordinate, luminance, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

type Vec3Node = THREE.Node<'vec3'>;
type Vec2Node = THREE.Node<'vec2'>;
type TextureNode = THREE.TextureNode;

export function gradeUniforms() {
  return { exposure: uniform(1.15), vignette: uniform(0.34), grain: uniform(0.022), ca: uniform(0.0014), time: uniform(0), aspect: uniform(4 / 3) };
}
export type GradeUniforms = ReturnType<typeof gradeUniforms>;

// ACES RRT + ODT fit by Stephen Hill (input AP1-ish via the matrices below).
const acesIn = (v: Vec3Node): Vec3Node => vec3(0.59719, 0.076, 0.0284).mul(v.x).add(vec3(0.35458, 0.90834, 0.13383).mul(v.y)).add(vec3(0.04823, 0.01566, 0.83777).mul(v.z));
const acesOut = (v: Vec3Node): Vec3Node => vec3(1.60475, -0.10208, -0.00327).mul(v.x).add(vec3(-0.53108, 1.10813, -0.07276).mul(v.y)).add(vec3(-0.07367, -0.00605, 1.07602).mul(v.z));
const rrtOdt = (v: Vec3Node): Vec3Node => v.mul(v.add(0.0245786)).sub(0.000090537).div(v.mul(v.mul(0.983729).add(0.432951)).add(0.238081));

const hash12 = (p: Vec2Node) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
};

/** Warm film halation around the brightest highlights (clear-coat and machined steel). */
export function lensGlow(image: TextureNode) {
  const glow = bloom(image, 0.24, 0.35, 1.1);
  glow.bloomTintColors = [
    new THREE.Vector3(1.0, 0.78, 0.62),
    new THREE.Vector3(1.0, 0.86, 0.76),
    new THREE.Vector3(1.0, 0.95, 0.9),
    new THREE.Vector3(1.0, 1.0, 1.0),
    new THREE.Vector3(0.92, 0.96, 1.0),
  ];
  return glow;
}

/** image: HDR texture node; glow: bloom node or null. */
export function grade(image: TextureNode, glow: ReturnType<typeof lensGlow> | null, P: GradeUniforms) {
  return Fn(() => {
    const st = uv();
    const d = st.sub(0.5);
    const dd = d.mul(vec2(P.aspect, 1));
    const r2 = dot(dd, dd);
    const off = d.mul(r2).mul(P.ca).mul(4);
    const c = image.sample(st);
    const col = vec3(image.sample(st.sub(off)).r, c.g, image.sample(st.add(off)).b).toVar();
    if (glow) col.addAssign(glow.rgb);
    col.assign(max(col, 0).mul(P.exposure));
    col.mulAssign(clamp(pow(r2.mul(1.6), 1.3).mul(P.vignette).oneMinus(), 0, 1));
    col.assign(clamp(acesOut(rrtOdt(acesIn(col))), 0, 1));
    col.assign(pow(col, vec3(1 / 2.2)));
    const l = luminance(col).toVar();
    col.assign(mix(vec3(l), col, 0.95));
    col.addAssign(vec3(-0.008, 0.002, 0.014).mul(l.oneMinus().mul(l.oneMinus())));
    col.addAssign(vec3(0.02, 0.01, -0.012).mul(l.mul(l)));
    col.assign(mix(col, col.mul(col).mul(col.mul(-2).add(3)), 0.16));
    const g = hash12(screenCoordinate.xy.add(fract(P.time.mul(7.13)).mul(431))).sub(0.5);
    col.addAssign(g.mul(P.grain).mul(l.mul(-0.7).add(1)));
    col.addAssign(hash12(screenCoordinate.xy.mul(1.37).add(17)).sub(0.5).div(255));
    return vec4(clamp(col, 0, 1), float(1));
  })();
}
