/**
 * Battle timelines — every cinematic beat as data.
 *
 * Reads top-to-bottom like a director's shot list: camera moves, root
 * slides, bone lean, VFX bursts and audio cue slots in one place per
 * attack. A new attack = a new exported Timeline. Mirror() flips a hero
 * timeline into its foe counterpart at runtime, so each class only needs
 * one authored copy per tier.
 *
 * Camera anchor convention (base resting):
 *   x=0, y=1.9, z=6.0,  lx=0, ly=1.3, lz=0, fov=48
 * Camera deltas in the tracks ride OFF that base — i.e. a curve with
 * `camera.z` 6→5→6 dollies in then back out from the resting frame.
 *
 * Root deltas are signed offsets from the fighter's slot (-2.2 for hero,
 * +2.2 for foe). The choreographer adds the slot baseline before writing
 * to model.position — see Choreographer.setRootDelta.
 */

import { Timeline, track, k, cue, mirror } from './Timeline';

const HERO_BASE_X = -2.2;
const FOE_BASE_X = 2.2;
const REACH = 3.5; // x-distance hero → foe slot
const CAM_BASE = { x: 0, y: 1.9, z: 6.0, lx: 0, ly: 1.3, lz: 0, fov: 48 };

/* ────────── Warrior — Steel & Shield (sword slash) ────────── */

export const warriorBasic: Timeline = {
  id: 'warrior.basic',
  duration: 0.95,
  interruptibleAfter: 0.65,
  tracks: [
    // Push-in then pull-out
    track('camera.z', [
      k(0.00, CAM_BASE.z),
      k(0.18, 5.0, 'cubicOut'),
      k(0.35, 5.2, 'cubicInOut'),
      k(0.60, CAM_BASE.z, 'cubicInOut'),
      k(0.95, CAM_BASE.z),
    ]),
    track('camera.fov', [
      k(0.00, CAM_BASE.fov),
      k(0.18, 44, 'cubicOut'),
      k(0.60, CAM_BASE.fov, 'cubicInOut'),
    ]),
    // Look-at tracks the lunge target
    track('camera.lx', [
      k(0.00, 0),
      k(0.28, 0.6, 'cubicOut'),
      k(0.60, 0, 'cubicInOut'),
    ]),
    // Step-in then strike then recoil
    track('root.attacker.x', [
      k(0.00, 0),
      k(0.18, -0.35, 'cubicOut'),
      k(0.35, REACH * 0.55, 'cubicOut'),
      k(0.60, -0.30, 'cubicInOut'),
      k(0.95, 0, 'cubicInOut'),
    ]),
    // Torso wind-up twist (rig has Armature so bone manipulation is at
    // least attempted; if discovery fails the cache stores null and the
    // executor silently skips).
    track('bone.attacker.torsoYaw', [
      k(0.00, 0),
      k(0.18, 0.45, 'expoOut'),
      k(0.35, -0.55, 'cubicOut'),
      k(0.60, 0, 'cubicInOut'),
    ]),
    // Knock the target backwards on impact
    track('root.target.x', [
      k(0.00, 0),
      k(0.28, 0, 'hold'),
      k(0.40, 0.55, 'cubicOut'),
      k(0.75, 0, 'cubicInOut'),
    ]),
  ],
  cues: [
    cue(0.02, 'rig.crossfade', { side: 'attacker', action: 'attack', dur: 0.10 }),
    // Heel-plant dust as the lunge step lands
    cue(0.15, 'vfx.dustKick',  { intensity: 0.85 }),
    cue(0.18, 'audio',         { name: 'swoosh.heavy' }),
    cue(0.22, 'vfx.slashArc',  { fromX: HERO_BASE_X + 0.5, toX: FOE_BASE_X - 0.3, color: 0xffd34d }),
    cue(0.28, 'vfx.shockwave', { useTarget: true, color: 0xffd34d, bloomKick: { delta: 0.25, recover: 0.25 } }),
    cue(0.28, 'vfx.burst',     { useTarget: true, y: 1.4, count: 35, color: 0xffd34d }),
    // Foot-plant dust at impact (target end)
    cue(0.28, 'vfx.dustKick',  { useTarget: true, intensity: 1.1 }),
    cue(0.28, 'shake',         { amount: 0.30, dur: 0.18 }),
    cue(0.28, 'hitstop',       { dur: 0.06 }),
    cue(0.28, 'audio',         { name: 'impact.thud' }),
    cue(0.28, 'callback.onImpact'),
    cue(0.28, 'rig.crossfade', { side: 'target', action: 'hit', dur: 0.08 }),
    cue(0.85, 'rig.crossfade', { side: 'target', action: 'idle', dur: 0.20 }),
    cue(0.60, 'rig.crossfade', { side: 'attacker', action: 'idle', dur: 0.20 }),
  ],
  meta: { tier: 'basic', class: 'warrior' },
};

