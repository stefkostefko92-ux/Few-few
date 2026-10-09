// The set the mascot now sits inside of: a lacquered oak desk, a stack of old books, a brass
// desk lamp (the scene's warm practical key) and a night window behind (cool moonlight + a
// handful of far bokeh lights). This is what turns a studio-lit shape into a photographed one —
// see mascot/CLAUDE.md, cinematic/, 2026-09-25: the old scene was the mascot alone in a black
// void, which reads as "rendered" no matter how good the material is.
import * as THREE from 'three';
import { GROUND_Y } from './body.js';

const DESK_TOP_H = 0.14;
const DESK_Y = GROUND_Y - DESK_TOP_H / 2;
export const LAMP_POS = new THREE.Vector3(1.35, GROUND_Y + 1.22, -0.35);

function desktop(materials) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(6.4, DESK_TOP_H, 3.8), materials.wood);
  top.position.y = DESK_Y;
  top.receiveShadow = true;
  top.castShadow = false;
  group.add(top);
  // Legs only need to read at the frame's very edge (the orbit is clamped to +-0.6 rad) — plain
  // boxed posts, not turned geometry.
  const legGeo = new THREE.BoxGeometry(0.16, 1.3, 0.16);
  for (const [x, z] of [[-3.0, 1.7], [3.0, 1.7], [-3.0, -1.7], [3.0, -1.7]]) {
    const leg = new THREE.Mesh(legGeo, materials.wood);
    leg.position.set(x, DESK_Y - DESK_TOP_H / 2 - 0.65, z);
    leg.castShadow = true;
    group.add(leg);
  }
  return group;
}

// A closed book on the desk: leather cover, a thin gold band across the spine (the one flash of
// metal a real bound volume actually has) and pages that peek out along ONE edge only — the edge
// opposite the spine, never all four sides at once, or it reads as a solid tinted block instead of
// bound leaves.
function book(materials, w, h, d, color, x, y, z, ry) {
  const group = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.bookLeather(color));
  cover.castShadow = cover.receiveShadow = true;
  group.add(cover);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.66, d * 0.9), materials.paper);
  pages.position.set(w * 0.05, h * 0.03, 0);
  group.add(pages);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(w * 1.002, h * 0.14, d * 1.002), materials.brass);
  spine.position.y = h * 0.22;
  group.add(spine);
  group.position.set(x, y, z);
  group.rotation.y = ry;
  return group;
}

function bookStack(materials) {
  const group = new THREE.Group();
  const x = -1.4;
  const z = -0.05;
  const top = DESK_Y + DESK_TOP_H / 2;
  // Saturated jewel-tone leather, not near-black boxes — a shelf of old volumes reads by its
  // colour variety (oxblood/forest/chestnut), not by silhouette alone.
  const specs = [
    [0.64, 0.12, 0.48, 0x5c1220, 0.02],
    [0.58, 0.1, 0.44, 0x0f3a24, -0.03],
    [0.5, 0.09, 0.37, 0x5a3417, 0.05],
  ];
  let y = top;
  for (const [w, h, d, color, ry] of specs) {
    y += h / 2;
    group.add(book(materials, w, h, d, color, x, y, z, ry));
    y += h / 2;
  }
  return group;
}

// Brass desk lamp: base, angled arm, conical shade, and the bulb itself. The PointLight lives at
// the bulb — the scene's warm practical key — separate from the directional "key" in scene.js
// (which now only supplies the shadow, aimed to match this fixture) so the socket casts no shadow
// of its own at real-time cost.
function lamp(materials) {
  const group = new THREE.Group();
  const top = DESK_Y + DESK_TOP_H / 2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.06, 24), materials.brass);
  base.position.set(LAMP_POS.x, top + 0.03, LAMP_POS.z);
  base.castShadow = true;
  group.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.1, 12), materials.brass);
  pole.position.set(LAMP_POS.x, top + 0.06 + 0.55, LAMP_POS.z);
  pole.castShadow = true;
  group.add(pole);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.46, 22, 1, true), materials.shade);
  shade.position.copy(LAMP_POS);
  shade.rotation.x = Math.PI;
  group.add(shade);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 8, 20), materials.brass);
  ring.position.set(LAMP_POS.x, LAMP_POS.y - 0.22, LAMP_POS.z);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), materials.bulb);
  bulb.position.copy(LAMP_POS);
  bulb.position.y -= 0.05;
  group.add(bulb);

  const light = new THREE.PointLight(0xff9a44, 3.4, 5, 2); // ~2500 K, по-слаба: иначе лакът под нея прегаря до синкаво-бяло
  light.position.copy(LAMP_POS);
  light.position.y -= 0.05;
  group.add(light);

  // A cheap stand-in for the volumetric light the bulb actually throws down onto the desk: a
  // soft additive cone, no ray-marching — halation itself comes from the post bloom pass already
  // wired to this bulb's brightness.
  const haze = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf9e, transparent: true, opacity: 0.025, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false }),
  );
  haze.position.set(LAMP_POS.x, top + 0.55, LAMP_POS.z);
  group.add(haze);
  return { group, light };
}

// Night window behind the mascot: a flat backlit pane (its own moon-and-bokeh bake, textures.js
// `windowSkyTexture`) rather than lit geometry — the shallow depth of field already throws it out
// of focus, so a photographed sky plane reads exactly like real background bokeh at a fraction of
// the cost of simulating distant point lights.
function window_(materials) {
  const group = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.7), materials.windowGlass);
  pane.position.set(-0.4, 0.75, -2.8);
  group.add(pane);
  const barGeo = new THREE.BoxGeometry(4.6, 0.08, 0.08);
  const bar = new THREE.Mesh(barGeo, materials.windowFrame);
  bar.position.set(-0.4, 0.75, -2.78);
  group.add(bar);
  const postGeo = new THREE.BoxGeometry(0.08, 2.9, 0.08);
  const post = new THREE.Mesh(postGeo, materials.windowFrame);
  post.position.set(-0.4, 0.75, -2.78);
  group.add(post);
  return group;
}

// A dozen dust motes drifting in the lamplight — small additive sprites so they always face the
// camera, never a real particle system. `animateDust` drifts them on the shared clock.
function dustField(materials, count = 14) {
  const group = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(materials.dustSprite.clone());
    const scale = 0.02 + Math.random() * 0.03;
    s.scale.setScalar(scale);
    s.position.set((Math.random() - 0.5) * 2.6, GROUND_Y + Math.random() * 1.8, (Math.random() - 0.5) * 1.6 + 0.3);
    s.userData.speed = 0.05 + Math.random() * 0.08;
    s.userData.phase = Math.random() * Math.PI * 2;
    s.userData.baseX = s.position.x;
    group.add(s);
    sprites.push(s);
  }
  return { group, sprites };
}

export function buildDesk(materials) {
  const group = new THREE.Group();
  const L = lamp(materials);
  group.add(desktop(materials), bookStack(materials), L.group, window_(materials));
  const dust = dustField(materials);
  group.add(dust.group);
  return { group, lampLight: L.light, dust };
}

export function animateDust(dust, t) {
  for (const s of dust.sprites) {
    s.position.y += 0.0025;
    s.position.x = s.userData.baseX + Math.sin(t * s.userData.speed + s.userData.phase) * 0.12;
    if (s.position.y > GROUND_Y + 2.0) s.position.y = GROUND_Y;
  }
}
