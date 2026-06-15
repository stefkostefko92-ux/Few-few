/**
 * 3D prop geometry builders for `CombatEnvironment.ts`.
 *
 * Each `buildPropMesh(kind, color, emissive)` returns a toon-shaded
 * `THREE.Object3D` roughly 1u tall whose look matches the named prop.
 * The environment builder scales these per-instance for variation.
 *
 * All materials are `MeshToonMaterial` sharing the cel ramp from
 * `CombatToon.ts`, so the props match the Zelda-BotW look of the
 * fighter rigs without needing an extra outline pass on every prop.
 *
 * No external assets — every shape is built from primitive geometry
 * (Cone, Cylinder, Sphere, Box, Octahedron, Torus, Plane). The
 * geometry/material count per region tops out around 30 draw calls,
 * which is well under the budget even for the lite path.
 */

import * as THREE from 'three';

export type PropKind =
  | 'tree-fir' | 'tree-oak' | 'tree-dead' | 'mushroom-bell'
  | 'rock-jagged' | 'rock-round' | 'pillar-stone' | 'pillar-obsidian'
  | 'crystal-shard' | 'icicle' | 'cattail'
  | 'ash-plume' | 'lava-vent' | 'pickaxe' | 'cart' | 'tome'
  | 'rune-floating' | 'sigil-cursed' | 'bone-rib' | 'bone-skull'
  | 'pillar-divine' | 'moon-orb' | 'lightning-strike' | 'void-fissure'
  | 'spire-jagged' | 'cliff-mist';

/** PBR material factory for procedural props — picks roughness from
 *  the prop's intended surface (rocks rough, crystals smooth) so the
 *  HD pipeline's IBL + GTAO + bloom can grade them properly. */
function toonMat(color: string, opts: { emissive?: string; transparent?: boolean; opacity?: number; roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.transparent ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = 0.6;
  }
  return m;
}