/* ────────── Ranger — Three Beats of Tension (bow shot) ────────── */

export const rangerBasic: Timeline = {
  id: 'ranger.basic',
  duration: 0.95,
  interruptibleAfter: 0.65,
  tracks: [
    // Slower draw, then quick release: hold on the archer
    track('camera.z', [
      k(0.00, CAM_BASE.z),
      k(0.30, 5.3, 'cubicInOut'),
      k(0.60, CAM_BASE.z, 'cubicInOut'),
    ]),
    track('camera.fov', [
      k(0.00, CAM_BASE.fov),
      k(0.30, 42, 'cubicInOut'),  // mild zoom for focus
      k(0.60, CAM_BASE.fov, 'cubicInOut'),
    ]),
    track('camera.lx', [
      k(0.00, 0),
      k(0.30, -0.5, 'cubicInOut'),  // look at archer during draw
      k(0.45, 0.6, 'cubicOut'),     // pan to target on release
      k(0.70, 0, 'cubicInOut'),
    ]),
    // Half-step back during draw, no big lunge
    track('root.attacker.x', [
      k(0.00, 0),
      k(0.30, -0.15, 'cubicOut'),
      k(0.45, 0, 'cubicOut'),
      k(0.95, 0, 'linear'),
    ]),
    track('bone.attacker.torsoYaw', [
      k(0.00, 0),
      k(0.30, 0.30, 'expoOut'),  // bow draw lean
      k(0.45, 0, 'cubicOut'),
    ]),
    track('root.target.x', [
      k(0.00, 0),
      k(0.45, 0, 'hold'),
      k(0.55, 0.35, 'cubicOut'),
      k(0.85, 0, 'cubicInOut'),
    ]),
  ],
  cues: [
    cue(0.02, 'rig.crossfade', { side: 'attacker', action: 'attack', dur: 0.12 }),
    cue(0.05, 'audio',         { name: 'bow.draw' }),
    // Anime wind streak builds during the draw for tension
    cue(0.30, 'vfx.windStreak',{ color: 0xddeeff }),
    cue(0.45, 'audio',         { name: 'bow.release' }),
    cue(0.45, 'vfx.arrow',     { color: 0x9ad9ff }),
    // Second wind streak rides the arrow path on release
    cue(0.45, 'vfx.windStreak',{ color: 0x9ad9ff }),
    cue(0.55, 'audio',         { name: 'impact.flesh' }),
    cue(0.55, 'vfx.burst',     { useTarget: true, y: 1.4, count: 24, color: 0x9ad9ff }),
    cue(0.55, 'shake',         { amount: 0.18, dur: 0.12 }),
    cue(0.55, 'callback.onImpact'),
    cue(0.55, 'rig.crossfade', { side: 'target', action: 'hit', dur: 0.08 }),
    cue(1.05, 'rig.crossfade', { side: 'target', action: 'idle', dur: 0.20 }),
    cue(0.65, 'rig.crossfade', { side: 'attacker', action: 'idle', dur: 0.20 }),
  ],
  meta: { tier: 'basic', class: 'ranger' },
};

/* ────────── Mage — Vertical Spectacle (magic beam) ────────── */

