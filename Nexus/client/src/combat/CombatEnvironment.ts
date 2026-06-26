/**
 * Per-region environment dressing for the combat stage.
 *
 * Builds a THREE.Group of decorative props (trees, rocks, crystals,
 * obelisks, ice spikes, ash pillars, bone arches, divine columns…)
 * arranged around the fighters without occluding the camera line.
 * Each region recipe writes its own visual signature on top of the
 * shared sky cylinder + PBR ground in CombatScene3D.
 *
 * Props are billboard sprites with procedurally-painted canvas
 * textures — zero asset cost, ~2-3 ms canvas paint at scene mount,
 * sub-millisecond per-frame render through InstancedMesh batching.
 *
 * Spawn rules:
 *   - Props live on two rings — `near` (radius 4-7) and `far` (8-14)
 *     — both arranged in an arc behind the fighters so they don't
 *     block the camera frame.
 *   - Lite-mode budget: each region's `count` field is halved for
 *     touch/coarse/<900px devices.
 */

import * as THREE from 'three';
import { buildPropMesh, ensurePropsLoaded } from './CombatProps3D';

export interface RegionEnvironment {
  group: THREE.Group;
  emberSpawner?: (dt: number, particles: ParticleHandles) => void;
  dispose: () => void;
}

interface ParticleHandles {
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  lives: Float32Array;
  maxLives: Float32Array;
  alive: number;
}

interface PropSpec {
  kind:
    | 'tree-fir' | 'tree-oak' | 'tree-dead' | 'mushroom-bell'
    | 'rock-jagged' | 'rock-round' | 'pillar-stone' | 'pillar-obsidian'
    | 'crystal-shard' | 'icicle' | 'cattail'
    | 'ash-plume' | 'lava-vent' | 'pickaxe' | 'cart' | 'tome'
    | 'rune-floating' | 'sigil-cursed' | 'bone-rib' | 'bone-skull'
    | 'pillar-divine' | 'moon-orb' | 'lightning-strike' | 'void-fissure'
    | 'spire-jagged' | 'cliff-mist';
  color: string;
  emissive?: string;
  count: number;
  scale: [number, number];
  radius: [number, number];
  yOffset?: number;
}

interface RegionRecipe {
  props: PropSpec[];
  emberColor?: number;
  emberRate?: number;  // particles per second
  emberUp?: boolean;   // true = rising embers/snow/dust; false = falling
}

