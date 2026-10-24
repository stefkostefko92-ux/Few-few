// The parts of the landing scene that the editor's viewer does not have: the machine bed with the sheets the parts land
// on, and the router path of sheet 1 drawn from the engine's own G-code moves (cuts, arcs, drill points). Loaded only
// through story.js, which main.js imports only when prefers-reduced-motion allows motion.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const MDF = 0xb99c74; // spoilboard MDF: lit by the studio it reads as the page's --mdf
const ROUTER = 0xe7ad2c; // the router path: the page's gold, lit
export const SLAB = 0.025; // m, the spoilboard under each sheet: it stands on the floor, the parts lie on it

// One slab of spoilboard per sheet, a hand's width larger than the sheet. The parts land on its top, so the offcuts
// read as bare MDF between them.
export function buildSheets(layout, sheets, place) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: MDF,
    roughness: 0.86,
    metalness: 0,
    transparent: true,
    opacity: 0,
  });
  const margin = 60; // mm
  sheets.forEach((sheet, i) => {
    const o = layout.origins[i];
    const geo = new THREE.BoxGeometry(
      (sheet.w + 2 * margin) * place.S,
      SLAB,
      (sheet.h + 2 * margin) * place.S,
    );
    const slab = new THREE.Mesh(geo, material);
    const [x, , z] = place.point(o.x + sheet.w / 2, o.y + sheet.h / 2);
    slab.position.set(x, SLAB / 2, z); // on the floor, not in it: a shared face would flicker
    slab.receiveShadow = true;
    group.add(slab);
  });
  group.visible = false;
  return {
    group,
    // the bed fades in under the flying parts; fully there, it is drawn as an opaque surface again
    setShown(k) {
      group.visible = k > 0.001;
      material.opacity = k;
      const opaque = k > 0.999;
      if (material.transparent === opaque) {
        material.transparent = !opaque;
        material.needsUpdate = true;
      }
    },
  };
}

// A clockwise arc (G2) from → to around centre, as short chords, in sheet millimetres.
function arcPoints(from, to, centre) {
  const a0 = Math.atan2(from[1] - centre[1], from[0] - centre[0]);
  let a1 = Math.atan2(to[1] - centre[1], to[0] - centre[0]);
  if (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI; // clockwise: the angle falls
  const r = Math.hypot(from[0] - centre[0], from[1] - centre[1]);
  const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 18)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)]);
  }
  return pts;
}

// The cutting order of sheet 1 as drawable pieces: chords of the contours and grooves, and the drill points, each with
// its place in the program so drills and cuts appear in the order the machine does them.
export function routerSteps(moves) {
  const steps = [];
  for (const m of moves) {
    if (m.type === 'drill' && m.at) {
      steps.push({ drill: m.at, tool: m.tool });
      continue;
    }
    if ((m.type !== 'feed' && m.type !== 'arc') || !m.from || !m.to) continue;
    const from = [m.from.X, m.from.Y];
    const to = [m.to.X, m.to.Y];
    if (from[0] === to[0] && from[1] === to[1]) continue; // a plunge or a lift, not a cut
    const pts = m.type === 'arc' && m.center ? arcPoints(from, to, m.center) : [from, to];
    for (let i = 1; i < pts.length; i++) steps.push({ a: pts[i - 1], b: pts[i], tool: m.tool });
  }
  return steps;
}

// The router path of one sheet: gold lines that grow in cutting order, the drill points as small gold discs that
// appear when the program reaches them, and a bright point where the cutter is.
export function buildToolpath(steps, tools, place, top) {
  const group = new THREE.Group();
  const cuts = steps.filter((s) => s.a);
  const drills = steps.filter((s) => s.drill);
  const lift = 0.0025; // m above the part tops: no fighting with their faces
  const positions = new Float32Array(cuts.length * 6);
  cuts.forEach((c, i) => {
    const a = place.point(c.a[0], c.a[1]);
    const b = place.point(c.b[0], c.b[1]);
    positions.set([a[0], top + lift, a[2], b[0], top + lift, b[2]], i * 6);
  });
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  geometry.instanceCount = 0;
  const material = new LineMaterial({ color: ROUTER, linewidth: 2.6, worldUnits: false });
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  group.add(lines);

  const disc = new THREE.CircleGeometry(1, 20);
  disc.rotateX(-Math.PI / 2);
  const dots = new THREE.InstancedMesh(
    disc,
    new THREE.MeshBasicMaterial({ color: ROUTER }),
    Math.max(1, drills.length),
  );
  const m = new THREE.Matrix4();
  drills.forEach((d, i) => {
    const r = ((tools.get(d.tool)?.d ?? 5) / 2) * place.S * 1.35;
    const p = place.point(d.drill[0], d.drill[1]);
    m.compose(
      new THREE.Vector3(p[0], top + lift * 1.4, p[2]),
      new THREE.Quaternion(),
      new THREE.Vector3(r, 1, r),
    );
    dots.setMatrixAt(i, m);
  });
  dots.count = 0;
  dots.frustumCulled = false;
  group.add(dots);

  const spindle = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
  );
  spindle.visible = false;
  group.add(spindle);

  // how many cuts and drills have been made after each step, for a share of the whole program
  const doneCuts = [];
  const doneDrills = [];
  let c = 0;
  let d = 0;
  for (const s of steps) {
    if (s.a) c += 1;
    else d += 1;
    doneCuts.push(c);
    doneDrills.push(d);
  }
  return {
    group,
    count: steps.length,
    holes: drills.length,
    setResolution(w, h) {
      material.resolution.set(w, h);
    },
    // k: share of the program done, 0..1
    setProgress(k) {
      const n = Math.round(Math.min(1, Math.max(0, k)) * steps.length);
      geometry.instanceCount = n ? doneCuts[n - 1] : 0;
      dots.count = n ? doneDrills[n - 1] : 0;
      const last = steps[n - 1];
      spindle.visible = n > 0 && n < steps.length;
      if (spindle.visible) {
        const at = last.drill ?? last.b;
        const p = place.point(at[0], at[1]);
        spindle.position.set(p[0], top + 0.012, p[2]);
      }
      return n;
    },
  };
}
