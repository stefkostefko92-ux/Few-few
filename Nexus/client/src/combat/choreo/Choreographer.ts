/**
 * Combat Choreographer — timeline executor.
 *
 * Replaces the old `animRef.kind` state-machine. Every cinematic battle
 * beat is a Timeline; the choreographer samples its tracks each tick and
 * fires its cues at their scheduled local time. The result is an animation
 * system you author as DATA, not as a chain of `if (kind === 'windup-hero')`.
 *
 * Multiple timelines can be queued; only one plays at a time. Interrupts
 * are only honoured during the current timeline's recovery window
 * (`interruptibleAfter`) so impact frames are never amputated by a follow-
 * up attack.
 */

import * as THREE from 'three';
import type { Timeline, Cue, NumericChannel, Track } from './Timeline';
import { ease, lerp } from './EaseLib';
import type { VfxBus } from './VfxBus';

export interface ChoreoCtx {
  attacker: 'hero' | 'foe';
  damageRatio: number;
  crit: boolean;
  onImpact?: () => void;
  onCue?: (name: string, t: number) => void;
}

export interface RigRefs {
  hero: THREE.Object3D | null;
  foe: THREE.Object3D | null;
  heroMixer: THREE.AnimationMixer | null;
  foeMixer: THREE.AnimationMixer | null;
}

interface PlayingTimeline {
  timeline: Timeline;
  ctx: ChoreoCtx;
  t: number;                // local time in seconds
  firedCues: Set<number>;   // indices of cues already fired
  // Per-channel "initial" values captured at play start so a track that
  // starts at a non-zero key still blends from "before" cleanly. We don't
  // really need this for the current channel set but the slot is here so
  // it stays simple to add later.
}

export class Choreographer {
  private rigs: RigRefs;
  private vfx: VfxBus;
  /** External-world hooks the choreographer mutates. The CombatScene3D
   *  effect owns these refs; we read and write them through the bus. */
  private current: PlayingTimeline | null = null;
  /** Up to one queued follow-up — drained when current finishes. */
  private queued: { timeline: Timeline; ctx: ChoreoCtx } | null = null;

  /** Cached bone refs for procedural body-language fallback when a rig
   *  has no attack clip. Looked up at first use, then memoised. */
  private boneCache = new Map<THREE.Object3D, { torso: THREE.Bone | null; arm: THREE.Bone | null }>();

  constructor(rigs: RigRefs, vfx: VfxBus) {
    this.rigs = rigs;
    this.vfx = vfx;
  }

  isPlaying(): boolean { return this.current !== null; }

