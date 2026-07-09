/**
 * Combat timeline — data shape consumed by the choreographer.
 *
 * A timeline is a partition (a "battle take") that drives every channel of
 * the scene over a fixed local time line: rig animations, root motion,
 * camera anchor, VFX bursts, post-process tweaks and audio cues. The
 * choreographer is timeline-driven (not state-driven) so adding a new
 * attack means writing one of these — not patching a 1200-line switch.
 *
 * Each channel is a small list of Keyframes that the corresponding
 * TrackExecutor samples each tick. Each Cue is a one-shot trigger fired
 * the first time we cross its `t` mark.
 *
 * The mirror flag swaps + flips horizontal channels (root.x, camera.x,
 * camera.lx) so the same hero timeline can drive a foe attack without
 * authoring a second copy.
 */

import type { Ease } from './EaseLib';

/* ────────── Channels ─────────── */

/** Numeric channel keys interpreted by TrackExecutors. */
export type NumericChannel =
  | 'camera.x' | 'camera.y' | 'camera.z'
  | 'camera.lx' | 'camera.ly' | 'camera.lz'
  | 'camera.fov'
  | 'root.attacker.x' | 'root.attacker.y' | 'root.attacker.z'
  | 'root.target.x'   | 'root.target.y'   | 'root.target.z'
  | 'bone.attacker.torsoYaw' | 'bone.attacker.torsoPitch'
  | 'bone.attacker.armPitch'
  | 'post.bloom' | 'post.rgbShift' | 'post.vignette' | 'post.desaturation' | 'post.fogDensity'
  | 'light.attacker' | 'light.target'
  | 'timeScale';

export interface Keyframe {
  t: number;
  v: number;
  ease?: Ease;
}

export interface Track {
  channel: NumericChannel;
  /** Sorted ascending by t. Linear before the first key, hold after the last. */
  keys: Keyframe[];
}

/* ────────── Cues — one-shot triggers ───────── */

export type CueType =
  // VFX
  | 'vfx.shockwave' | 'vfx.slashArc' | 'vfx.magicCircle' | 'vfx.arrow'
  | 'vfx.afterImage' | 'vfx.burst' | 'vfx.sigilFlash' | 'vfx.groundCrack'
  | 'vfx.scratch'
  // Ambient signature layer per class — fired alongside the impact cues
  // so attacks feel grounded in the world, not pasted on top of it.
  | 'vfx.dustKick' | 'vfx.windStreak' | 'vfx.manaWisps' | 'vfx.shadowTendril'
  | 'vfx.godRay' | 'vfx.lensFlare'
  // Rig
  | 'rig.crossfade'
  // Camera convenience
  | 'shake'
  // Time-warp
  | 'hitstop'
  // Callback hook (UI/SFX sync)
  | 'callback.onImpact'
  | 'audio';

export interface Cue {
  /** Local time inside the timeline at which to fire (seconds). */
  t: number;
  type: CueType;
  /** Free-form payload, interpreted per `type` by VfxTrackExec. */
  payload?: any;
}

/* ────────── Timeline ─────────── */

export interface Timeline {
  /** Identifier used for tracing + interrupt arbitration. */
  id: string;
  /** Total duration in seconds. The choreographer stops sampling at `duration`. */
  duration: number;
  /** Fraction (0..1) after which a new attack may interrupt this one. */
  interruptibleAfter: number;
  /** Per-channel curves. */
  tracks: Track[];
  /** One-shot triggers (VFX bursts, hit-stops, audio cues, callbacks). */
  cues: Cue[];
  meta?: { tier?: 'basic' | 'heavy' | 'crit'; class?: string };
}

/* ────────── Helpers — terse builders for timeline authors ───────── */

export function track(channel: NumericChannel, keys: Keyframe[]): Track {
  return { channel, keys };
}

export function k(t: number, v: number, ease?: Ease): Keyframe {
  return ease ? { t, v, ease } : { t, v };
}

export function cue(t: number, type: CueType, payload?: any): Cue {
  return payload === undefined ? { t, type } : { t, type, payload };
}

/**
 * Build a mirrored copy of a timeline so the same hero-side authoring
 * drives a foe attack. We negate every horizontal channel and swap the
 * attacker/target roots so root.attacker.x becomes root.target.x etc.
 */
export function mirror(t: Timeline): Timeline {
  const flipChan = (c: NumericChannel): NumericChannel => {
    if (c === 'root.attacker.x') return 'root.target.x';
    if (c === 'root.target.x') return 'root.attacker.x';
    if (c === 'root.attacker.y') return 'root.target.y';
    if (c === 'root.target.y') return 'root.attacker.y';
    if (c === 'root.attacker.z') return 'root.target.z';
    if (c === 'root.target.z') return 'root.attacker.z';
    if (c === 'light.attacker') return 'light.target';
    if (c === 'light.target') return 'light.attacker';
    if (c === 'bone.attacker.torsoYaw') return 'bone.attacker.torsoYaw';
    if (c === 'bone.attacker.armPitch') return 'bone.attacker.armPitch';
    return c;
  };
  const flipV = (chan: NumericChannel, v: number): number => {
    if (chan === 'camera.x' || chan === 'camera.lx' || chan === 'root.attacker.x' || chan === 'root.target.x' || chan === 'bone.attacker.torsoYaw') {
      return -v;
    }
    return v;
  };
  return {
    ...t,
    id: t.id + '.mirrored',
    tracks: t.tracks.map((tr) => ({
      channel: flipChan(tr.channel),
      keys: tr.keys.map((kk) => ({ ...kk, v: flipV(tr.channel, kk.v) })),
    })),
    cues: t.cues.map((c) => {
      if (!c.payload) return c;
      const p = { ...c.payload };
      // Negate any cue payload x coordinate so VFX land on the right
      // slot. We do NOT flip payload.side here: role names ('attacker'
      // / 'target') are resolved per-play through ctx.attacker by
      // Choreographer.fireCue, so the same role-tagged payload reads
      // correctly in either direction.
      if (typeof p.x === 'number') p.x = -p.x;
      if (typeof p.fromX === 'number') p.fromX = -p.fromX;
      if (typeof p.toX === 'number') p.toX = -p.toX;
      return { ...c, payload: p };
    }),
  };
}
