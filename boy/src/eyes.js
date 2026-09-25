// Eyeballs: a sclera sphere with a cornea cap. The iris is seen through the cornea, refracted onto
// its own plane (it shifts with the viewing angle like a real one), with a night-dilated pupil,
// fibres, a collarette and a dark limbal ring; a wet clear coat gives the catchlights.
import * as THREE from 'three/webgpu';
import { Fn, positionLocal, normalWorld, modelWorldMatrixInverse, cameraPosition, vec2, vec3, vec4, float, normalize, refract, length, atan, smoothstep, mix, min, max, uniform, PI } from 'three/tsl';
import { EYE, eyeFront, CORNEA_Z, LIMBUS_Z, LIMBUS_ANGLE } from './eye-shape.js';
import { noise } from './tsl.js';

// Iris plane just behind the limbus; the anterior chamber in front of it is ~3 mm deep.
const IRIS_Z = LIMBUS_Z - 0.0004;

export function eyeGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 28);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  const nrm = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const a = Math.acos(Math.min(1, Math.max(-1, v.z)));
    v.multiplyScalar(eyeFront(a));
    p.setXYZ(i, v.x, v.y, v.z);
    // Analytic normals: the sphere's, or the cornea's in front of the limbus.
    const n = a < LIMBUS_ANGLE ? v.clone().setZ(v.z - CORNEA_Z).normalize() : v.clone().normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// iris: linear RGB of the iris; pupil: pupil radius as a share of the iris radius.
export function eyeMaterial(id, iris) {
  const m = new THREE.MeshPhysicalNodeMaterial({ name: `eye${id}`, roughness: 0.22, ior: 1.376, clearcoat: 1, clearcoatRoughness: 0.03 });
  const live = { pupil: uniform(0.5) };
  const shade = Fn(() => {
    const p = positionLocal;
    const toEye = normalize(modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz.sub(p));
    const ray = refract(toEye.negate(), normalize(p.sub(vec3(0, 0, CORNEA_Z))), 1 / 1.376);
    const hit = p.add(ray.mul(float(IRIS_Z).sub(p.z).div(min(ray.z, -0.05))));
    const rho = length(hit.xy).div(EYE.limbus);
    const ang = atan(hit.y, hit.x).div(PI.mul(2)).add(0.5);
    const inCornea = smoothstep(Math.cos(LIMBUS_ANGLE) - 0.012, Math.cos(LIMBUS_ANGLE) + 0.004, normalize(p).z);
    // Iris: radial fibres (the noise texture wraps, so the angle is seamless), a lighter
    // collarette around the pupil and a dark limbal ring.
    const fibres = noise(vec2(ang.mul(4), rho.mul(0.35))).g.mul(noise(vec2(ang.mul(9), rho.mul(0.6))).b).mul(1.8);
    const collar = smoothstep(0.08, 0, rho.sub(live.pupil.add(0.14)).abs()).mul(0.35);
    let irisCol = vec3(...iris).mul(fibres.add(0.45).add(collar));
    irisCol = irisCol.mul(smoothstep(1.02, 0.78, rho).mul(0.75).add(0.25));
    irisCol = irisCol.mul(smoothstep(live.pupil, live.pupil.add(0.05), rho));
    // Sclera: off-white, veined towards the corners, darker where the lids overhang.
    const side = smoothstep(0.55, 1.2, normalize(p).xy.length());
    const veins = smoothstep(0.62, 0.8, noise(vec2(ang.mul(3), p.z.mul(40))).a).mul(side);
    const sclera = mix(vec3(0.62, 0.58, 0.54), vec3(0.55, 0.2, 0.17), veins.mul(0.5)).mul(side.mul(0.35).oneMinus());
    const iris2 = mix(sclera, irisCol, inCornea.mul(smoothstep(1.06, 0.98, rho)));
    return iris2.mul(smoothstep(0.15, 0.75, normalWorld.y).mul(0.55).oneMinus());
  });
  m.colorNode = shade();
  m.roughnessNode = mix(float(0.24), float(0.05), smoothstep(Math.cos(LIMBUS_ANGLE) - 0.01, Math.cos(LIMBUS_ANGLE) + 0.01, normalize(positionLocal).z));
  return { material: m, live };
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);

// Points an eye (a mesh in the head frame at `centre`) at `target` (head frame), within the
// range of real eye movement; returns the pitch for the lids to follow.
export function aimEye(mesh, centre, target) {
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const dz = Math.max(0.05, target.z - centre.z);
  const yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.5, 0.5);
  const pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.35, 0.4);
  _e.set(pitch, yaw, 0);
  _q.setFromEuler(_e);
  mesh.matrix.compose(centre, _q, _s);
  mesh.matrixWorldNeedsUpdate = true;
  return pitch;
}
