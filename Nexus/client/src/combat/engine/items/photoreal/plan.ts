// Тема на предмета → какви материали и какви цветове му трябват. Реалистичните метали не са
// „произволен цвят": стомана/черно желязо/злато/бронз/сребро/мед са фиксирани физични
// отражения, темата (primary/secondary/trim) ги оцветява само в рамките на правдоподобното.
// Редкостта се чете по материала/украсата/светенето, не по фона.
import * as THREE from 'three/webgpu';
import type { CatalogEntry, Family } from './../theme';

export type Kind = 'metal' | 'leather' | 'cloth' | 'bone' | 'crystal' | 'enamel';

export interface Surface { kind: Kind; color: THREE.Color; rough: number; coat: number; coatRough: number }

export interface Plan {
  plate: Surface; plateDark: Surface; trim: Surface; trimAlt: Surface; blade: Surface; bladeDark: Surface; iron: Surface;
  leatherColor: THREE.Color; woodColor: THREE.Color; clothColor: THREE.Color; clothSheen: THREE.Color;
  glow: THREE.Color; glowStrength: number; gem: THREE.Color; gemSize: number; patina: number;
}

const C = (hex: string | number): THREE.Color => new THREE.Color(hex as THREE.ColorRepresentation);
const mixC = (a: THREE.Color, b: THREE.Color | string, t: number): THREE.Color => a.clone().lerp(b instanceof THREE.Color ? b : C(b), t);
const dark = (c: THREE.Color, k: number): THREE.Color => c.clone().multiplyScalar(k);

export const STEEL = '#c9ccd2'; const DSTEEL = '#585b62'; const BLACK = '#26272c'; const GOLD = '#e3b45f';
const BRONZE = '#b6803f'; const SILVER = '#eceef2'; const COPPER = '#c4703f';

const GLOW: Record<Family, string> = {
  leather: '#ffae4a', mail: '#bcd0ff', plate: '#ffe08a', cloth: '#c7a8ff', bone: '#d9ff9a', crystal: '#7af0ff', void: '#9a3dff',
  celestial: '#ffe9a8', infernal: '#ff5a1a', verdant: '#7dff5a', shadow: '#7a5cff', arcane: '#b873ff', storm: '#6fc4ff', frost: '#aef2ff',
};

const RARITY_GLOW: Record<string, number> = { common: 0, uncommon: 0.05, rare: 0.25, epic: 0.55, legendary: 1 };
const RARITY_GEM: Record<string, number> = { common: 0, uncommon: 0, rare: 0.6, epic: 0.85, legendary: 1.1 };

