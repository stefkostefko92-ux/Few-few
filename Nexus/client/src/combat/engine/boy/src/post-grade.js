// Display transform and film look: lens chromatic aberration and vignette, bloom and anamorphic
// streaks, ACES (Hill fit) tone mapping, a teal-shadow / warm-highlight grade, grain, letterbox.
// Output is display-referred sRGB; the render pipeline applies no colour transform after it.
import { Fn, vec2, vec3, vec4, float, uv, dot, pow, clamp, max, mix, fract, step, screenCoordinate, luminance } from 'three/tsl';

// ACES RRT + ODT fit by Stephen Hill (input AP1-ish via the matrices below).
const acesIn = (v) => vec3(0.59719, 0.076, 0.0284).mul(v.x).add(vec3(0.35458, 0.90834, 0.13383).mul(v.y)).add(vec3(0.04823, 0.01566, 0.83777).mul(v.z));
const acesOut = (v) => vec3(1.60475, -0.10208, -0.00327).mul(v.x).add(vec3(-0.53108, 1.10813, -0.07276).mul(v.y)).add(vec3(-0.07367, -0.00605, 1.07602).mul(v.z));
const rrtOdt = (v) => v.mul(v.add(0.0245786)).sub(0.000090537).div(v.mul(v.mul(0.983729).add(0.432951)).add(0.238081));

const hash12 = (p) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
};

// image: HDR texture node; glow/streak: bloom nodes (streak may be null); P: frame uniforms.
// primes: producer textures that must update before the image (read once, weighted by zero).
export function grade(image, glow, streak, P, primes = []) {
  return Fn(() => {
    const st = uv();
    const primed = primes.reduce((acc, t) => acc.add(t.sample(st).r.mul(0)), float(0));
    const d = st.sub(0.5);
    const dd = d.mul(vec2(P.aspect, 1));
    const r2 = dot(dd, dd);
    const off = d.mul(r2).mul(P.ca).mul(4);
    const c = image.sample(st);
    // primed comes first so its producers are registered (and updated) before the image's.
    const col = primed.add(vec3(image.sample(st.sub(off)).r, c.g, image.sample(st.add(off)).b)).toVar();
    col.addAssign(glow.rgb);
    if (streak) col.addAssign(streak.rgb.mul(vec3(0.35, 0.55, 1.0)).mul(P.streak));
    col.assign(max(col, 0).mul(P.exposure));
    col.mulAssign(clamp(pow(r2.mul(1.6), 1.3).mul(P.vignette).oneMinus(), 0, 1));
    col.assign(clamp(acesOut(rrtOdt(acesIn(col))), 0, 1));
    col.assign(pow(col, vec3(1 / 2.2)));
    const l = luminance(col).toVar();
    col.assign(mix(vec3(l), col, 0.92));
    col.addAssign(vec3(-0.012, 0.004, 0.02).mul(l.oneMinus().mul(l.oneMinus())));
    col.addAssign(vec3(0.03, 0.012, -0.018).mul(l.mul(l)));
    col.assign(mix(col, col.mul(col).mul(col.mul(-2).add(3)), 0.22));
    const g = hash12(screenCoordinate.xy.add(fract(P.time.mul(7.13)).mul(431))).sub(0.5);
    col.addAssign(g.mul(P.grain).mul(l.mul(-0.7).add(1)));
    col.addAssign(hash12(screenCoordinate.xy.mul(1.37).add(17)).sub(0.5).div(255));
    const bar = step(st.y, P.bars).add(step(float(1).sub(P.bars), st.y));
    col.assign(mix(col, vec3(0), max(bar, P.fade)));
    return vec4(clamp(col, 0, 1), 1);
  })();
}