  /** Begin a timeline. If one is already running, queue this for after
   *  the recovery window — but only ONE deep. If a third attack arrives
   *  while one is queued, drop the OLDEST queued (latest wins) and warn
   *  in dev so UI flow that was waiting on its onImpact knows the cue
   *  was abandoned. */
  play(timeline: Timeline, ctx: ChoreoCtx): void {
    if (!this.current) {
      this.current = { timeline, ctx, t: 0, firedCues: new Set() };
      return;
    }
    const cur = this.current;
    const interruptBound = cur.timeline.duration * cur.timeline.interruptibleAfter;
    if (cur.t >= interruptBound) {
      this.current = { timeline, ctx, t: 0, firedCues: new Set() };
      return;
    }
    if (this.queued) {
      // Abandoned attack — flush its onImpact so the UI doesn't wait
      // forever for a callback that will never come.
      try { this.queued.ctx.onImpact?.(); } catch { /* UI side */ }
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Choreographer] dropped queued timeline:', this.queued.timeline.id);
      }
    }
    this.queued = { timeline, ctx };
  }

  /** Force-stop and clear everything (e.g. on scene unmount).
   *  Flushes the onImpact callbacks for any unfired callback.onImpact
   *  cues on the current AND queued timeline so callers waiting on the
   *  UI sync don't deadlock. */
  stop(): void {
    if (this.current) {
      const cur = this.current;
      for (let i = 0; i < cur.timeline.cues.length; i++) {
        if (cur.firedCues.has(i)) continue;
        if (cur.timeline.cues[i].type === 'callback.onImpact') {
          try { cur.ctx.onImpact?.(); } catch { /* UI side */ }
          break; // onImpact is one-shot per timeline by convention
        }
      }
    }
    if (this.queued) {
      try { this.queued.ctx.onImpact?.(); } catch { /* UI side */ }
    }
    this.current = null;
    this.queued = null;
  }

  /** Per-frame tick. `dt` is the raw delta — the choreographer does not
   *  apply timeScale; the scene's tick loop already does. */
  update(dt: number): void {
    const cur = this.current;
    if (!cur) return;
    cur.t += dt;

    this.applyTracks(cur.timeline.tracks, cur.t);

    // Fire every unfired cue whose scheduled t has passed. The previous
    // (prevT, cur.t] window check would silently drop a cue if the first
    // tick after play() jumped past it (tab switch, GC pause); the
    // !firedCues.has(i) guard already prevents duplicates, so we only
    // need the upper bound. Cues fire in array order — author timelines
    // with cues sorted by t for deterministic ordering.
    for (let i = 0; i < cur.timeline.cues.length; i++) {
      if (cur.firedCues.has(i)) continue;
      const c = cur.timeline.cues[i];
      if (c.t <= cur.t) {
        cur.firedCues.add(i);
        this.fireCue(c, cur.ctx);
      }
    }

    if (cur.t >= cur.timeline.duration) {
      this.current = null;
      if (this.queued) {
        const q = this.queued; this.queued = null;
        this.play(q.timeline, q.ctx);
      }
    }
  }

  /* ─────────── Track sampling ─────────── */

  private applyTracks(tracks: Track[], t: number): void {
    for (const tr of tracks) {
      const v = sampleTrack(tr, t);
      this.writeChannel(tr.channel, v);
    }
  }

  private writeChannel(channel: NumericChannel, v: number): void {
    const anchor = this.vfx.cameraAnchor();
    switch (channel) {
      case 'camera.x': anchor.x = v; break;
      case 'camera.y': anchor.y = v; break;
      case 'camera.z': anchor.z = v; break;
      case 'camera.lx': anchor.lx = v; break;
      case 'camera.ly': anchor.ly = v; break;
      case 'camera.lz': anchor.lz = v; break;
      case 'camera.fov': anchor.fov = v; break;
      case 'root.attacker.x': this.setRootDelta('attacker', 'x', v); break;
      case 'root.attacker.y': this.setRootDelta('attacker', 'y', v); break;
      case 'root.attacker.z': this.setRootDelta('attacker', 'z', v); break;
      case 'root.target.x':   this.setRootDelta('target',   'x', v); break;
      case 'root.target.y':   this.setRootDelta('target',   'y', v); break;
      case 'root.target.z':   this.setRootDelta('target',   'z', v); break;
      case 'bone.attacker.torsoYaw': this.setBone('attacker', 'torsoYaw', v); break;
      case 'bone.attacker.torsoPitch': this.setBone('attacker', 'torsoPitch', v); break;
      case 'bone.attacker.armPitch': this.setBone('attacker', 'armPitch', v); break;
      // post.* + light.* + timeScale are cue-driven, not track-driven.
    }
  }

  private setRootDelta(role: 'attacker' | 'target', axis: 'x' | 'y' | 'z', delta: number): void {
    const cur = this.current;
    if (!cur) return;
    const side = role === 'attacker' ? cur.ctx.attacker : (cur.ctx.attacker === 'hero' ? 'foe' : 'hero');
    const rig = side === 'hero' ? this.rigs.hero : this.rigs.foe;
    if (!rig) return;
    const baseX = side === 'hero' ? -2.2 : 2.2;
    if (axis === 'x') rig.position.x = baseX + delta;
    else if (axis === 'y') rig.position.y = delta; // y=0 is the ground anchor
    else rig.position.z = delta;
  }

  private setBone(role: 'attacker' | 'target', kind: 'torsoYaw' | 'torsoPitch' | 'armPitch', v: number): void {
    const cur = this.current;
    if (!cur) return;
    const side = role === 'attacker' ? cur.ctx.attacker : (cur.ctx.attacker === 'hero' ? 'foe' : 'hero');
    const rig = side === 'hero' ? this.rigs.hero : this.rigs.foe;
    if (!rig) return;
    let cached = this.boneCache.get(rig);
    if (!cached) {
      // Procedural body-language fallback — find a bone resembling a torso
      // and an arm by walking the skeleton for common naming conventions.
      let torso: THREE.Bone | null = null;
      let arm: THREE.Bone | null = null;
      rig.traverse((o) => {
        if (!(o as THREE.Bone).isBone) return;
        const n = (o.name || '').toLowerCase();
        if (!torso && /spine2|spine_02|chest|upper_?spine/.test(n)) torso = o as THREE.Bone;
        if (!torso && /spine|torso/.test(n)) torso = o as THREE.Bone;
        if (!arm && /(right|r)_?upper_?arm|shoulder_r|arm_r/.test(n)) arm = o as THREE.Bone;
      });
      cached = { torso, arm };
      this.boneCache.set(rig, cached);
    }
    if (kind === 'torsoYaw' && cached.torso) cached.torso.rotation.y = v;
    if (kind === 'torsoPitch' && cached.torso) cached.torso.rotation.x = v;
    if (kind === 'armPitch' && cached.arm) cached.arm.rotation.x = v;
  }

  /* ─────────── Cue dispatch ─────────── */

  private fireCue(c: Cue, ctx: ChoreoCtx): void {
    const targetSide = ctx.attacker === 'hero' ? 'foe' : 'hero';
    const attackerPos = this.vfx.fighterPos(ctx.attacker);
    const targetPos = this.vfx.fighterPos(targetSide);
    const payload = c.payload || {};
    // payload.side in a timeline is a ROLE name ('attacker' | 'target'),
    // not a concrete 'hero' | 'foe'. Resolve it through the current
    // ctx.attacker so the same authored timeline drives both sides.
    const sideFromPayload = (raw: any): 'hero' | 'foe' => {
      if (raw === 'attacker') return ctx.attacker;
      if (raw === 'target') return targetSide;
      if (raw === 'hero' || raw === 'foe') return raw;
      return ctx.attacker;
    };
    switch (c.type) {
      case 'vfx.shockwave': {
        const x = payload.useTarget ? targetPos.x : (payload.x ?? targetPos.x);
        const z = payload.z ?? 0;
        this.vfx.shockwave(x, z, payload.color ?? 0xffd34d);
        break;
      }
      case 'vfx.slashArc': {
        const fromX = payload.fromX ?? attackerPos.x;
        const toX = payload.toX ?? targetPos.x;
        this.vfx.slashArc(fromX, 0, toX, 0, payload.color ?? 0xffd34d);
        break;
      }
      case 'vfx.magicCircle': {
        const x = payload.useTarget ? targetPos.x : (payload.x ?? targetPos.x);
        this.vfx.magicCircle(x, payload.z ?? 0, payload.color ?? 0xc294ff);
        break;
      }
      case 'vfx.arrow': {
        this.vfx.arrow(attackerPos.x, 0, targetPos.x, 0, payload.color ?? 0x9ad9ff);
        break;
      }
      case 'vfx.afterImage':
        this.vfx.afterImage(sideFromPayload(payload.side ?? 'attacker'), payload.tint ?? 0xffffff);
        break;
      case 'vfx.burst':
        this.vfx.burst(payload.useTarget ? targetPos.x : attackerPos.x,
          payload.y ?? 1.4, 0,
          payload.count ?? 40, payload.color ?? 0xffd34d);
        break;
      case 'vfx.sigilFlash':
        this.vfx.sigilFlash(payload.glyph ?? '斬', payload.color ?? 0xfff1c4);
        break;
      case 'vfx.groundCrack':
        this.vfx.groundCrack(payload.useTarget ? targetPos.x : attackerPos.x,
          payload.z ?? 0, payload.color ?? 0xff8040);
        break;
      case 'shake':
        this.vfx.shake(payload.amount ?? 0.3, payload.dur ?? 0.18);
        break;
      case 'hitstop':
        this.vfx.hitstop(payload.dur ?? 0.08);
        break;
      case 'rig.crossfade':
        this.rigCrossfade(sideFromPayload(payload.side ?? 'attacker'), payload.action ?? 'idle', payload.dur ?? 0.12);
        break;
      case 'callback.onImpact':
        try { ctx.onImpact?.(); } catch { /* swallow — UI side */ }
        break;
      case 'audio':
        try { ctx.onCue?.(payload.name ?? 'unknown', this.current?.t ?? 0); } catch { /* SFX optional */ }
        break;
    }
    // Bloom kick + RGB shift are convenience flags piggybacking on payload —
    // any cue can request them so per-class signatures stay terse.
    if (payload.bloomKick) this.vfx.bloomKick(payload.bloomKick.delta ?? 0.4, payload.bloomKick.recover ?? 0.3);
    if (typeof payload.rgbShift === 'number') this.vfx.setRgbShift(payload.rgbShift);
  }

  private rigCrossfade(side: 'hero' | 'foe', name: string, dur: number): void {
    const rig = side === 'hero' ? this.rigs.hero : this.rigs.foe;
    if (!rig) return;
    const actions = (rig as any).userData?.combatActions as Record<string, THREE.AnimationAction> | undefined;
    const current = (rig as any).userData?.combatCurrent as THREE.AnimationAction | undefined;
    if (!actions || !actions[name]) return;
    const next = actions[name];
    if (current === next) return;
    next.reset().setEffectiveWeight(1);
    if (name === 'death') {
      next.clampWhenFinished = true;
      next.loop = THREE.LoopOnce;
    }
    if (current) current.fadeOut(dur);
    next.fadeIn(dur).play();
    (rig as any).userData.combatCurrent = next;
  }
}

/* ─────────── Track sampling ─────────── */

function sampleTrack(tr: Track, t: number): number {
  const keys = tr.keys;
  if (keys.length === 0) return 0;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1], k1 = keys[i];
    if (t <= k1.t) {
      const span = k1.t - k0.t;
      if (span <= 0) return k1.v;
      const u = (t - k0.t) / span;
      return lerp(k0.v, k1.v, ease(u, k1.ease));
    }
  }
  return keys[keys.length - 1].v;
}