export const mageBasic: Timeline = {
  id: 'mage.basic',
  duration: 1.30,
  interruptibleAfter: 0.75,
  tracks: [
    // Camera leg back, low angle for the column
    track('camera.z', [
      k(0.00, CAM_BASE.z),
      k(0.35, 6.4, 'cubicOut'),
      k(0.75, 5.6, 'cubicInOut'),  // push back in on the beam strike
      k(1.10, CAM_BASE.z, 'cubicInOut'),
    ]),
    track('camera.y', [
      k(0.00, CAM_BASE.y),
      k(0.35, 1.5, 'cubicInOut'),   // duck low
      k(1.10, CAM_BASE.y, 'cubicInOut'),
    ]),
    track('camera.fov', [
      k(0.00, CAM_BASE.fov),
      k(0.35, 52, 'cubicInOut'),
      k(1.10, CAM_BASE.fov, 'cubicInOut'),
    ]),
    track('camera.lx', [
      k(0.00, 0),
      k(0.55, 0.8, 'cubicInOut'),
      k(1.10, 0, 'cubicInOut'),
    ]),
    track('camera.ly', [
      k(0.00, CAM_BASE.ly),
      k(0.55, 2.0, 'cubicOut'),     // look up at the beam
      k(1.10, CAM_BASE.ly, 'cubicInOut'),
    ]),
    // Mage half-step forward + staff lift
    track('root.attacker.x', [
      k(0.00, 0),
      k(0.30, -0.15, 'cubicOut'),
      k(0.95, 0, 'cubicInOut'),
    ]),
    track('root.attacker.y', [
      k(0.00, 0),
      k(0.30, 0.15, 'cubicOut'),
      k(0.65, 0, 'cubicInOut'),
    ]),
    // Target lifted by the beam, then dropped
    track('root.target.y', [
      k(0.00, 0),
      k(0.45, 0, 'hold'),
      k(0.65, 0.55, 'expoOut'),
      k(0.85, 0.55, 'hold'),
      k(1.20, 0, 'cubicInOut'),
    ]),
  ],
  cues: [
    cue(0.02, 'rig.crossfade',  { side: 'attacker', action: 'attack', dur: 0.15 }),
    // Mana wisps gather around the staff during the cast wind-up
    cue(0.20, 'vfx.manaWisps',  { count: 7, color: 0xc294ff }),
    cue(0.30, 'audio',          { name: 'magic.cast' }),
    cue(0.35, 'vfx.magicCircle',{ useTarget: true, color: 0xc294ff }),
    cue(0.55, 'audio',          { name: 'magic.beam' }),
    cue(0.75, 'vfx.shockwave',  { useTarget: true, color: 0xc294ff, bloomKick: { delta: 0.35, recover: 0.30 } }),
    cue(0.75, 'vfx.burst',      { useTarget: true, y: 1.8, count: 50, color: 0xc294ff }),
    // God-ray bounce out of the impact point — vertical violet cone
    cue(0.75, 'vfx.godRay',     { useTarget: true, color: 0xc294ff, height: 5 }),
    cue(0.75, 'shake',          { amount: 0.25, dur: 0.20 }),
    cue(0.75, 'hitstop',        { dur: 0.08 }),
    cue(0.75, 'audio',          { name: 'impact.thud' }),
    cue(0.75, 'callback.onImpact'),
    cue(0.75, 'rig.crossfade', { side: 'target', action: 'hit', dur: 0.08 }),
    cue(1.25, 'rig.crossfade', { side: 'target', action: 'idle', dur: 0.20 }),
    cue(1.00, 'rig.crossfade',  { side: 'attacker', action: 'idle', dur: 0.25 }),
  ],
  meta: { tier: 'basic', class: 'mage' },
};

/* ────────── Rogue — Anime Snap Edits (shadow-step backstab) ────────── */