// ============================================================================
// Region recipes — what to spawn for each of the 16 named regions.
// ============================================================================
const RECIPES: Record<string, RegionRecipe> = {
  // ----- Act 1 -----
  whispering_woods: {
    props: [
      { kind: 'tree-fir',     color: '#2a5530', count: 5, scale: [3.5, 5.5], radius: [8, 14] },
      { kind: 'tree-oak',     color: '#3a6038', count: 3, scale: [3.0, 4.5], radius: [6, 11] },
      { kind: 'mushroom-bell',color: '#a04030', emissive: '#ffd070', count: 4, scale: [0.6, 1.0], radius: [3, 5] },
      { kind: 'rock-round',   color: '#2c2820', count: 3, scale: [1.0, 1.6], radius: [4, 7] },
    ],
    emberColor: 0xa8e470, emberRate: 1.6, emberUp: true,  // fireflies
  },
  mistmoor_hills: {
    props: [
      { kind: 'rock-jagged',  color: '#454a55', count: 5, scale: [1.8, 2.8], radius: [5, 11] },
      { kind: 'rock-round',   color: '#3a3c45', count: 4, scale: [1.2, 1.8], radius: [4, 7] },
      { kind: 'cliff-mist',   color: '#5a6275', count: 3, scale: [6, 10], radius: [10, 14] },
      { kind: 'tree-dead',    color: '#3a3a3a', count: 2, scale: [3.0, 4.0], radius: [7, 10] },
    ],
    emberColor: 0xa8b0c0, emberRate: 1.0, emberUp: false, // drifting mist motes
  },
  crystal_caverns: {
    props: [
      { kind: 'crystal-shard', color: '#3a5a8a', emissive: '#7ab8ff', count: 6, scale: [1.5, 3.0], radius: [4, 10] },
      { kind: 'pillar-stone',  color: '#1a253a', count: 3, scale: [3.0, 4.5], radius: [8, 13] },
      { kind: 'rock-jagged',   color: '#1f2840', count: 3, scale: [1.4, 2.2], radius: [4, 7] },
    ],
    emberColor: 0x6aa7ff, emberRate: 2.0, emberUp: true,  // crystal motes
  },
  ashen_wastes: {
    props: [
      { kind: 'tree-dead',  color: '#4a2a18', count: 4, scale: [3.0, 4.0], radius: [6, 11] },
      { kind: 'ash-plume',  color: '#5a3525', count: 4, scale: [4, 7], radius: [9, 14] },
      { kind: 'lava-vent',  color: '#ff5a2c', emissive: '#ffb070', count: 3, scale: [1.2, 1.8], radius: [4, 8] },
      { kind: 'rock-jagged',color: '#3a1a10', count: 3, scale: [1.5, 2.4], radius: [4, 8] },
    ],
    emberColor: 0xff7c4d, emberRate: 3.5, emberUp: true,
  },
  shadowfell: {
    props: [
      { kind: 'pillar-obsidian', color: '#180828', emissive: '#a060ff', count: 4, scale: [3.5, 5.0], radius: [6, 11] },
      { kind: 'sigil-cursed',    color: '#3a1a4a', emissive: '#c294ff', count: 3, scale: [1.8, 2.5], radius: [5, 9] },
      { kind: 'tree-dead',       color: '#2a1a35', count: 2, scale: [3.5, 4.5], radius: [8, 12] },
    ],
    emberColor: 0xc294ff, emberRate: 2.0, emberUp: true,
  },

  // ----- Mid-tier -----
  emberreach: {
    props: [
      { kind: 'lava-vent',   color: '#ff4a20', emissive: '#ffa050', count: 5, scale: [1.4, 2.2], radius: [4, 10] },
      { kind: 'rock-jagged', color: '#2a0a04', count: 5, scale: [1.6, 2.8], radius: [5, 11] },
      { kind: 'spire-jagged',color: '#5a1f10', count: 3, scale: [4, 7], radius: [10, 14] },
      { kind: 'ash-plume',   color: '#6a2a15', count: 3, scale: [4, 6], radius: [9, 13] },
    ],
    emberColor: 0xff5a2c, emberRate: 5.0, emberUp: true,
  },
  hammerhand_pass: {
    props: [
      { kind: 'rock-jagged', color: '#3a302a', count: 5, scale: [1.6, 2.6], radius: [5, 10] },
      { kind: 'pickaxe',     color: '#888888', count: 3, scale: [1.0, 1.4], radius: [4, 7] },
      { kind: 'cart',        color: '#5a3a20', count: 2, scale: [1.4, 1.8], radius: [6, 9] },
      { kind: 'pillar-stone',color: '#403028', count: 3, scale: [3.0, 4.0], radius: [9, 13] },
    ],
    emberColor: 0xc89060, emberRate: 1.5, emberUp: false, // dust
  },
  conclave_aedric: {
    props: [
      { kind: 'pillar-stone',   color: '#3a2050', emissive: '#a070ff', count: 4, scale: [3.5, 5.0], radius: [7, 12] },
      { kind: 'tome',           color: '#2a1840', emissive: '#fff5d6', count: 4, scale: [0.8, 1.2], radius: [3, 7] },
      { kind: 'rune-floating',  color: '#5a3080', emissive: '#c294ff', count: 4, scale: [1.5, 2.2], radius: [5, 9] },
    ],
    emberColor: 0xc294ff, emberRate: 2.5, emberUp: true,
  },
  saltmarsh: {
    props: [
      { kind: 'cattail',      color: '#5a3a18', count: 8, scale: [1.4, 2.0], radius: [3, 8] },
      { kind: 'tree-dead',    color: '#3a2818', count: 3, scale: [3.0, 4.5], radius: [7, 12] },
      { kind: 'rock-round',   color: '#2a3025', count: 3, scale: [1.0, 1.5], radius: [4, 7] },
      { kind: 'cliff-mist',   color: '#3a4a3a', count: 3, scale: [5, 8], radius: [10, 14] },
    ],
    emberColor: 0x9ac8a4, emberRate: 1.2, emberUp: false,
  },
  frostvale: {
    props: [
      { kind: 'icicle',      color: '#a8d0e0', emissive: '#ffffff', count: 6, scale: [1.6, 2.6], radius: [4, 10] },
      { kind: 'rock-jagged', color: '#7a8a98', count: 4, scale: [1.5, 2.2], radius: [5, 9] },
      { kind: 'tree-fir',    color: '#3a4a52', count: 4, scale: [3.5, 5.0], radius: [8, 13] },
      { kind: 'spire-jagged',color: '#909caa', count: 2, scale: [5, 7], radius: [11, 14] },
    ],
    emberColor: 0xe8f5ff, emberRate: 4.0, emberUp: false, // snow
  },
  black_spire: {
    props: [
      { kind: 'spire-jagged',    color: '#1a0808', count: 4, scale: [5, 8], radius: [9, 14] },
      { kind: 'pillar-obsidian', color: '#2a0a0a', emissive: '#ff3a2a', count: 3, scale: [3.5, 5], radius: [6, 10] },
      { kind: 'sigil-cursed',    color: '#5a1a1a', emissive: '#ff5a3a', count: 4, scale: [1.6, 2.4], radius: [4, 8] },
      { kind: 'bone-skull',      color: '#7a6a5a', count: 3, scale: [1.0, 1.4], radius: [4, 7] },
    ],
    emberColor: 0xff3a2a, emberRate: 4.0, emberUp: true,
  },

  // ----- Divine -----
  stormpeaks: {
    props: [
      { kind: 'spire-jagged',    color: '#2a303a', count: 4, scale: [6, 9], radius: [10, 14] },
      { kind: 'cliff-mist',      color: '#48586a', count: 4, scale: [6, 9], radius: [9, 13] },
      { kind: 'lightning-strike',color: '#a0c8ff', emissive: '#ffffff', count: 3, scale: [3.5, 5], radius: [9, 13], yOffset: 2 },
      { kind: 'rock-jagged',     color: '#1a2030', count: 3, scale: [1.6, 2.2], radius: [4, 8] },
    ],
    emberColor: 0xa0c8ff, emberRate: 2.5, emberUp: false,
  },
  voidshade_hollow: {
    props: [
      { kind: 'void-fissure',    color: '#a074ff', emissive: '#e0a0ff', count: 4, scale: [3.5, 5], radius: [7, 12] },
      { kind: 'pillar-obsidian', color: '#080414', emissive: '#7050ff', count: 3, scale: [4, 5.5], radius: [6, 10] },
      { kind: 'rune-floating',   color: '#3a1a5a', emissive: '#c294ff', count: 4, scale: [1.5, 2.2], radius: [4, 8] },
    ],
    emberColor: 0xa074ff, emberRate: 3.0, emberUp: true,
  },
  mooncradle: {
    props: [
      { kind: 'pillar-divine', color: '#b8c4e8', emissive: '#fff5fa', count: 4, scale: [3.5, 5], radius: [7, 12] },
      { kind: 'moon-orb',      color: '#d4dfff', emissive: '#ffffff', count: 5, scale: [1.5, 2.5], radius: [5, 10], yOffset: 2 },
      { kind: 'rock-round',    color: '#8a8aa0', count: 3, scale: [1.0, 1.5], radius: [4, 7] },
    ],
    emberColor: 0xd4dfff, emberRate: 3.0, emberUp: true,
  },
  worldspine: {
    props: [
      { kind: 'bone-rib',    color: '#d4c8b0', count: 4, scale: [4, 6], radius: [7, 12] },
      { kind: 'bone-skull',  color: '#c8bca0', count: 4, scale: [1.0, 1.5], radius: [4, 8] },
      { kind: 'spire-jagged',color: '#85756a', count: 3, scale: [5, 7], radius: [10, 14] },
    ],
    emberColor: 0xffe4b0, emberRate: 1.8, emberUp: false,
  },
  eternal_throne: {
    props: [
      { kind: 'pillar-divine', color: '#3a2a14', emissive: '#ffd060', count: 5, scale: [4, 6], radius: [6, 12] },
      { kind: 'rune-floating', color: '#5a3a0a', emissive: '#fff5a0', count: 4, scale: [1.6, 2.4], radius: [4, 9] },
      { kind: 'sigil-cursed',  color: '#1a1020', emissive: '#ffd060', count: 3, scale: [2, 3], radius: [5, 10] },
    ],
    emberColor: 0xffd060, emberRate: 4.0, emberUp: true,
  },
};

