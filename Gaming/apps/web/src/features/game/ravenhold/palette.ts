/**
 * Рейвънхолд — the shared art direction for every game table, ported from the
 * `boy` project („Двубой в Рейвънхолд"): a castle hall at night, lit by torch
 * fire and cold moonlight through rain. One palette drives the WebGL hall
 * backdrop, the 3D scenes' fog/background/IBL and the display-space grade, so
 * all 21 games read as rooms of the same castle.
 *
 * Colours are LINEAR RGB (what the shaders and three.js expect).
 */
export type RavenTone = "warm" | "midnight" | "cool" | "default";

export interface ToneLight {
  /** Torch/brazier colour and strength. */
  fire: readonly [number, number, number];
  fireAmt: number;
  /** Moonlight through the tall windows. */
  moon: readonly [number, number, number];
  moonAmt: number;
}

/** Night fog — boy's `FOG.color` (a blue-black that never reads as pure black). */
export const FOG_LINEAR = [0.017, 0.021, 0.03] as const;
export const FOG_HEX = "#0b0d12";

/** Per-game mood. `warm` = candlelit parlour, `midnight` = late-night card room,
 *  `cool` = sea/water games, `default` = the torchlit great hall. */
export const TONES: Record<RavenTone, ToneLight> = {
  default: { fire: [1.0, 0.46, 0.16], fireAmt: 1.0, moon: [0.42, 0.55, 0.85], moonAmt: 0.55 },
  warm: { fire: [1.0, 0.5, 0.18], fireAmt: 1.25, moon: [0.42, 0.55, 0.85], moonAmt: 0.35 },
  midnight: { fire: [1.0, 0.42, 0.14], fireAmt: 0.7, moon: [0.38, 0.5, 0.9], moonAmt: 0.85 },
  cool: { fire: [1.0, 0.48, 0.18], fireAmt: 0.6, moon: [0.36, 0.58, 0.9], moonAmt: 1.0 },
};
