// Surface layers shared by the material library: baked PBR sets, mud grime, beaded rain droplets
// and water running down steel and stone under gravity (world-space, animated in story time).
import { texture, uv, vec2, vec3, float, mix, smoothstep, normalMap, normalize, cross, dot, abs, max, materialColor, materialRoughness, materialMetalness, positionWorld, normalWorldGeometry, cameraViewMatrix, vec4, Fn } from 'three/tsl';
import { noise, U } from './tsl.js';

// Albedo, tangent-space normal (+height in A) and ORM (AO, roughness, metalness, mask) of a set.
export function sampleSet(set, uvNode = uv()) {
  return { albedo: texture(set.albedo, uvNode), normal: texture(set.normal, uvNode), orm: texture(set.orm, uvNode) };
}

// Wires a set into a node material. `tint`: the set's albedo multiplies the material colour
// (steel, mail, fabric); otherwise it is the colour. `wear` fades the set's rust and stains.
export function applySet(mat, set, { uvNode = uv(), normalScale = 1, tint = true, wear = 1, ao = 1 } = {}) {
  const s = sampleSet(set, uvNode);
  const albedo = mix(vec3(1), s.albedo.rgb, wear);
  mat.colorNode = tint ? materialColor.mul(albedo) : albedo;
  mat.normalNode = normalMap(s.normal, vec2(normalScale));
  mat.aoNode = mix(float(1), s.orm.r, ao);
  mat.roughnessNode = materialRoughness.mul(mix(float(1), s.orm.g, wear));
  mat.metalnessNode = materialMetalness.mul(s.orm.b);
  return s;
}

// Wet mud splashed up the greaves and sabatons: darker, rougher, no longer bare metal.
export function applyGrime(mat) {
  const w = positionWorld;
  const grime = smoothstep(0.03, 0.55, w.y).oneMinus().mul(smoothstep(0.35, 0.75, noise(w.xz.mul(1.7).add(w.y.mul(2.3))).a.add(0.25))).toVar();
  mat.colorNode = mix(mat.colorNode, vec3(0.045, 0.034, 0.024), grime.mul(0.85));
  mat.roughnessNode = mix(mat.roughnessNode, float(0.8), grime.mul(0.7));
  mat.metalnessNode = mat.metalnessNode.mul(grime.mul(0.85).oneMinus());
}

// Gravity frame at the shaded point: `across` is horizontal in the surface, `down` runs downhill.
function gravityFrame() {
  const n = normalWorldGeometry;
  const across = normalize(cross(vec3(0, 1, 0), n).add(vec3(1e-4, 0, 0)));
  const down = cross(n, across);
  return { n, across, down, steep: abs(n.y).oneMinus() };
}

// View-space normal perturbed by a tangent-space sample expressed in a world frame.
const perturb = (sampleNode, t, b, n, scale) => {
  const m = sampleNode.xy.mul(2).sub(1).mul(scale);
  const w = normalize(t.mul(m.x).add(b.mul(m.y)).add(n));
  return normalize(cameraViewMatrix.mul(vec4(w, 0)).xyz);
};

// Water on steel: beaded droplets that stay put, plus thin rivulets sliding down steep plates.
// Returns a view-space clearcoat normal. `drops` is the baked droplet set (tile 0.2 m).
export function rainOnSteel(drops, { scale = 0.55, flow = 1 } = {}) {
  return Fn(() => {
    const f = gravityFrame();
    const p = positionWorld;
    const s = float(1 / drops.tile);
    const beadUV = vec2(dot(p, f.across), dot(p, f.down).add(p.y.mul(0.37))).mul(s);
    const beads = perturb(texture(drops.normal, beadUV), f.across, f.down, f.n, scale);
    const slideUV = vec2(dot(p, f.across).mul(s).add(0.5), p.y.mul(s).mul(0.7).add(U.time.mul(0.9)));
    const slide = perturb(texture(drops.normal, slideUV), f.across, f.down.negate(), f.n, scale * 1.3);
    const lane = smoothstep(0.45, 0.8, noise(vec2(dot(p, f.across).mul(3.1), p.y.mul(0.8).add(U.time.mul(0.25)))).g).mul(f.steep).mul(flow);
    const nv = normalize(cameraViewMatrix.mul(vec4(f.n, 0)).xyz);
    return normalize(beads.add(slide.sub(nv).mul(lane)));
  })();
}

// Stone in the rain: darker and glossier near the wet ground, water sheets sliding down the
// walls along the stains, and a trickle normal on top. Mutates colour, roughness and normal.
export function wetStone(mat, drops, { base = 1.4 } = {}) {
  const f = gravityFrame();
  const p = positionWorld;
  const wetFoot = smoothstep(0, base, p.y).oneMinus();
  const sheetUV = vec2(dot(p, f.across).mul(0.9), p.y.mul(0.35).add(U.time.mul(0.35)));
  const sheet = smoothstep(0.52, 0.78, noise(sheetUV).b.add(noise(vec2(dot(p, f.across).mul(0.23), 0.5)).r.mul(0.35))).mul(f.steep);
  const wet = max(wetFoot, sheet.mul(0.85)).toVar();
  mat.colorNode = mat.colorNode.mul(wet.mul(0.5).oneMinus());
  mat.roughnessNode = mat.roughnessNode.mul(wet.mul(0.6).oneMinus());
  const trickleUV = vec2(dot(p, f.across), p.y.mul(0.6).add(U.time.mul(1.4))).mul(1 / (drops.tile * 4));
  const trickle = perturb(texture(drops.normal, trickleUV), f.across, f.down.negate(), f.n, 0.8);
  mat.normalNode = normalize(mix(mat.normalNode, trickle, sheet.mul(0.6)));
}