// Fallback for unmapped regions.
const DEFAULT_RECIPE: RegionRecipe = RECIPES.whispering_woods;

// ============================================================================
// Public builder
// ============================================================================
export function buildRegionEnvironment(
  regionKey: string,
  liteMode: boolean,
): RegionEnvironment {
  const recipe = RECIPES[regionKey] || DEFAULT_RECIPE;
  const group = new THREE.Group();
  group.name = 'environment';
  const created: THREE.Object3D[] = [];

  for (const spec of recipe.props) {
    // Lite mode halves the prop count (and rounds up to at least 1).
    const count = liteMode ? Math.max(1, Math.ceil(spec.count / 2)) : spec.count;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI + Math.PI; // back arc only (camera faces +z forward in scene coords)
      const r = lerp(spec.radius[0], spec.radius[1], Math.random());
      const x = Math.cos(angle) * r + (Math.random() - 0.5) * 1.5;
      const z = Math.sin(angle) * r * 0.6 + (Math.random() - 0.5) * 1.5 - 2; // bias behind origin
      const scale = lerp(spec.scale[0], spec.scale[1], Math.random());
      // 3D mesh per prop kind — toon-shaded, real geometry. The mesh
      // builder produces a unit-tall prop centred on its base; we scale
      // and position it here, plus add per-instance rotation/tint jitter
      // so the props don't all look identical within a region.
      const mesh = buildPropMesh(spec.kind, spec.color, spec.emissive);
      mesh.scale.setScalar(scale);
      mesh.position.set(x, spec.yOffset ?? 0, z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      // Cast shadows on the larger props; ground-level scatter (sigils,
      // void fissures, lava vents) get receiveShadow only since their
      // back faces aren't there.
      const isGroundFx = spec.kind === 'void-fissure' || spec.kind === 'sigil-cursed' || spec.kind === 'lava-vent';
      mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = !isGroundFx;
          m.receiveShadow = true;
        }
      });
      group.add(mesh);
      created.push(mesh);
    }
  }

  return {
    group,
    dispose: () => {
      for (const obj of created) {
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          // Skip shared resources owned by the CombatProps3D template
          // cache — disposing them would white-out every other mount.
          // Per-instance materials are not shared so we still free them;
          // their texture slots are tagged shared.
          if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
          const disposeMat = (mat: THREE.Material) => {
            const mm = mat as THREE.MeshStandardMaterial;
            for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
              const tex = (mm as any)[slot] as THREE.Texture | null;
              if (tex && tex.userData.shared) (mm as any)[slot] = null;
            }
            mat.dispose?.();
          };
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach(disposeMat);
          else if (mat) disposeMat(mat);
        });
        group.remove(obj);
      }
    },
  };
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

export function getRegionEmberSpec(regionKey: string): { color: number; rate: number; up: boolean } {
  const r = RECIPES[regionKey] || DEFAULT_RECIPE;
  return {
    color: r.emberColor ?? 0xffd34d,
    rate:  r.emberRate ?? 2.0,
    up:    r.emberUp ?? true,
  };
}