export const rogueBasic: Timeline = {
  id: 'rogue.basic',
  duration: 0.85,
  interruptibleAfter: 0.60,
  tracks: [
    // Tight close-up, whip-feel — fast in, fast out
    track('camera.z', [
      k(0.00, CAM_BASE.z),
      k(0.12, 4.8, 'expoOut'),
      k(0.45, 5.2, 'cubicInOut'),
      k(0.85, CAM_BASE.z, 'cubicInOut'),
    ]),
    track('camera.fov', [
      k(0.00, CAM_BASE.fov),
      k(0.12, 38, 'expoOut'),       // tight
      k(0.45, CAM_BASE.fov, 'cubicInOut'),
    ]),
    track('camera.lx', [
      k(0.00, 0),
      k(0.12, -0.35, 'expoOut'),
      k(0.25, 0.7, 'expoOut'),      // whip-pan to target
      k(0.55, 0, 'cubicInOut'),
    ]),
    // Shadow-step: dive at start, blink to target
    track('root.attacker.x', [
      k(0.00, 0),
      k(0.12, -0.45, 'cubicOut'),
      k(0.18, REACH * 0.7, 'expoOut'),   // teleport-feel
      k(0.45, -0.2, 'cubicInOut'),
      k(0.85, 0, 'cubicInOut'),
    ]),
    track('bone.attacker.torsoYaw', [
      k(0.00, 0),
      k(0.18, -0.6, 'expoOut'),
      k(0.40, 0, 'cubicInOut'),
    ]),
    track('root.target.x', [
      k(0.00, 0),
      k(0.32, 0, 'hold'),
      k(0.45, 0.30, 'cubicOut'),
      k(0.75, 0, 'cubicInOut'),
    ]),
  ],
  cues: [
    cue(0.02, 'rig.crossfade', { side: 'attacker', action: 'attack', dur: 0.08 }),
    cue(0.05, 'audio',         { name: 'swoosh.light' }),
    // Shadow tendrils gather at the start of the shadow-step
    cue(0.05, 'vfx.shadowTendril', { side: 'attacker', color: 0x2a1a35 }),
    cue(0.10, 'vfx.afterImage',{ tint: 0xe85a4f }),
    cue(0.14, 'vfx.afterImage',{ tint: 0xe85a4f }),
    cue(0.18, 'vfx.afterImage',{ tint: 0xe85a4f }),
    // Second wisp of shadow at the snap-out frame
    cue(0.22, 'vfx.shadowTendril', { side: 'attacker', color: 0x2a1a35 }),
    cue(0.30, 'vfx.slashArc',  { fromX: FOE_BASE_X - 0.4, toX: FOE_BASE_X + 0.4, color: 0xe85a4f }),
    cue(0.32, 'audio',         { name: 'impact.flesh' }),
    cue(0.32, 'vfx.burst',     { useTarget: true, y: 1.4, count: 28, color: 0xe85a4f }),
    cue(0.32, 'shake',         { amount: 0.22, dur: 0.10 }),
    cue(0.32, 'hitstop',       { dur: 0.05 }),
    cue(0.32, 'callback.onImpact'),
    cue(0.32, 'rig.crossfade', { side: 'target', action: 'hit', dur: 0.08 }),
    cue(0.82, 'rig.crossfade', { side: 'target', action: 'idle', dur: 0.20 }),
    cue(0.55, 'rig.crossfade', { side: 'attacker', action: 'idle', dur: 0.15 }),
  ],
  meta: { tier: 'basic', class: 'rogue' },
};

/* ────────── Defeat — Cinematic Knee-Buckle ────────── */

