// Eyelashes: the baked strip along each lid margin (bake/head-lashes.mjs) cut into single lashes
// that taper, lean and cross a little. The strip is part of the head mesh, so the lashes blink and
// squint with the lids. Each lash's coverage is anti-aliased against the pixel's footprint and
// dithered on a fine grid fixed to the strip: TRAA's jitter lands on a new part of that grid every
// frame and averages it, so a lash thinner than a pixel fades into the soft dark line a row of
// lashes draws instead of breaking into flickering dots. (Opaque on purpose: as a transparent
// group of the head mesh, three r186 hit "buffer destroyed" submit errors after a quality switch.)
import * as THREE from 'three/webgpu';
import { Fn, uv, float, vec2, vec3, floor, fract, sin, dot, abs, mix, smoothstep, fwidth, uniform, Discard, If } from 'three/tsl';
import { FaceLitMaterial, inPlace } from './face-light.js';

const hash = (x, k) => fract(sin(x.mul(12.9898).add(k * 78.233)).mul(43758.5453));

// colour: linear RGB of the lashes.
export function lashMaterial(id, colour) {
  const m = new FaceLitMaterial({ name: `lashes${id}`, roughness: 0.45, side: THREE.DoubleSide });
  const live = { wet: uniform(0.55) };
  m.positionNode = inPlace();
  m.colorNode = Fn(() => {
    // u counts lashes along the margin, v runs from the root to the tip.
    const st = uv();
    const k = floor(st.x);
    const v = st.y;
    const reach = mix(float(0.55), float(1), hash(k, 1));
    const centre = hash(k, 2).mul(0.5).add(0.25).add(hash(k, 3).sub(0.5).mul(0.5).mul(v));
    const half = mix(float(0.17), float(0.03), v.div(reach).min(1));
    const aa = fwidth(st.x).mul(0.7).add(0.01);
    const cover = smoothstep(half.sub(aa), half.add(aa), abs(fract(st.x).sub(centre))).oneMinus();
    // Several rows of roots crowd the margin into a dark line.
    const roots = smoothstep(0.04, 0.3, v).oneMinus().mul(0.6);
    const alpha = cover.mul(smoothstep(reach.sub(0.12), reach, v).oneMinus()).max(roots);
    const grain = fract(sin(dot(floor(st.mul(vec2(16, 48))), vec2(12.9898, 78.233))).mul(43758.5453));
    If(alpha.lessThanEqual(grain), () => {
      Discard();
    });
    return vec3(...colour).mul(hash(k, 4).mul(0.4).add(0.8));
  })();
  // Rain clumps them and makes them shine.
  m.roughnessNode = mix(float(0.5), float(0.22), live.wet);
  return { material: m, live };
}
