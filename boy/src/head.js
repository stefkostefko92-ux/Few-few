// The knights' bare heads: the processed scan (tex/head.bin from bake/head.mjs) with its
// expression targets, eyeballs, teeth, cropped hair and the Warden's beard, following the rig's
// head joint. Without the files (a page opened from disk) the knights keep their helmets.
import * as THREE from 'three/webgpu';
import { decode, configure } from './baked.js';
import { createSkin, skinLUT } from './skin.js';
import { eyeGeometry, eyeMaterial, aimEye } from './eyes.js';
import { shellGeometry, hairMaterial } from './hair.js';
import { createTeeth } from './teeth.js';
import { FaceDriver, EXPRESSIONS } from './face.js';
import { EYES_LOCAL } from './config.js';

// Ser Aldric: fair, grey-blue eyes, light-brown hair in the knights' bowl cut of the 1410s
// (cropped on the crown, shaved below). The Warden: weathered, brown eyes, a shaved head and a
// dark beard shot with grey, a scar through the left brow.
const LOOK = {
  A: { tint: [1.0, 0.97, 0.95], root: [0.075, 0.048, 0.026], beard: 0, scar: 0, iris: [0.2, 0.3, 0.38], hair: { crown: 0.017, sides: 0.0022, line: 0.166, beard: 0, brow: 0.005, colour: [0.2, 0.125, 0.065], grey: 0 } },
  B: { tint: [0.9, 0.8, 0.72], root: [0.03, 0.022, 0.018], beard: 1, scar: 1, iris: [0.16, 0.09, 0.045], hair: { crown: 0.004, sides: 0.004, line: 0, beard: 0.017, brow: 0.0065, colour: [0.045, 0.032, 0.025], grey: 0.32 } },
};

export async function loadHeadAsset(base, anisotropy) {
  try {
    const res = await fetch(`${base}manifest.json`);
    const meta = res.ok ? (await res.json()).head : null;
    if (!meta || meta.morphs.join() !== EXPRESSIONS.join()) return null;
    const binary = await fetch(`${base}${meta.files.bin}`).then((r) => {
      if (!r.ok) throw new Error(`head: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    const [albedo, normal, spec] = await Promise.all(['albedo', 'normal', 'spec'].map((k) => decode(`${base}${meta.files[k]}`, 2048)));
    const maps = { albedo: configure(new THREE.Texture(albedo), true, anisotropy), normal: configure(new THREE.Texture(normal), false, anisotropy), spec: configure(new THREE.Texture(spec), false, anisotropy) };
    return { meta, binary, maps, lut: skinLUT() };
  } catch {
    return null;
  }
}

function section(meta, binary, name) {
  const s = meta.sections.find((x) => x.name === name);
  const Ctor = { Uint16Array, Uint8Array, Int16Array, Float32Array }[s.type];
  const raw = new Ctor(binary, s.offset, s.length);
  return s.scale ? Float32Array.from(raw, (v) => (v / 32767) * s.scale) : raw;
}

function headGeometry({ meta, binary }, id) {
  const get = (name) => section(meta, binary, name);
  const g = new THREE.BufferGeometry();
  g.setIndex(new THREE.BufferAttribute(get('index'), 1));
  g.setAttribute('position', new THREE.BufferAttribute(get(`position${id}`), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(get(`normal${id}`), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(get('uv'), 2));
  const regions = get('regions');
  ['regionA', 'regionB', 'skinData'].forEach((name, k) => {
    const a = new Uint8Array(meta.count * 4);
    for (let i = 0; i < meta.count; i++) a.set(regions.subarray(i * 12 + k * 4, i * 12 + k * 4 + 4), i * 4);
    g.setAttribute(name, new THREE.BufferAttribute(a, 4, true));
  });
  g.morphAttributes.position = meta.morphs.map((m) => new THREE.BufferAttribute(get(`morph:${m}:position`), 3));
  g.morphAttributes.normal = meta.morphs.map((m) => new THREE.BufferAttribute(get(`morph:${m}:normal`), 3));
  g.morphTargetsRelative = true;
  g.computeBoundingSphere();
  return g;
}

const inv = new THREE.Matrix4();
const target = new THREE.Vector3();
const down = new THREE.Vector3(0, -0.35, 0.6);

// drops: the baked droplet set. Returns the head's scene group and its per-frame update.
export function createHead(asset, id, drops) {
  const look = LOOK[id];
  const { meta } = asset;
  const geometry = headGeometry(asset, id);
  const skin = createSkin(asset.maps, { id, ...look }, drops, asset.lut);
  const mesh = new THREE.Mesh(geometry, skin.material);
  mesh.name = `head${id}`;
  mesh.morphTargetInfluences = new Array(EXPRESSIONS.length).fill(0);
  mesh.castShadow = mesh.receiveShadow = true;
  const hair = hairMaterial(id, look.hair);
  const shells = new THREE.Mesh(shellGeometry(geometry, { beard: look.beard > 0 }), hair.material);
  shells.morphTargetInfluences = mesh.morphTargetInfluences;
  shells.receiveShadow = true;
  const eye = eyeMaterial(id, look.iris);
  const eyeGeo = eyeGeometry();
  const eyes = meta.eyes.map(({ centre }) => {
    const e = new THREE.Mesh(eyeGeo, eye.material);
    e.matrixAutoUpdate = false;
    e.userData.centre = new THREE.Vector3(...centre);
    e.receiveShadow = true;
    return e;
  });
  const teeth = createTeeth(meta.mouth, id);
  const group = new THREE.Group();
  group.name = `knight${id}:head`;
  group.matrixAutoUpdate = false;
  group.add(mesh, shells, ...eyes, teeth.upper, teeth.jaw);
  const face = new FaceDriver(id);

  return {
    group,
    face,
    materials: [skin.material, hair.material, eye.material, teeth.material],
    // head: the rig's head matrix; other: the opponent's; wet: rain on the skin (0..1).
    update(head, T, breath, other, wet) {
      group.matrix.copy(head);
      group.matrixWorldNeedsUpdate = true;
      const o = face.sample(T, breath);
      EXPRESSIONS.forEach((k, i) => (mesh.morphTargetInfluences[i] = o[k]));
      teeth.jaw.rotation.x = meta.mouth.rest + o.jawOpen * meta.mouth.angle;
      teeth.open.value = o.jawOpen;
      // Eyes on the other knight's eyes, or on the stones for the beaten Warden.
      target.fromArray(EYES_LOCAL).applyMatrix4(other).applyMatrix4(inv.copy(head).invert());
      target.lerp(down, face.look.down);
      const dist = target.length();
      target.x += face.look.dx * dist;
      target.y += face.look.dy * dist;
      let pitch = 0;
      for (const e of eyes) pitch += aimEye(e, e.userData.centre, target) / eyes.length;
      // Upper lids follow the eyes down.
      const lid = THREE.MathUtils.clamp(pitch * 0.9, 0, 0.35);
      mesh.morphTargetInfluences[0] = Math.max(mesh.morphTargetInfluences[0], lid);
      mesh.morphTargetInfluences[1] = Math.max(mesh.morphTargetInfluences[1], lid);
      skin.live.effort.value = Math.min(1, 0.6 * o.snarl + 0.4 * o.jawOpen);
      skin.live.wet.value = wet;
      hair.live.wet.value = wet;
      eye.live.pupil.value = face.pupil;
    },
  };
}