export const defeatHero: Timeline = {
  id: 'defeat.hero',
  duration: 1.95,
  interruptibleAfter: 1.0, // can't interrupt — death is final
  tracks: [
    // Time crawl: 1.0 → 0.55 → 0.20 → 1.0
    track('timeScale', [
      k(0.00, 1.0),
      k(0.15, 0.55, 'cubicOut'),
      k(0.55, 0.55, 'hold'),
      k(0.95, 0.20, 'cubicInOut'),
      k(1.65, 0.20, 'hold'),
      k(1.95, 1.0, 'cubicOut'),
    ]),
    // Camera tilt + slow orbital
    track('camera.ly', [
      k(0.00, CAM_BASE.ly),
      k(0.20, 1.7, 'cubicOut'),     // raise look-at for tilt
    ]),
    track('camera.fov', [
      k(0.00, CAM_BASE.fov),
      k(0.20, 52, 'cubicInOut'),
      k(1.20, 38, 'cubicInOut'),    // long push-in on the fallen head
      k(1.95, 56, 'cubicInOut'),    // wide pull-out at the end
    ]),
    track('camera.x', [
      k(0.00, 0),
      k(0.20, -1.2, 'cubicInOut'),  // orbit around the loser (hero on -2.2)
      k(0.60, -1.6, 'cubicInOut'),
      k(1.95, 0, 'cubicInOut'),
    ]),
    track('camera.z', [
      k(0.00, CAM_BASE.z),
      k(0.60, 5.0, 'cubicInOut'),
      k(1.20, 4.6, 'cubicInOut'),
      k(1.95, CAM_BASE.z, 'cubicInOut'),
    ]),
    // Procedural knee buckle for the falling side (attacker = the loser
    // here — defeat() flips the role so the choreographer sees 'attacker'
    // = side being defeated).
    track('bone.attacker.torsoPitch', [
      k(0.00, 0),
      k(0.40, 0.6, 'cubicInOut'),
    ]),
    track('root.attacker.y', [
      k(0.00, 0),
      k(0.40, -0.18, 'cubicOut'),
    ]),
    track('root.attacker.x', [
      k(0.00, 0),
      k(0.40, 0.25, 'cubicInOut'),  // sway sideways
    ]),
    // Vignette swells and holds — the audience knows it's over even
    // before the rig finishes folding.
    track('post.vignette', [
      k(0.00, 0),
      k(0.20, 0.0, 'hold'),
      k(0.60, 0.8, 'cubicInOut'),
      k(1.65, 0.95, 'cubicInOut'),
      k(1.95, 0.5, 'cubicInOut'),
    ]),
    // Desaturate during the hold beat — colours drain as the fight ends.
    track('post.desaturation', [
      k(0.00, 0),
      k(0.55, 0.0, 'hold'),
      k(1.20, 0.45, 'cubicInOut'),
      k(1.65, 0.45, 'hold'),
      k(1.95, 0, 'cubicOut'),
    ]),
  ],
  cues: [
    cue(0.05, 'rig.crossfade', { side: 'attacker', action: 'death', dur: 0.25 }),
    // Dust kick from the buckling knee
    cue(0.35, 'vfx.dustKick',  { intensity: 1.4 }),
    cue(0.30, 'audio',         { name: 'defeat.collapse' }),
    cue(0.40, 'vfx.burst',     { y: 0.4, count: 35, color: 0x6a6056 }),
    cue(1.20, 'audio',         { name: 'defeat.hold' }),
  ],
  meta: { tier: 'basic', class: 'defeat' },
};

export const defeatFoe = mirror(defeatHero);

/* ────────── Picker ────────── */

const BASIC_BY_CLASS: Record<string, Timeline> = {
  warrior: warriorBasic,
  ranger: rangerBasic,
  mage: mageBasic,
  rogue: rogueBasic,
};

/** Pick the timeline for `(cls, side, effect)`. `effect` falls back to class. */
export function pickAttackTimeline(cls: string, side: 'hero' | 'foe', effect?: string): Timeline {
  // `effect` (slash/magic/arrow/pierce) overrides class when the caller
  // wants a thematic swap (e.g. warrior using a magic scroll). Map back
  // to class buckets.
  const effectClass =
    effect === 'magic'  ? 'mage'  :
    effect === 'arrow'  ? 'ranger':
    effect === 'pierce' ? 'rogue' :
    effect === 'slash'  ? 'warrior': cls;
  const base = BASIC_BY_CLASS[effectClass] || BASIC_BY_CLASS.warrior;
  return side === 'hero' ? base : mirror(base);
}

export function pickDefeatTimeline(side: 'hero' | 'foe'): Timeline {
  // The defeat() caller names the side that LOSES; the timeline frames
  // that side as the "attacker" so all tracks read in one direction.
  return side === 'hero' ? defeatHero : defeatFoe;
}

/**
 * Crit overlay — given a basic timeline, return a copy with the crit
 * modifiers folded in: dolly-zoom, sigil flash, beefier hit-stop, bloom
 * kick on impact and a brief RGB-shift sting. This keeps per-tier
 * authoring small while still feeling 3× heavier than basic.
 */
