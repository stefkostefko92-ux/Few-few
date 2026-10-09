// Wet cobblestones: water fills the joints first and drowns whole stones in the puddles (the
// baked height decides where), rain rings on standing water, and a planar mirror reflection that
// replaces the specular of the water surface. Puddle layout and ripple impacts are textures.
import * as THREE from 'three/webgpu';
import { Fn, reflector, texture, textureBicubic, uv, vec2, vec3, vec4, float, mix, smoothstep, normalize, length, max, abs, fract, sin, pow, dot, clamp, normalMap, positionWorld, positionView, cameraViewMatrix, positionViewDirection } from 'three/tsl';
import { sampleSet } from './surface.js';
import { noise, U } from './tsl.js';

const SIZE = 44;

const rippleLayer = Fn(([tex, p, t]) => {
  const r = texture(tex, p);
  const d = r.xy.mul(2).sub(1);
  const dist = length(d);
  const life = fract(t.add(r.z));
  const ring = dist.sub(life);
  const amp = r.w.mul(pow(life.oneMinus(), 2)).mul(smoothstep(0, 0.3, abs(ring)).oneMinus());
  return d.div(max(dist, 1e-3)).mul(sin(ring.mul(15.7))).mul(amp);
});

// One material per mode: with the mirror (the reflector renders the scene each frame) or without.
function groundMaterial(S, ripple, puddle, reflection) {
  const mat = new THREE.MeshPhysicalNodeMaterial({ name: reflection ? 'cobbles+mirror' : 'cobbles', roughness: 1, metalness: 0 });
  const w = positionWorld;
  const s = sampleSet(S.cobble, uv().mul(SIZE / S.cobble.tile));
  // Standing water: a level rising with the puddle map, compared with the baked stone height.
  const pud = smoothstep(0.12, 0.8, texture(puddle, w.xz.div(SIZE).add(0.5)).r.add(noise(w.xz.mul(0.45)).b.sub(0.5).mul(0.35)));
  const water = smoothstep(0, 0.07, mix(float(0.22), float(1.06), pud).sub(s.normal.a)).toVar();

  mat.colorNode = s.albedo.rgb.mul(mix(float(0.7), float(0.34), water));
  mat.aoNode = s.orm.r;
  mat.roughnessNode = mix(s.orm.g.mul(0.72), float(0.03), water);

  // Rain rings on water; flattened normals under standing water.
  const fade = smoothstep(7, 26, length(positionView)).oneMinus();
  const rip = rippleLayer(ripple, w.xz, U.time.mul(1.1)).add(rippleLayer(ripple, w.xz.mul(1.37).add(0.5), U.time.mul(0.93).add(0.37))).mul(water.mul(0.8).add(0.2)).mul(fade).toVar();
  const flatN = normalize(cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz);
  const ripV = normalize(cameraViewMatrix.mul(vec4(normalize(vec3(rip.x.mul(-0.6), 1, rip.y.mul(-0.6))), 0)).xyz);
  const n = normalize(mix(normalMap(s.normal, vec2(1.1)), flatN, water.mul(0.9)).add(ripV.sub(flatN).mul(water.mul(0.65).add(0.35)))).toVar();
  mat.normalNode = n;
  if (!reflection) return mat;

  // The mirror, shifted by the ripples and blurred with the surface roughness, stands in for
  // the specular of the water it covers (no double reflection from the environment map).
  reflection.uvNode = reflection.uvNode.add(rip.mul(0.012)).add(n.xy.sub(flatN.xy).mul(0.03));
  const refl = textureBicubic(reflection, clamp(mat.roughnessNode.mul(1.6), 0, 1));
  const F = pow(clamp(dot(n, positionViewDirection), 0, 1).oneMinus(), 5).mul(0.98).add(0.02);
  mat.specularIntensityNode = water.oneMinus();
  mat.emissiveNode = refl.rgb.mul(F).mul(mix(float(0.35), float(1), water));
  return mat;
}

export function createGround(S, { ripple, puddle, camera, reflections }) {
  const reflection = reflector({ resolutionScale: 0.4, generateMipmaps: true, bounces: false });
  // The mirrored camera sees only layer 0: rain, embers and smoke are skipped in the reflection.
  reflection.reflector.getVirtualCamera(camera).layers.set(0);
  const plain = groundMaterial(S, ripple, puddle, null);
  const mirror = groundMaterial(S, ripple, puddle, reflection);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), reflections ? mirror : plain);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  mesh.add(reflection.target);
  return {
    mesh,
    materials: [plain, mirror],
    setReflections(on) {
      mesh.material = on ? mirror : plain;
    },
  };
}