export function planFor(entry: CatalogEntry): Plan {
  const th = entry.theme;
  const fam = th.family;
  const P = C(th.primary); const S = C(th.secondary); const T = C(th.trim);
  const finish = th.finish;
  const rough = finish === 'matte' ? 1.35 : finish === 'worn' ? 1.15 : finish === 'polished' ? 0.72 : finish === 'enameled' ? 0.9 : 0.95;
  const coat = finish === 'polished' ? 0.45 : finish === 'enameled' ? 1 : finish === 'glowing' ? 0.5 : 0;
  const m = (color: THREE.Color, r: number, c = coat, cr = 0.08, kind: Kind = 'metal'): Surface => ({ kind, color, rough: Math.min(1, r * rough), coat: c, coatRough: cr });

  let plate = m(mixC(C(STEEL), P, 0.28), 0.34);
  let trim = m(mixC(C(GOLD), T, 0.35), 0.3, 0.3);
  let blade = m(mixC(C(STEEL), S, 0.12), 0.22, 0.12);
  let leather = mixC(C('#3a2415'), P, 0.35);
  switch (fam) {
    case 'leather': plate = m(mixC(P, C('#2a1a10'), 0.1).multiplyScalar(0.8), 0.55, 0.1, 0.4, 'leather'); trim = m(mixC(C(BRONZE), T, 0.3), 0.42, 0.2); blade = m(mixC(C(STEEL), S, 0.06), 0.3, 0.1); leather = mixC(P, C('#1d120a'), 0.25); break;
    case 'mail': plate = m(mixC(C(DSTEEL), P, 0.18), 0.4); trim = m(mixC(C(BRONZE), T, 0.3), 0.4); blade = m(mixC(C(STEEL), S, 0.1), 0.26); break;
    case 'plate': plate = m(mixC(C(STEEL), P, 0.22), 0.3); trim = m(mixC(C(GOLD), T, 0.4), 0.28, 0.35); blade = m(mixC(C(STEEL), S, 0.08), 0.22, 0.2); break;
    case 'cloth': plate = m(P, 0.9, 0, 0.4, 'cloth'); trim = m(mixC(C(GOLD), T, 0.4), 0.3); blade = m(mixC(C(SILVER), S, 0.15), 0.22); break;
    case 'bone': plate = m(mixC(C('#cdbf9e'), P, 0.45), 0.55, 0.15, 0.3, 'bone'); trim = m(mixC(C(BRONZE), T, 0.3), 0.45); blade = m(mixC(C('#d2c6a6'), S, 0.2), 0.5, 0.2, 0.3, 'bone'); break;
    case 'crystal': plate = m(mixC(C('#d4e8ee'), P, 0.45), 0.2, 0.6); trim = m(mixC(C(SILVER), T, 0.25), 0.22, 0.3); blade = m(mixC(C('#cfeaf2'), P, 0.55), 0.05, 0, 0.05, 'crystal'); break;
    case 'void': plate = m(mixC(C(BLACK), P, 0.55), 0.3, 0.8, 0.06); trim = m(mixC(dark(S, 0.9), T, 0.3), 0.25, 0.4); blade = m(mixC(C('#17121e'), P, 0.4), 0.2, 0.7, 0.05); break;
    case 'celestial': plate = m(mixC(C('#d6c28a'), P, 0.4), 0.3, 0.35); trim = m(mixC(C(GOLD), T, 0.5), 0.2, 0.4); blade = m(mixC(C('#dcc995'), S, 0.2), 0.2, 0.3); break;
    case 'infernal': plate = m(mixC(C('#2a1210'), P, 0.55), 0.38, 0.4, 0.1); trim = m(mixC(C(COPPER), T, 0.4), 0.3); blade = m(mixC(C('#3a2018'), S, 0.3), 0.26, 0.3); break;
    case 'verdant': plate = m(mixC(C('#8a8f58'), P, 0.5), 0.46, 0.15); trim = m(mixC(C(BRONZE), T, 0.4), 0.38); blade = m(mixC(C('#a8b79a'), S, 0.3), 0.28); break;
    case 'shadow': plate = m(mixC(C('#17171c'), P, 0.4), 0.34, 0.6, 0.07); trim = m(mixC(C('#4a4658'), T, 0.4), 0.3, 0.3); blade = m(mixC(C('#1a1a20'), S, 0.3), 0.22, 0.6, 0.05); break;
    case 'arcane': plate = m(mixC(C('#7a5fa8'), P, 0.6), 0.26, 1, 0.04, 'enamel'); trim = m(mixC(C(GOLD), T, 0.4), 0.26, 0.3); blade = m(mixC(C('#cdb8ee'), S, 0.3), 0.14, 0.3); break;
    case 'storm': plate = m(mixC(C('#6e86a8'), P, 0.5), 0.3, 0.5); trim = m(mixC(C(SILVER), T, 0.3), 0.24, 0.3); blade = m(mixC(C('#a8c0e0'), S, 0.3), 0.16, 0.3); break;
    case 'frost': plate = m(mixC(C('#a9c4d2'), P, 0.4), 0.3, 0.45); trim = m(mixC(C(SILVER), T, 0.3), 0.22, 0.3); blade = m(mixC(C('#bcdbe8'), P, 0.3), 0.08, 0.1, 0.05, 'crystal'); break;
  }
  const glowHex = th.emissive || GLOW[fam];
  const glowOn = finish === 'glowing' || ['void', 'infernal', 'arcane', 'celestial', 'storm', 'frost', 'crystal'].includes(fam);
  const rg = RARITY_GLOW[entry.rarity] ?? 0;
  const glowStrength = glowOn ? Math.max(0.2, rg) * (finish === 'glowing' ? 1.3 : 0.6) : rg * 0.25;
  const woodC = mixC(C('#5a3a20'), P, 0.15);
  return {
    plate, plateDark: m(dark(plate.color, 0.55), plate.rough / rough * 1.2, plate.coat * 0.6, 0.12, plate.kind === 'metal' ? 'metal' : plate.kind),
    trim, trimAlt: m(dark(trim.color, 0.78), 0.4), blade, bladeDark: m(dark(blade.color, 0.82), blade.rough / rough * 1.1, blade.coat, 0.1, blade.kind),
    iron: m(mixC(C('#34312f'), P, 0.15), 0.5, 0.1),
    leatherColor: leather, woodColor: woodC, clothColor: P, clothSheen: mixC(P, '#ffffff', 0.5),
    glow: C(glowHex), glowStrength, gem: mixC(C(glowHex), T, 0.2), gemSize: RARITY_GEM[entry.rarity] ?? 0,
    patina: finish === 'worn' ? 1 : finish === 'matte' ? 0.5 : 0.15,
  };
}