export function applyCritModifier(t: Timeline): Timeline {
  // Locate the first onImpact cue — the choreographer treats it as the
  // canonical impact frame and we hang the dolly-zoom + sigil off it.
  const impactCue = t.cues.find((c) => c.type === 'callback.onImpact');
  const impactT = impactCue?.t ?? Math.min(0.35, t.duration * 0.4);
  const glyph =
    t.meta?.class === 'mage' ? '裂' :
    t.meta?.class === 'ranger' ? '貫' :
    t.meta?.class === 'rogue' ? '影' : '斬';
  const sigilColor =
    t.meta?.class === 'mage' ? 0xc294ff :
    t.meta?.class === 'ranger' ? 0x9ad9ff :
    t.meta?.class === 'rogue' ? 0xe85a4f : 0xfff1c4;
  // Crit overrides for the three channels we always want to dominate
  // (dolly-zoom + slow-mo). Build them once, then REPLACE the base
  // track for each channel rather than appending a duplicate. The
  // executor would otherwise sample both and let the last one win,
  // silently amputating the base attack's camera motion.
  const overrideTracks = [
    track('camera.fov', [
      k(0.00, CAM_BASE.fov),
      k(impactT - 0.12, 58, 'expoOut'),
      k(impactT + 0.18, 50, 'cubicInOut'),
      k(t.duration, CAM_BASE.fov, 'cubicInOut'),
    ]),
    track('camera.z', [
      k(0.00, CAM_BASE.z),
      k(impactT - 0.12, 4.6, 'cubicOut'),
      k(impactT + 0.25, 5.4, 'cubicInOut'),
      k(t.duration, CAM_BASE.z, 'cubicInOut'),
    ]),
    track('timeScale', [
      k(0.00, 1.0),
      k(impactT + 0.15, 1.0, 'hold'),
      k(impactT + 0.16, 0.35, 'cubicOut'),
      k(impactT + 0.45, 0.35, 'hold'),
      k(impactT + 0.85, 1.0, 'cubicOut'),
    ]),
  ];
  const overridden = new Set(overrideTracks.map((o) => o.channel));
  return {
    ...t,
    id: t.id + '.crit',
    duration: t.duration + 0.30, // longer recovery for the slow-mo
    tracks: [
      ...t.tracks.filter((tr) => !overridden.has(tr.channel)),
      ...overrideTracks,
      // Cinematic slow-mo grade: desaturate the picture while time
      // crawls, snap back when the world resumes. Authored against the
      // same impact frame as the timeScale curve so the two move
      // together — bright impact → desaturated breath → recovery.
      track('post.desaturation', [
        k(0.00, 0),
        k(impactT + 0.16, 0, 'hold'),
        k(impactT + 0.20, 0.55, 'cubicOut'),
        k(impactT + 0.45, 0.55, 'hold'),
        k(impactT + 0.80, 0, 'cubicOut'),
      ]),
      // Vignette pulses up briefly to focus attention on the impact.
      track('post.vignette', [
        k(0.00, 0),
        k(impactT - 0.05, 0, 'hold'),
        k(impactT + 0.05, 0.7, 'cubicOut'),
        k(impactT + 0.45, 0.7, 'hold'),
        k(impactT + 0.95, 0, 'cubicInOut'),
      ]),
    ],
    cues: [
      ...t.cues,
      cue(Math.max(0, impactT - 0.10), 'vfx.sigilFlash', { glyph, color: sigilColor }),
      cue(Math.max(0, impactT - 0.10), 'audio',           { name: 'crit.chime' }),
      cue(impactT, 'hitstop',  { dur: 0.12 }),
      cue(impactT, 'shake',    { amount: 0.55, dur: 0.25 }),
      cue(impactT, 'vfx.groundCrack', { useTarget: true, color: sigilColor }),
      // God-ray bounce + lens flare at the impact point — sells the
      // "fluorescent burst" of a crit landing.
      cue(impactT, 'vfx.godRay',   { useTarget: true, color: sigilColor, height: 4.5 }),
      cue(impactT + 0.04, 'vfx.lensFlare', { color: sigilColor, intensity: 0.7, life: 0.55 }),
      // RGB shift sting
      cue(impactT,        'audio', { name: 'impact.metal', rgbShift: 0.005 }),
      cue(impactT + 0.18, 'audio', { name: 'noop',         rgbShift: 0.0008 }),
    ],
    meta: { ...t.meta, tier: 'crit' },
  };
}
