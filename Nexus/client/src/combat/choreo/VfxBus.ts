/**
 * Bridge between the timeline-driven choreographer and the VFX functions
 * still living inside CombatScene3D's useEffect closure.
 *
 * The scene mounts a VfxBus, fills its slots with the in-closure functions
 * (which need scene-graph + fxGroup + textureCaches access) and hands the
 * bus to the choreographer at init time. The executor calls bus.shockwave(...)
 * etc. instead of reaching into the closure. This is the only seam between
 * the new system and the existing VFX implementation — keep it stable.
 */

import * as THREE from 'three';

export interface VfxBus {
  /** Expanding ground ring on slash impact. */
  shockwave: (x: number, z: number, color: number) => void;
  /** Anime-style 3D slash arc tube. */
  slashArc: (fromX: number, fromZ: number, toX: number, toZ: number, color: number) => void;
  /** Magic circle decal + vertical beam under a target. */
  magicCircle: (x: number, z: number, color: number) => void;
  /** Glowing arrow streak with motion-trail tube. */
  arrow: (fromX: number, fromZ: number, toX: number, toZ: number, color: number) => void;
  /** Translucent attacker clone that lingers + fades. */
  afterImage: (side: 'hero' | 'foe', tint: number) => void;
  /** Additive particle burst at a point. */
  burst: (x: number, y: number, z: number, count: number, color: number) => void;
  /** Full-screen sigil flash (80ms). 1 of "斬" / "貫" / "影" / "裂". */
  sigilFlash: (glyph: string, color: number) => void;
  /** Chromatic ground crack decal expanding from a point. */
  groundCrack: (x: number, z: number, color: number) => void;
  /** Boots-on-dirt cloud — small grey burst kicked up from the lunge feet. */
  dustKick: (x: number, z: number, intensity?: number) => void;
  /** Anime wind streak — horizontal motion lines that fly past the camera. */
  windStreak: (fromX: number, toX: number, color: number) => void;
  /** Floating runic wisps orbiting a point. Used during mage cast. */
  manaWisps: (x: number, y: number, count: number, color: number) => void;
  /** Inky shadow tendrils trailing a side during a shadow-step. */
  shadowTendril: (side: 'hero' | 'foe', color: number) => void;
  /** Ground-up god-ray bounce — vertical light cone from an impact point. */
  godRay: (x: number, z: number, color: number, height?: number) => void;
  /** Lens flare blip on the camera near a fighter's tint. */
  lensFlare: (color: number, intensity?: number, life?: number) => void;
  /** Vignette intensity (0..1). Timeline-driven via post.vignette channel. */
  setVignette: (intensity: number) => void;
  /** Desaturate the picture (0..1, 0=normal, 1=greyscale) — used in slow-mo. */
  setDesaturation: (amount: number) => void;
  /** Camera shake controller. */
  shake: (amount: number, time: number) => void;
  /** Hit-stop controller — freezes simulation for `dur` seconds. */
  hitstop: (dur: number) => void;
  /** Bloom strength kick — adds `delta` then eases back over `recover` seconds. */
  bloomKick: (delta: number, recover: number) => void;
  /** Set the post.rgbShift uniform directly. */
  setRgbShift: (amount: number) => void;
  /** Rim-light pulse on the named side. */
  lightPulse: (side: 'hero' | 'foe', tint: number, intensity: number) => void;
  /** Re-aim rim/key lights (called once on intro). */
  resetLighting?: () => void;
  /** Camera anchor (raw mutation — the choreographer owns interpolation). */
  cameraAnchor: () => CameraAnchor;
  /** Get the current world position of a fighter for VFX targeting. */
  fighterPos: (side: 'hero' | 'foe') => THREE.Vector3;
}

export interface CameraAnchor {
  x: number; y: number; z: number;
  lx: number; ly: number; lz: number;
  fov: number;
}

/** Default-no-op bus used as a sentinel before the scene mounts. */
export function emptyVfxBus(): VfxBus {
  const noop = (..._: any[]) => { /* noop */ };
  return {
    shockwave: noop, slashArc: noop, magicCircle: noop, arrow: noop,
    afterImage: noop, burst: noop, sigilFlash: noop, groundCrack: noop,
    dustKick: noop, windStreak: noop, manaWisps: noop, shadowTendril: noop,
    godRay: noop, lensFlare: noop, setVignette: noop, setDesaturation: noop,
    shake: noop, hitstop: noop, bloomKick: noop, setRgbShift: noop,
    lightPulse: noop,
    cameraAnchor: () => ({ x: 0, y: 1.9, z: 6, lx: 0, ly: 1.3, lz: 0, fov: 48 }),
    fighterPos: () => new THREE.Vector3(),
  };
}
