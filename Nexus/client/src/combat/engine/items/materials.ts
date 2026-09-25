// TSL/node материали за процедурните предмети — законите на boy: само node материали
// (MeshPhysicalNodeMaterial/MeshStandardNodeMaterial), нула ShaderMaterial/onBeforeCompile.
import * as THREE from 'three/webgpu';
import { color, sin, time } from 'three/tsl';
import type { Family, Finish, ItemTheme } from './theme';

interface FamilyBase {
  metalness: number;
  roughness: number;
  clearcoat?: number;
  sheen?: number;
  sheenRoughness?: number;
}

const FAMILY_BASE: Record<Family, FamilyBase> = {
  leather:   { metalness: 0, roughness: 0.95 },
  mail:      { metalness: 1, roughness: 0.7 },
  plate:     { metalness: 1, roughness: 0.35, clearcoat: 0.5 },
  cloth:     { metalness: 0, roughness: 0.85, sheen: 0.7, sheenRoughness: 0.5 },
  bone:      { metalness: 0, roughness: 0.55 },
  crystal:   { metalness: 0.1, roughness: 0.15, clearcoat: 0.9 },
  void:      { metalness: 0.2, roughness: 0.4 },
  celestial: { metalness: 0.4, roughness: 0.25, clearcoat: 0.6 },
  infernal:  { metalness: 0.3, roughness: 0.5 },
  verdant:   { metalness: 0, roughness: 0.7, sheen: 0.3, sheenRoughness: 0.6 },
  shadow:    { metalness: 0.3, roughness: 0.6 },
  arcane:    { metalness: 0.2, roughness: 0.3, clearcoat: 0.4 },
  storm:     { metalness: 0.85, roughness: 0.3, clearcoat: 0.3 },
  frost:     { metalness: 0.1, roughness: 0.2, clearcoat: 0.7 },
};

const FINISH_ADJUST: Record<Finish, { roughness: number; clearcoat: number; glow: number }> = {
  matte:    { roughness: +0.25, clearcoat: 0,    glow: 0 },
  worn:     { roughness: +0.12, clearcoat: -0.1, glow: 0 },
  polished: { roughness: -0.12, clearcoat: +0.1, glow: 0 },
  enameled: { roughness: -0.08, clearcoat: +0.25, glow: 0.15 },
  glowing:  { roughness: -0.05, clearcoat: +0.15, glow: 1 },
};

export type Role = 'primary' | 'secondary' | 'trim';

/** Builds one node material for a theme role. Deterministic (no randomness) — same theme,
 *  same material, always. Slow emissive pulse (~4s period, ±25%) never crosses the strobe
 *  threshold (WCAG 2.3.1 needs >3 flashes/sec; this is 0.25 Hz). */
export function themeMaterial(theme: ItemTheme, role: Role): THREE.MeshPhysicalNodeMaterial {
  const base = FAMILY_BASE[theme.family];
  const adj = FINISH_ADJUST[theme.finish];
  const hex = role === 'primary' ? theme.primary : role === 'secondary' ? theme.secondary : theme.trim;
  const params: THREE.MeshPhysicalNodeMaterialParameters = {
    name: `item-${theme.family}-${role}`,
    color: new THREE.Color(hex),
    metalness: THREE.MathUtils.clamp(base.metalness, 0, 1),
    roughness: THREE.MathUtils.clamp(base.roughness + adj.roughness, 0.04, 1),
    clearcoatRoughness: 0.15,
    side: THREE.DoubleSide,
  };
  if (base.clearcoat != null) params.clearcoat = THREE.MathUtils.clamp(base.clearcoat + adj.clearcoat, 0, 1);
  if (base.sheen) {
    params.sheen = base.sheen;
    params.sheenColor = new THREE.Color(theme.secondary);
    params.sheenRoughness = base.sheenRoughness;
  }
  const m = new THREE.MeshPhysicalNodeMaterial(params);
  const glowStrength = adj.glow * (role === 'trim' ? 1 : 0.4);
  if (glowStrength > 0 && theme.emissive) {
    const pulse = sin(time.mul(1.6)).mul(0.25).add(0.75).clamp(0, 1);
    m.emissiveNode = color(new THREE.Color(theme.emissive)).mul(pulse).mul(glowStrength * 2.2);
  }
  return m;
}

/** Всички три роли + опционален декал-материал (за orns на motif текстурата). */
export function buildRoleSet(theme: ItemTheme): Record<Role, THREE.MeshPhysicalNodeMaterial> {
  return { primary: themeMaterial(theme, 'primary'), secondary: themeMaterial(theme, 'secondary'), trim: themeMaterial(theme, 'trim') };
}

export function decalMaterial(theme: ItemTheme, map: THREE.Texture): THREE.MeshPhysicalNodeMaterial {
  const m = new THREE.MeshPhysicalNodeMaterial({
    name: 'item-decal', map, transparent: true, roughness: 0.5, metalness: 0.1,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  if (theme.finish === 'glowing' && theme.emissive) {
    m.emissive = new THREE.Color(theme.emissive);
    m.emissiveMap = map;
    const pulse = sin(time.mul(1.4)).mul(0.3).add(0.7).clamp(0, 1);
    m.emissiveNode = color(new THREE.Color(theme.emissive)).mul(pulse).mul(1.4);
  }
  return m;
}

/** Ореол на редкостта — тънка допълнителна obвивка, добавена само за rare+; не е дублирано на
 *  finish=glowing логиката (различна цел: редкост, не материал). */
export function rarityHalo(rarity: string): THREE.MeshBasicNodeMaterial | null {
  const HALO: Record<string, string> = { epic: '#c294ff', legendary: '#ffd34d' };
  const hex = HALO[rarity];
  if (!hex) return null;
  return new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false });
}
