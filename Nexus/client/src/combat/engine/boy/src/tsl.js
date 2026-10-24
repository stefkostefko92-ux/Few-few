// Shared TSL building blocks: story-time uniforms, the lightning flash, wind, the shared noise
// texture (effects sample it instead of computing fractal noise per pixel) and fire lighting.
import * as THREE from 'three/webgpu';
import { uniform, texture, vec3, dot, sin, Fn, vec4, mrt, output, velocity, normalView, packNormalToRGB, metalness, roughness, diffuseColor } from 'three/tsl';
import { FIRE_GLOWS } from './config.js';

// Story time drives every effect, so the duel's slow motion slows rain, fire and fog with it.
export const U = {
  time: uniform(0),
  flash: uniform(0),
  wind: uniform(new THREE.Vector3(1.2, 0, 0.5)),
};

let noiseTexture = null;
export function setNoise(tex) {
  noiseTexture = tex;
}
// Four independent tileable fBm fields: R 4, G 8, B 16 and A 6 cells per tile.
export const noise = (uvNode) => texture(noiseTexture, uvNode);

// Warm light around every fire at world position p (vertex-rate lighting for particles).
export const fireLight = Fn(([p]) => {
  let light = vec3(0.05, 0.06, 0.08);
  FIRE_GLOWS.forEach((g, i) => {
    const d = vec3(g.pos.x, g.pos.y, g.pos.z).sub(p);
    const k = i === FIRE_GLOWS.length - 1 ? 1.2 : 0.7;
    const flick = sin(U.time.mul(7 + i * 1.3).add(i * 1.7)).mul(0.1).add(0.9);
    light = light.add(vec3(1.0, 0.42, 0.12).mul(k).mul(flick).div(dot(d, d).mul(0.35).add(1)));
  });
  return light;
});

// Only opaque surfaces write the G-buffer. Transparent effects write alpha 0 there, and with
// material blending on those attachments they leave the surface behind them untouched.
const opaqueOnly = (node) => Fn(({ material }) => (material.transparent ? vec4(0) : vec4(node, 1)))();

// Scene MRT for the chosen screen-space effects (at most 4 targets: 32 bytes per sample is the
// portable WebGPU limit). normal: view normal + roughness; material: albedo + metalness.
export function sceneMRT({ normals = false, material = false } = {}) {
  const attachments = { output, velocity: opaqueOnly(vec3(velocity, 0)) };
  if (normals) attachments.normal = Fn(({ material: m }) => (m.transparent ? vec4(0) : vec4(packNormalToRGB(normalView), roughness)))();
  if (material) attachments.material = Fn(({ material: m }) => (m.transparent ? vec4(0) : vec4(diffuseColor.rgb, metalness)))();
  const node = mrt(attachments);
  const blend = new THREE.BlendMode(THREE.MaterialBlending);
  for (const name of Object.keys(attachments)) if (name !== 'output') node.setBlendMode(name, blend);
  return node;
}