/** Glow disk for embers / lava / sigil halos (additive). */
function glowDisk(color: string, radius: number, opacity = 0.7): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function buildPropMesh(kind: PropKind, color: string, emissive?: string): THREE.Object3D {
  const g = new THREE.Group();
  g.name = kind;

  switch (kind) {
    case 'tree-fir': {
      // Conifer: cylindrical trunk + 3 stacked cone tiers (decreasing).
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.35, 8), toonMat('#3a2412'));
      trunk.position.y = 0.175; g.add(trunk);
      const tiers: Array<[number, number, number]> = [[0.45, 0.55, 0.45], [0.36, 0.45, 0.78], [0.26, 0.35, 1.05]];
      for (const [r, h, y] of tiers) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), toonMat(color));
        cone.position.y = y; g.add(cone);
      }
      break;
    }
    case 'tree-oak': {
      // Round broadleaf — chubby sphere of foliage on a short trunk.
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.45, 8), toonMat('#3a2412'));
      trunk.position.y = 0.225; g.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), toonMat(color));
      crown.position.y = 0.85; crown.scale.set(1.1, 0.95, 1.1); g.add(crown);
      const crown2 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toonMat(color));
      crown2.position.set(0.35, 0.7, -0.1); g.add(crown2);
      break;
    }
    case 'tree-dead': {
      // Bare trunk with two crooked branch boxes.
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.0, 8), toonMat(color));
      trunk.position.y = 0.5; g.add(trunk);
      for (const [x, ry, rz] of [[0.18, 0.6, Math.PI * 0.18], [-0.22, 0.78, -Math.PI * 0.22]] as Array<[number, number, number]>) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.45, 6), toonMat(color));
        branch.position.set(x, ry, 0); branch.rotation.z = rz; g.add(branch);
      }
      break;
    }
    case 'mushroom-bell': {
      // Bell cap + thick cylindrical stem; emissive gills under the cap.
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.35, 10), toonMat('#e8dcc0'));
      stem.position.y = 0.175; g.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(color, { emissive }));
      cap.position.y = 0.35; cap.scale.y = 0.7; g.add(cap);
      break;
    }
    case 'rock-jagged': {
      // Sharp dodecahedron — single mesh, no normal smoothing for a faceted look.
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), toonMat(color));
      m.position.y = 0.45; m.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
      g.add(m); break;
    }
    case 'rock-round': {
      // Smooth boulder — squashed sphere with a slight tilt.
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), toonMat(color));
      m.position.y = 0.35; m.scale.set(1.15, 0.78, 1.05);
      m.rotation.y = Math.random() * Math.PI; g.add(m); break;
    }
    case 'pillar-stone': {
      // Column with a capital and a base ring.
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.12, 16), toonMat(color));
      base.position.y = 0.06; g.add(base);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 1.5, 16), toonMat(color));
      shaft.position.y = 0.85; g.add(shaft);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.18, 16), toonMat(color));
      cap.position.y = 1.7; g.add(cap);
      break;
    }
    case 'pillar-obsidian': {
      // Tapered black column with a sharp peak and an emissive seam.
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.40, 1.6, 8), toonMat(color, { emissive }));
      shaft.position.y = 0.8; g.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 8), toonMat(color, { emissive }));
      tip.position.y = 1.8; g.add(tip);
      break;
    }
    case 'crystal-shard': {
      // Elongated octahedron — classic crystal silhouette + emissive glow.
      const main = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), toonMat(color, { emissive }));
      main.position.y = 0.5; main.scale.set(0.6, 1.4, 0.6); g.add(main);
      const small = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), toonMat(color, { emissive }));
      small.position.set(0.32, 0.25, -0.08); small.scale.set(0.5, 1.1, 0.5); small.rotation.z = 0.3; g.add(small);
      if (emissive) g.add(glowDisk(emissive, 0.6, 0.35));
      break;
    }
    case 'icicle': {
      // Inverted cone hanging from the top of the prop bbox.
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.0, 8), toonMat(color));
      m.position.y = 0.5; m.rotation.x = Math.PI; m.rotation.y = Math.random() * Math.PI;
      // Re-raise after flipping — apex pointing down, base at the top.
      m.position.y = 0.5; g.add(m); break;
    }
    case 'cattail': {
      // Reed stem + a dark sausage head; classic marsh flora.
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), toonMat('#a48838'));
      stem.position.y = 0.45; g.add(stem);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), toonMat(color));
      head.position.y = 0.95; g.add(head);
      break;
    }
    case 'ash-plume': {
      // Soft volumetric pile — sphere flattened to a mound + faint glow.
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), toonMat(color, { transparent: true, opacity: 0.75 }));
      mound.position.y = 0.18; mound.scale.set(1.5, 0.5, 1.5); g.add(mound);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), toonMat(color, { transparent: true, opacity: 0.55 }));
      cap.position.y = 0.45; cap.scale.set(0.9, 0.7, 0.9); g.add(cap);
      break;
    }
    case 'lava-vent': {
      // Rock ring + glowing molten core (additive disk on top).
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.10, 8, 18), toonMat('#1a0a05'));
      ring.position.y = 0.05; ring.rotation.x = -Math.PI / 2; g.add(ring);
      g.add(glowDisk(emissive || color, 0.28, 0.95));
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(emissive || color), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.position.y = 0.07; core.rotation.x = -Math.PI / 2; g.add(core);
      break;
    }
    case 'pickaxe': {
      // Wooden handle + iron head — a propped tool.
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6), toonMat('#7a4a20'));
      handle.position.y = 0.42; handle.rotation.z = Math.PI / 3.5; g.add(handle);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.10, 0.10), toonMat(color));
      head.position.set(0.18, 0.78, 0); head.rotation.z = -Math.PI / 6; g.add(head);
      break;
    }
    case 'cart': {
      // Mine cart — box body + two wheels.
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.55), toonMat(color));
      body.position.y = 0.32; g.add(body);
      for (const x of [-0.3, 0.3]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), toonMat('#3a2410'));
        wheel.position.set(x, 0.15, 0.30); wheel.rotation.z = Math.PI / 2; g.add(wheel);
        const w2 = wheel.clone(); w2.position.z = -0.30; g.add(w2);
      }
      break;
    }
    case 'tome': {
      // Floating book — emissive spine glow.
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.10, 0.42), toonMat(color, { emissive }));
      cover.position.y = 0.5; g.add(cover);
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.36), toonMat('#fff5d6'));
      pages.position.y = 0.5; g.add(pages);
      break;
    }
    case 'rune-floating': {
      // Hovering ring with an emissive sigil disk inside it.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 10, 28), toonMat(color, { emissive }));
      ring.position.y = 0.9; ring.rotation.x = Math.PI / 2; g.add(ring);
      g.add(glowDisk(emissive || color, 0.45, 0.55)).position.y = 0.05;
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(emissive || color), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      inner.position.y = 0.9; inner.rotation.x = Math.PI / 2; g.add(inner);
      break;
    }
    case 'sigil-cursed': {
      // Cursed disc on the floor — outer torus + glowing pentacle plane.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 28), toonMat(color, { emissive }));
      ring.position.y = 0.04; ring.rotation.x = -Math.PI / 2; g.add(ring);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.50, 24),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(emissive || color), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      inner.position.y = 0.045; inner.rotation.x = -Math.PI / 2; g.add(inner);
      break;
    }
    case 'bone-rib': {
      // Curved rib arch — partial torus + two vertical spine cylinders.
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 20, Math.PI), toonMat(color));
      arch.position.y = 0.55; arch.rotation.x = Math.PI / 2; g.add(arch);
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), toonMat(color));
      spine.position.y = 0.55; g.add(spine);
      break;
    }
    case 'bone-skull': {
      // Skull — squashed sphere + two eye-socket holes via dark spheres.
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), toonMat(color));
      cranium.position.y = 0.35; cranium.scale.set(1, 0.9, 1.1); g.add(cranium);
      for (const x of [-0.10, 0.10]) {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toonMat('#0a0808'));
        socket.position.set(x, 0.38, 0.27); g.add(socket);
      }
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.24), toonMat(color));
      jaw.position.set(0, 0.18, 0.05); g.add(jaw);
      break;
    }
    case 'pillar-divine': {
      // Fluted column with a wide capital — taller and brighter than stone.
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.16, 16), toonMat(color, { emissive }));
      base.position.y = 0.08; g.add(base);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.7, 18), toonMat(color, { emissive }));
      shaft.position.y = 0.95; g.add(shaft);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.42, 0.22, 16), toonMat(color, { emissive }));
      cap.position.y = 1.92; g.add(cap);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 28),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(emissive || color), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      halo.position.y = 2.1; halo.rotation.x = -Math.PI / 2; g.add(halo);
      break;
    }
    case 'moon-orb': {
      // Hovering glowing sphere + additive halo.
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), toonMat(color, { emissive }));
      orb.position.y = 1.05; g.add(orb);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(emissive || color), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.y = 1.05; g.add(halo);
      break;
    }
    case 'lightning-strike': {
      // Vertical jagged crystal blade — looks like frozen lightning.
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.10, 1.6, 5), toonMat(color, { emissive }));
      m.position.y = 0.8; m.rotation.y = Math.random() * Math.PI; g.add(m);
      g.add(glowDisk(emissive || color, 0.4, 0.5));
      break;
    }
    case 'void-fissure': {
      // Floor scar — additive plane, tilted slightly into the ground.
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.32), mat);
      m.position.y = 0.04; m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * Math.PI; g.add(m);
      break;
    }
    case 'spire-jagged': {
      // Tall sharp peak — single elongated cone with a stone material.
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 6), toonMat(color));
      m.position.y = 1.1; m.rotation.y = Math.random() * Math.PI;
      g.add(m); break;
    }
    case 'cliff-mist': {
      // Soft volumetric cliff wall — a couple of overlapping rounded boxes.
      const sweep = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 8), toonMat(color, { transparent: true, opacity: 0.5 }));
      sweep.position.y = 0.6; sweep.scale.set(1.4, 0.7, 0.6); g.add(sweep);
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 8), toonMat(color, { transparent: true, opacity: 0.4 }));
      back.position.set(0.3, 0.5, -0.4); back.scale.set(1.1, 0.6, 0.5); g.add(back);
      break;
    }
  }

  return g;
}
