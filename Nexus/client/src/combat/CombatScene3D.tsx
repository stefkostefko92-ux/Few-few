import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
// Own the floating-HUD styles here so the health bars render correctly
// wherever the 3D scene is mounted — including the standalone /demo/combat
// harness, which doesn't pull in the CombatScene orchestrator's CSS.
import '../styles/combat.css';
// Photoreal pipeline — renderer + post + IBL + PBR helpers + lil-gui panel.
// Heavy passes (GTAO/SSR/TAA) and the GUI live here behind dynamic boundaries
// so the lite path doesn't pay for them.
import {
  createCombatBackend,
  configureShadows,
  buildPbrGround,
  DEFAULT_TUNEABLES,
  type RenderBackend,
} from './CombatHD';
import { mountHDPanel } from './CombatHDPanel';
import { buildRegionEnvironment, getRegionEmberSpec, type RegionEnvironment } from './CombatEnvironment';
import { ensurePropsLoaded } from './CombatProps3D';
import { fitToHeight } from './CombatToon';
import { Choreographer } from './choreo/Choreographer';
import type { VfxBus } from './choreo/VfxBus';
import { pickAttackTimeline, pickDefeatTimeline, applyCritModifier } from './choreo/timelines';

/**
 * Cinematic 3D battle stage (Three.js + post-processing).
 *
 *  RENDER STACK
 *   RenderPass → UnrealBloomPass (HDR-style glow) → RGBShiftPass
 *               (chromatic aberration) → VignettePass → OutputPass
 *   Tone-mapped via ACESFilmic, sRGB output. Real bloom on additive
 *   particles + emissive sprites gives the picture the look of a
 *   colour-graded shot, not flat WebGL.
 *
 *  CINEMATIC DIRECTOR
 *   - Intro: 1.4s orbital sweep around the duel before the first round.
 *   - Per round: pan-in on attacker, lunge, impact flash, recoil dolly.
 *   - On crit: Hitchcock dolly-zoom (FOV widens while camera pushes in),
 *     hit-stop (~80ms frozen frame), then 250ms slow-mo at 0.35× before
 *     ramping back to 1×.
 *   - Per round: subtle hand-held shake on idle, hard shake on impact,
 *     red rim-light flash and bloom kick on heavy hits.
 *
 *  SIGNATURE VFX (procedural — no external assets required)
 *   - Slash:  ground shockwave RING (expanding torus) + arc sword-trail.
 *   - Magic:  rotating 3D magic circle decal under the target + vertical
 *             beam column, target lifts and glows.
 *   - Arrow:  glowing projectile streak with motion-trail tube.
 *   - Pierce: attacker after-image (sprite clone), white sting flash.
 *
 *  BLENDER / GLTF PIPELINE
 *   This component will hot-swap procedural sprites for proper Blender-
 *   authored rigs whenever a matching .glb is dropped in:
 *     public/assets/characters/{warrior,ranger,mage,rogue}.glb
 *   Export specs (rigify or auto-rigged):
 *     • Y-up, +Z forward, scale 1.0, character ~1.8m tall, origin at feet
 *     • Animation clip names (required): "idle", "attack", "hit", "dodge",
 *       "defeat" (and optionally "magic", "shoot", "stab" for class fx)
 *     • Max 60 bones, ≤ 8k tris, single PBR material with packed AO/Rough/Metal
 *     • Export as glTF 2.0 separate or .glb (binary), no draco needed
 *   When a glb is missing the procedural sprite remains the live fighter,
 *   so the game keeps shipping without external art dependencies.
 */

const SPRITE_W = 256;
const SPRITE_H = 320;

export interface CombatScene3DHandle {
  attack: (opts: { attacker: 'hero' | 'foe'; effect?: string; crit?: boolean; damageRatio?: number; missed?: boolean; dodged?: boolean; onImpact?: () => void; }) => void;
  defeat: (side: 'hero' | 'foe') => void;
  resetCamera: () => void;
}

/** Live HUD payload for the floating health bar above a fighter's head. */
export interface FighterHud {
  name: string;
  level: number;
  /** Current HP as a 0..100 percentage. */
  hpPct: number;
  /** Trailing "ghost" HP (the white lost-chunk that lags behind). 0..100. */
  ghostPct: number;
  hp: number;
  hpMax: number;
}

/** A floating damage number anchored over the struck fighter. */
export interface DamagePop {
  id: number;
  side: 'hero' | 'foe';
  text: string;
  kind: 'normal' | 'big' | 'crit' | 'miss' | 'dodge' | 'block';
}

interface Props {
  heroClass: string;
  foeClass: string;
  region?: string;
  /** When provided, the 3D scene renders floating health bars above each
   *  fighter's head, projected from their world position every frame and
   *  driven by these live values (real-time as the fight resolves). */
  heroHud?: FighterHud;
  foeHud?: FighterHud;
  /** Floating damage numbers anchored over the struck fighter. */
  pops?: DamagePop[];
}

/* ------------------------------------------------------------------ */
/* Procedural sprite stamp — class silhouette baked to a canvas texture. */
/* ------------------------------------------------------------------ */
function classSpriteTexture(cls: string, tint: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = SPRITE_W; c.height = SPRITE_H;
  const ctx = c.getContext('2d')!;

  // Anime hero silhouette — dark body shape with cel-shaded accent gradient.
  // The body fills most of the brightness budget; tint is reserved for the
  // weapon and small rim accents so post-process bloom doesn't blow it out.
  const cx = SPRITE_W / 2;
  const grad = ctx.createLinearGradient(0, SPRITE_H * 0.2, 0, SPRITE_H);
  grad.addColorStop(0,    '#1c1f2a');
  grad.addColorStop(0.55, '#171922');
  grad.addColorStop(1,    '#0c0d12');

  // Cape / cloak (broader at the bottom for a heroic silhouette)
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - 50, SPRITE_H * 0.40);
  ctx.quadraticCurveTo(SPRITE_W * 0.05, SPRITE_H * 0.90, cx - 90, SPRITE_H * 0.99);
  ctx.lineTo(cx + 90, SPRITE_H * 0.99);
  ctx.quadraticCurveTo(SPRITE_W * 0.95, SPRITE_H * 0.90, cx + 50, SPRITE_H * 0.40);
  ctx.closePath(); ctx.fill();

  // Torso (slimmer silhouette over the cape)
  ctx.fillStyle = '#22242d';
  ctx.beginPath();
  ctx.ellipse(cx, SPRITE_H * 0.60, 54, 80, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulder pauldrons — a couple of small dark trapezoids
  ctx.fillStyle = '#15171f';
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + sign * 36, SPRITE_H * 0.46);
    ctx.lineTo(cx + sign * 62, SPRITE_H * 0.52);
    ctx.lineTo(cx + sign * 58, SPRITE_H * 0.60);
    ctx.lineTo(cx + sign * 34, SPRITE_H * 0.58);
    ctx.closePath(); ctx.fill();
  }

  // Cinched belt — a tint-colored band, the only saturated detail on the body
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(cx - 50, SPRITE_H * 0.72, 100, 6);
  ctx.globalAlpha = 1;

  // Head — soft circle with subtle highlight
  ctx.fillStyle = '#171924';
  ctx.beginPath(); ctx.arc(cx, SPRITE_H * 0.30, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.beginPath(); ctx.arc(cx - 8, SPRITE_H * 0.27, 14, 0, Math.PI * 2); ctx.fill();
  // Hood / hair fringe drape
  ctx.fillStyle = '#0d0e16';
  ctx.beginPath();
  ctx.moveTo(cx - 30, SPRITE_H * 0.30);
  ctx.quadraticCurveTo(cx, SPRITE_H * 0.16, cx + 30, SPRITE_H * 0.30);
  ctx.quadraticCurveTo(cx + 26, SPRITE_H * 0.24, cx - 26, SPRITE_H * 0.24);
  ctx.closePath(); ctx.fill();
  // Eye glow accent (small slit, low alpha so bloom only nibbles it)
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(cx - 10, SPRITE_H * 0.31, 6, 2);
  ctx.fillRect(cx + 4,  SPRITE_H * 0.31, 6, 2);
  ctx.globalAlpha = 1;

  // Class-specific weapon held to the side — dark silhouette with a small
  // tint highlight so it reads but does not blow out under bloom.
  ctx.fillStyle = '#2a2d36';
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  if (cls === 'warrior') {
    // Sword
    ctx.fillRect(SPRITE_W * 0.82, SPRITE_H * 0.32, 8, SPRITE_H * 0.50);
    // Crossguard
    ctx.fillRect(SPRITE_W * 0.74, SPRITE_H * 0.82, 24, 5);
    // Subtle blade edge highlight
    ctx.strokeRect(SPRITE_W * 0.82, SPRITE_H * 0.32, 8, SPRITE_H * 0.50);
    // Pommel
    ctx.beginPath(); ctx.arc(SPRITE_W * 0.86, SPRITE_H * 0.30, 5, 0, Math.PI * 2); ctx.fill();
  } else if (cls === 'ranger') {
    // Bow curve as a thin dark line with a tint accent string
    ctx.strokeStyle = '#2a2d36'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(SPRITE_W * 0.82, SPRITE_H * 0.55, 60, -Math.PI / 2.4, Math.PI / 2.4); ctx.stroke();
    ctx.strokeStyle = tint; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(SPRITE_W * 0.82 + 60 * Math.cos(-Math.PI / 2.4), SPRITE_H * 0.55 + 60 * Math.sin(-Math.PI / 2.4));
    ctx.lineTo(SPRITE_W * 0.82 + 60 * Math.cos(Math.PI / 2.4),  SPRITE_H * 0.55 + 60 * Math.sin(Math.PI / 2.4));
    ctx.stroke();
  } else if (cls === 'mage') {
    // Staff with a glowing orb
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(SPRITE_W * 0.84, SPRITE_H * 0.30, 6, SPRITE_H * 0.55);
    // Orb (subtle — let it bloom a touch as it's tiny)
    const og = ctx.createRadialGradient(SPRITE_W * 0.87, SPRITE_H * 0.28, 0, SPRITE_W * 0.87, SPRITE_H * 0.28, 16);
    og.addColorStop(0, tint);
    og.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(SPRITE_W * 0.87, SPRITE_H * 0.28, 16, 0, Math.PI * 2); ctx.fill();
  } else {
    // Rogue twin daggers
    ctx.fillStyle = '#2a2d36';
    for (const x of [SPRITE_W * 0.78, SPRITE_W * 0.88]) {
      ctx.beginPath();
      ctx.moveTo(x, SPRITE_H * 0.55);
      ctx.lineTo(x - 4, SPRITE_H * 0.75);
      ctx.lineTo(x + 4, SPRITE_H * 0.75);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tint; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, SPRITE_H * 0.55);
      ctx.lineTo(x, SPRITE_H * 0.72);
      ctx.stroke();
    }
  }

  // Very soft outer rim — kept ≤ alpha 0.18 so bloom never grabs it.
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(${parseInt(tint.slice(1,3),16)},${parseInt(tint.slice(3,5),16)},${parseInt(tint.slice(5,7),16)},.18)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, SPRITE_H * 0.60, 56, 84, 0, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/* Rotating magic circle decal stamped to a canvas. */
function magicCircleTexture(tint: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.translate(256, 256);
  ctx.strokeStyle = tint; ctx.fillStyle = tint;
  ctx.shadowColor = tint; ctx.shadowBlur = 30;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 230, 0, Math.PI*2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 200, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 140, 0, Math.PI*2); ctx.stroke();
  // Pentagram-ish star
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI/2 + i * (Math.PI*4/5);
    const x = Math.cos(a)*170, y = Math.sin(a)*170;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  // Glyph ticks around outer ring
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x1 = Math.cos(a)*200, y1 = Math.sin(a)*200;
    const x2 = Math.cos(a)*230, y2 = Math.sin(a)*230;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

const REGION_PALETTE: Record<string, { sky: number; fog: number; ground: number; ambient: number; }> = {
  // Act 1 (lv 1-25)
  whispering_woods: { sky: 0x2c4a2d, fog: 0x1e2a1f, ground: 0x1c2818, ambient: 0x4a7a3d },
  mistmoor_hills:   { sky: 0x4a5567, fog: 0x2e3540, ground: 0x2c2f37, ambient: 0x6f7a8c },
  crystal_caverns:  { sky: 0x213057, fog: 0x102045, ground: 0x172240, ambient: 0x6aa7ff },
  ashen_wastes:     { sky: 0x4a261a, fog: 0x2a0e07, ground: 0x2c1813, ambient: 0xff7c4d },
  shadowfell:       { sky: 0x2a173d, fog: 0x140820, ground: 0x1c0e26, ambient: 0xc294ff },
  // Mid-tier (lv 26-200)
  emberreach:       { sky: 0x5a1f10, fog: 0x2a0a04, ground: 0x3a1a0c, ambient: 0xff5a2c },
  hammerhand_pass:  { sky: 0x3a302a, fog: 0x1a1410, ground: 0x2a1f18, ambient: 0xc89060 },
  conclave_aedric:  { sky: 0x3a2050, fog: 0x180a28, ground: 0x251638, ambient: 0xc294ff },
  saltmarsh:        { sky: 0x2a3a3a, fog: 0x121a1f, ground: 0x1c2620, ambient: 0x6ad8a4 },
  frostvale:        { sky: 0x405a78, fog: 0x1a2838, ground: 0xb8c8d8, ambient: 0xe0f0ff },
  black_spire:      { sky: 0x2a0808, fog: 0x100404, ground: 0x1a0a0a, ambient: 0xff3a2a },
  // Divine endgame (lv 201-350)
  stormpeaks:       { sky: 0x303848, fog: 0x141822, ground: 0x2a303a, ambient: 0xa0c8ff },
  voidshade_hollow: { sky: 0x180828, fog: 0x080414, ground: 0x140828, ambient: 0xa074ff },
  mooncradle:       { sky: 0x303860, fog: 0x141828, ground: 0xb8b8c8, ambient: 0xd4dfff },
  worldspine:       { sky: 0x352a20, fog: 0x14100a, ground: 0xa0958a, ambient: 0xffe4b0 },
  eternal_throne:   { sky: 0x080814, fog: 0x040408, ground: 0x14101a, ambient: 0xffd060 },
};

const CLASS_TINT: Record<string, string> = {
  warrior: '#ffd34d',
  ranger:  '#6ad8a4',
  mage:    '#c294ff',
  rogue:   '#e85a4f',
};

const CombatScene3D = React.forwardRef<CombatScene3DHandle, Props>(({ heroClass, foeClass, region = 'whispering_woods', heroHud, foeHud, pops }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  // DOM overlay anchors for the floating HUD. Positioned imperatively each
  // frame inside the rAF tick by projecting the rig head world position to
  // screen space — see `projectHud()` in the loop.
  const heroBarRef = useRef<HTMLDivElement>(null);
  const foeBarRef = useRef<HTMLDivElement>(null);
  const popLayerRef = useRef<HTMLDivElement>(null);
  // Latest HUD props mirrored into a ref so the rAF tick (which closes over
  // the first render's props) always reads current values without
  // re-running the heavy scene-setup effect.
  const hudRef = useRef<{ hero?: FighterHud; foe?: FighterHud }>({});
  hudRef.current = { hero: heroHud, foe: foeHud };
  const vfxRef = useRef<{
    burst: (x: number, y: number, z: number, color: number, count: number, speedScale?: number) => void;
    shockwave: (x: number, z: number, color: number) => void;
    magicCircle: (x: number, z: number, color: number) => void;
    slashArc: (fromX: number, toX: number, color: number) => void;
    arrowStreak: (fromX: number, toX: number, color: number) => void;
    afterImage: (sprite: THREE.Sprite) => void;
  } | null>(null);
  const heroRef = useRef<THREE.Sprite | null>(null);
  const foeRef = useRef<THREE.Sprite | null>(null);
  const heroRigRef = useRef<THREE.Object3D | null>(null);
  const foeRigRef = useRef<THREE.Object3D | null>(null);
  const heroMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const foeMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const heroLightRef = useRef<THREE.PointLight | null>(null);
  const foeLightRef = useRef<THREE.PointLight | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const camAnchorRef = useRef({ x: 0, y: 1.9, z: 6.0, lx: 0, ly: 1.3, lz: 0, fov: 48 });
  const shakeRef = useRef({ amount: 0, t: 0 });
  const timeScaleRef = useRef(1);
  const hitStopRef = useRef(0);
  const introRef = useRef({ t: 0, dur: 1.4, active: true });
  const particlesRef = useRef<{ pts: THREE.Points; positions: Float32Array; velocities: Float32Array; lives: Float32Array; maxLives: Float32Array; colors: Float32Array; sizes: Float32Array; alive: number; } | null>(null);
  const fxGroupRef = useRef<THREE.Group | null>(null);
  // The previous `animRef.kind` state machine has been replaced by the
  // timeline-driven Choreographer in `combat/choreo/`. We still hold a
  // ref to the live instance so `attack()` and `defeat()` from the
  // imperative handle can `.play()` into it, and the rAF tick can call
  // `.update(dt)`.
  const choreoRef = useRef<Choreographer | null>(null);
  const bloomKickRecoverRef = useRef(0.30);
  /** Two-sine handheld micro-shake offset added to the camera anchor on
   *  top of the choreographer's tracks. Keeps every shot subtly alive
   *  even on a still timeline frame. */
  const idleHandheldRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const pal = REGION_PALETTE[region] || REGION_PALETTE.whispering_woods;

    /* ----- lite mode detection (hoisted so the environment dressing
     * and the particle pool size below can share the decision) ----- */
    const liteParticleBudget =
      typeof window !== 'undefined' && (
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        window.innerWidth < 900
      );

    /* ----- scene + camera ----- */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(pal.sky);
    scene.fog = new THREE.Fog(pal.fog, 6, 22);

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 2.4, 8.0);
    camera.lookAt(0, 1.4, 0);
    cameraRef.current = camera;

    /* ----- photoreal backend (WebGPU → WebGL2 → lite) -----
     * createCombatBackend handles renderer selection, IBL via PMREMGenerator
     * over a RoomEnvironment (or HDRI if HDRI_OVERRIDE_URL is set), ACES
     * + sRGB + exposure, PCFSoft 2048² shadows, and the full GTAO + SSR
     * + Bloom + TAA post chain on WebGL2. WebGPU and lite paths get
     * bloom-only (or none) because three's WebGPU post stack is leaner.
     * Both surfaces are referenced via backendRef.current.
     */
    let backend: RenderBackend | null = null;
    let hdPanel: { dispose: () => void } | null = null;
    let cancelled = false;
    const tuneables = { ...DEFAULT_TUNEABLES };

    // Placeholder loading background so the user sees something while
    // WebGPU init resolves (~50-200ms on a fresh page load).
    const loadingBg = document.createElement('div');
    loadingBg.style.cssText = `position:absolute;inset:0;background:
      radial-gradient(ellipse at 50% 70%, ${'#' + (pal.ambient.toString(16).padStart(6,'0'))}33, transparent 60%),
      linear-gradient(180deg, ${'#' + (pal.sky.toString(16).padStart(6,'0'))} 0%, ${'#' + (pal.fog.toString(16).padStart(6,'0'))} 100%)`;
    mount.appendChild(loadingBg);

    // Backend-relative locals — these get assigned after the async create
    // resolves. Most of the existing code below references `renderer` and
    // `composer` directly; we point them at the backend's surfaces so the
    // rest of the file stays unchanged.
    let renderer: THREE.WebGLRenderer | null = null;
    let composer: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer | null = null;
    let bloom: import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass | null = null;
    let rgbShift: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass | null = null;
    let vignettePass: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass | null = null;
    // Desaturation amount the bus sets (slow-mo). The composer doesn't
    // expose a saturation pass directly, so we fake it by tinting the
    // vignette darkness up and modulating the scene's renderer
    // toneMappingExposure subtly. Range 0..1.
    let desaturationAmt = 0;

    /* ----- sky parallax cylinder ----- */
    {
      const skyTex = (() => {
        const c = document.createElement('canvas');
        c.width = 2048; c.height = 512;
        const ctx = c.getContext('2d')!;
        const g = ctx.createLinearGradient(0, 0, 0, c.height);
        g.addColorStop(0, '#' + pal.sky.toString(16).padStart(6, '0'));
        g.addColorStop(1, '#' + pal.fog.toString(16).padStart(6, '0'));
        ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
        for (let layer = 0; layer < 3; layer++) {
          ctx.fillStyle = `rgba(0,0,0,${0.18 + layer * 0.12})`;
          ctx.beginPath();
          ctx.moveTo(0, c.height);
          const baseY = c.height * (0.55 + layer * 0.12);
          for (let x = 0; x <= c.width; x += 30) {
            const y = baseY - Math.abs(Math.sin(x * 0.005 + layer * 1.7)) * (80 - layer * 18) - Math.random() * 12;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(c.width, c.height); ctx.closePath(); ctx.fill();
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        return t;
      })();
      const sky = new THREE.Mesh(
        new THREE.CylinderGeometry(18, 18, 8, 60, 1, true),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
      );
      sky.position.y = 2;
      scene.add(sky);
    }

    /* ----- ground ----- */
    {
      const groundCanvas = document.createElement('canvas');
      groundCanvas.width = 1024; groundCanvas.height = 1024;
      const gctx = groundCanvas.getContext('2d')!;
      gctx.fillStyle = '#' + pal.ground.toString(16).padStart(6, '0');
      gctx.fillRect(0, 0, 1024, 1024);
      gctx.strokeStyle = 'rgba(255,255,255,.05)';
      gctx.lineWidth = 1.5;
      for (let r = 64; r < 1024; r += 64) {
        gctx.beginPath();
        gctx.arc(512, 512, r, 0, Math.PI * 2);
        gctx.stroke();
      }
      // (Removed: the ground texture used to bake two dark radial blobs
      // under the fighter slots as a faux contact shadow. The PBR
      // characters now produce real PCF shadows from the key light,
      // so the baked blobs read as a flat black halo and clash with
      // the lit shadow underneath.)
      const groundTex = new THREE.CanvasTexture(groundCanvas);
      groundTex.colorSpace = THREE.SRGBColorSpace;
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 14),
        new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      ground.userData.kind = 'ground'; // marker so HD backend can swap to PBR
      scene.add(ground);
    }

    /* ----- region environment dressing -----
     * Adds per-region 3D props (trees / rocks / crystals / obelisks /
     * icicles / ash plumes / divine pillars / void fissures…) on a
     * back-arc behind the fighters so they don't occlude the camera.
     * Lite-mode halves the prop count. Per-region recipe also drives
     * the ambient ember tint + spawn rate (fireflies in the woods,
     * snow in Frostvale, dust in Hammerhand, lightning streaks in
     * Stormpeaks, etc.). */
    // Authored CC prop glbs (trees / rocks / crystals / pillars / mushrooms)
    // need a network fetch before we can clone them into the scene. Pre-load
    // happens here; the build runs once the cache is warm. If the user
    // un-mounts while we wait we just bail without adding anything.
    let environment: RegionEnvironment | undefined;
    let envCancelled = false;
    ensurePropsLoaded().then(() => {
      if (envCancelled) return;
      environment = buildRegionEnvironment(region, liteParticleBudget);
      scene.add(environment.group);
    });
    const emberSpec = getRegionEmberSpec(region);

    /* ----- lights ----- (cinematic 3-point + sky/ground hemi)
     * Key sun + cool sky fill + warm back rim. Higher key intensity
     * for crisp PBR highlights on the rigged characters; the back rim
     * carves them off the BG for that "shot on a tripod" silhouette. */
    scene.add(new THREE.HemisphereLight(pal.ambient, pal.ground, 0.60));
    const key = new THREE.DirectionalLight(0xfff1c4, 1.10);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6aa7ff, 0.40);
    fill.position.set(-5, 3, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe7c2, 0.55);
    rim.position.set(0, 4, -7);
    scene.add(rim);

    /* ----- fighters ----- */
    function addFighter(cls: string, side: 'hero' | 'foe'): { sprite: THREE.Sprite; light: THREE.PointLight } {
      const tint = CLASS_TINT[cls] || CLASS_TINT.warrior;
      const tex = classSpriteTexture(cls, tint);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, fog: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.2, 2.75, 1);
      sprite.position.set(side === 'hero' ? -2.2 : 2.2, 1.4, 0);
      // Don't add to the scene by default — the rig load below adds
      // its own mesh, and the sprite was leaving a TAA-history ghost
      // on legacy renderers. If the glb load fails, the error handler
      // adds the sprite back as a 2D fallback so the fighter still
      // shows up.
      sprite.visible = false;
      // distance=8 (was 4) so the rim flash actually reaches the foe
      // — the two fighters are ~4.4 units apart, the old setting cut
      // the light off just short of crossing the field (audit BUG #5).
      const light = new THREE.PointLight(new THREE.Color(tint), 0, 8);
      light.position.copy(sprite.position).add(new THREE.Vector3(0, 0.2, 0.5));
      scene.add(light);
      return { sprite, light };
    }
    const heroPair = addFighter(heroClass, 'hero');
    const foePair = addFighter(foeClass, 'foe');
    heroRef.current = heroPair.sprite;
    foeRef.current = foePair.sprite;
    // Three.js Sprites don't participate in the shadow map by design
    // (they're billboarded planes with their own renderer pipeline);
    // soft contact shadows under fighters are added later as a tinted
    // CircleGeometry blob beneath each sprite once the PBR ground is in.
    heroLightRef.current = heroPair.light;
    foeLightRef.current = foePair.light;

    /* ----- Blender GLB rig swap (toon-shaded + cartoon outline) -----
       Loads /public/assets/characters/<class>.glb, retargets every PBR
       material onto MeshToonMaterial with a 3-band cel ramp, adds a
       black back-face hull as a Zelda-BotW-style outline, fits the rig
       to ~2.4u height, and plays the first available idle clip on loop.
       The 2D sprite stays in the scene at opacity 0 so impact / lightning
       targeting math (which reads sprite.position) still resolves. */
    const loader = new GLTFLoader();
    const tryLoadRig = (cls: string, side: 'hero' | 'foe') => {
      const url = `/assets/characters/${cls}.glb`;
      loader.load(url, (gltf) => {
        // GLB parse is async — by the time it resolves the effect may
        // have been re-run (region change, hot reload, unmount). Bail
        // before we touch the scene or attach an AnimationMixer that
        // the cleanup pass has already finished traversing past.
        if (cancelled) {
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.geometry) m.geometry.dispose?.();
            const mat = m.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose?.());
            else if (mat) mat.dispose?.();
          });
          return;
        }
        const model = gltf.scene;
        // Photoreal pass: keep the original PBR materials shipped with
        // the glTF (MeshStandardMaterial with baseColor / normal / mr
        // maps), light them through the HD backend's IBL + 3-point
        // rig.
        fitToHeight(model, 2.4);
        // Strip the built-in display pedestal that ships with some
        // poly.pizza meshes (Knight has a Knight_12 ~4×0.09×2 slab at
        // y=-0.01). Anything that's <8% as tall as the rig AND sits
        // within a 0.15u tolerance of the ground gets dropped. The
        // ground plane underneath still receives shadow + PBR light so
        // there's nothing missing from a render perspective.
        const rigBox = new THREE.Box3().setFromObject(model);
        const rigSize = rigBox.getSize(new THREE.Vector3());
        const removals: THREE.Object3D[] = [];
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const worldBox = new THREE.Box3().setFromObject(m);
          const t = worldBox.max.y - worldBox.min.y;
          if (t > 0 && t < rigSize.y * 0.08 && worldBox.min.y < 0.15 && worldBox.max.y < 0.25) {
            removals.push(m);
          }
        });
        for (const r of removals) r.parent?.remove(r);
        // castShadow off on the remaining rig meshes — directional shadow
        // renders as a hard rectangle on legacy shadow paths (SwiftShader,
        // older mobile drivers). The HD backend's IBL + ambient occlusion
        // grounds the figure adequately.
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; }
        });

        model.position.set(side === 'hero' ? -2.2 : 2.2, 0, 0);
        // 3/4 view: rotate ~45° off camera so we see body and weapon at
        // angle, not pure profile. Soldier.glb's default forward is -Z.
        model.rotation.y = side === 'hero' ? Math.PI / 4 : -Math.PI / 4;

        // Animation action map. The Quaternius RPG Characters pack ships
        // class-appropriate authored clips (Blender/UE-grade) — Sword_Attack,
        // Bow_Draw/Bow_Shoot, Spell1/Staff_Attack, Dagger_Attack, RecieveHit,
        // Roll, Death, Idle. We resolve them into a stable named action map
        // (idle/attack/attack2/draw/cast/hit/dodge/death) with the right
        // loop modes so the choreographer can crossfade between them. When
        // a clip is missing the map simply omits that action and the
        // choreographer's procedural body-lean covers it.
        if (gltf.animations && gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(model);
          const clips = gltf.animations;
          const findClip = (...names: string[]) => {
            for (const n of names) {
              const c = THREE.AnimationClip.findByName(clips, n);
              if (c) return c;
            }
            return null;
          };
          const oneShot = (clip: THREE.AnimationClip | null): THREE.AnimationAction | null => {
            if (!clip) return null;
            const a = mixer.clipAction(clip);
            a.loop = THREE.LoopOnce;
            a.clampWhenFinished = true;
            return a;
          };
          const looping = (clip: THREE.AnimationClip | null): THREE.AnimationAction | null => {
            if (!clip) return null;
            const a = mixer.clipAction(clip);
            a.loop = THREE.LoopRepeat;
            return a;
          };
          // Class-specific primary + secondary attack clips.
          const attackByClass: Record<string, string[]> = {
            warrior: ['Sword_Attack', 'Sword_Slash', 'Punch'],
            ranger:  ['Bow_Shoot', 'Punch'],
            mage:    ['Staff_Attack', 'Spell1', 'Punch'],
            rogue:   ['Dagger_Attack', 'Punch'],
          };
          const attack2ByClass: Record<string, string[]> = {
            warrior: ['Sword_Attack2'],
            ranger:  ['Bow_Shoot'],
            mage:    ['Spell2', 'Staff_Attack'],
            rogue:   ['Dagger_Attack2'],
          };
          const idleClip = findClip('Idle', 'Idle_Neutral', 'Idling') || clips.find((c) => !/tpose|t-pose/i.test(c.name)) || clips[0];
          const idle = looping(idleClip)!;
          idle.play();
          const actions: Record<string, THREE.AnimationAction> = { idle };
          const setIf = (key: string, action: THREE.AnimationAction | null) => { if (action) actions[key] = action; };
          setIf('attack', oneShot(findClip(...(attackByClass[cls] || ['Sword_Attack', 'Punch']))));
          setIf('attack2', oneShot(findClip(...(attack2ByClass[cls] || []))));
          setIf('draw', oneShot(findClip('Bow_Draw')));
          setIf('cast', oneShot(findClip('Spell1', 'Spell2', 'Staff_Attack')));
          setIf('hit', oneShot(findClip('RecieveHit', 'RecieveHit_2', 'HitRecieve')));
          setIf('dodge', oneShot(findClip('Roll')));
          setIf('death', oneShot(findClip('Death', 'Defeat')));
          // Stash on the model so the choreographer can fade actions.
          (model as any).userData.combatActions = actions;
          (model as any).userData.combatCurrent = idle;
          if (side === 'hero') heroMixerRef.current = mixer; else foeMixerRef.current = mixer;
        }

        scene.add(model);
        const pair = side === 'hero' ? heroPair : foePair;
        // Sprite is never added to the scene now (see addFighter); the
        // rig is the canonical render. We keep the sprite object around
        // — its position field is the canonical lunge/VFX anchor — but
        // it stays out of the scene graph for good.
        if (side === 'hero') heroRigRef.current = model; else foeRigRef.current = model;
      }, undefined, () => {
        // No rig asset → bring the 2D sprite into the scene as a fallback.
        const pair = side === 'hero' ? heroPair : foePair;
        pair.sprite.visible = true;
        scene.add(pair.sprite);
      });
    };
    tryLoadRig(heroClass, 'hero');
    tryLoadRig(foeClass, 'foe');

    /* ----- particle system -----
     * Lite mode caps the pool at 300 — still enough for a ~70-particle
     * crit burst plus ambient embers, but one quarter of the GPU work
     * per frame compared to desktop. */
    // Particle pool — uses the hoisted liteParticleBudget from above.
    const MAX_P = liteParticleBudget ? 300 : 1200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_P * 3);
    const vel = new Float32Array(MAX_P * 3);
    const colors = new Float32Array(MAX_P * 3);
    const lives = new Float32Array(MAX_P);
    const maxL = new Float32Array(MAX_P);
    const sizes = new Float32Array(MAX_P);
    // Audit (animation round): mark every slot dead at init so the
    // tick-time `aliveCount` accounting starts at zero. Without this,
    // the old code walked all 1200 slots each frame and uploaded the
    // full position buffer to the GPU even when no particle had ever
    // spawned — ~0.6 ms of pure waste at idle.
    for (let i = 0; i < MAX_P; i++) lives[i] = 1; // life >= maxL == dead
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pmat = new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, pmat);
    scene.add(pts);
    particlesRef.current = { pts, positions: pos, velocities: vel, lives, maxLives: maxL, colors, sizes, alive: 0 };
    let liveParticleCount = 0;

    // Cached magic-circle textures keyed by tint colour. Without this
    // cache, every mage cast called magicCircleTexture() → fresh 512²
    // canvas + CanvasTexture, leaked because the cleanup at unmount
    // only disposes scene-graph traversal — none of these were ever in
    // the graph as standalone references. ~1-2 MB GPU leak per mage
    // battle. Now built lazily, reused on every cast, disposed in the
    // unmount block below.
    const magicCircleCache: Map<string, THREE.CanvasTexture> = new Map();
    const getMagicCircleTexture = (tint: string): THREE.CanvasTexture => {
      let t = magicCircleCache.get(tint);
      if (!t) { t = magicCircleTexture(tint); magicCircleCache.set(tint, t); }
      return t;
    };

    /* ----- VFX group (shockwave rings, magic circles, beams) ----- */
    const fxGroup = new THREE.Group();
    scene.add(fxGroup);
    fxGroupRef.current = fxGroup;

    /** Expanding torus shockwave on the ground. */
    function shockwave(x: number, z: number, color: number) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.85, 64),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.position.set(x, 0.02, z);
      ring.rotation.x = -Math.PI / 2;
      ring.userData = { kind: 'shockwave', life: 0, max: 0.55, x, z };
      fxGroup.add(ring);
    }

    /** Magic circle decal under target. */
    function magicCircle(x: number, z: number, color: number) {
      const tex = getMagicCircleTexture('#' + color.toString(16).padStart(6, '0'));
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), mat);
      m.position.set(x, 0.05, z);
      m.rotation.x = -Math.PI / 2;
      m.userData = { kind: 'magicCircle', life: 0, max: 1.1 };
      fxGroup.add(m);

      // Vertical beam column
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.7, 5.5, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      beam.position.set(x, 2.7, z);
      beam.userData = { kind: 'beam', life: 0, max: 0.7 };
      fxGroup.add(beam);
    }

    /** Slash arc trail — a curved tube going through the target. */
    function slashArc(fromX: number, toX: number, color: number) {
      const cx = (fromX + toX) / 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(fromX, 0.8, 0.4),
        new THREE.Vector3(cx, 2.4, 0),
        new THREE.Vector3(toX, 1.2, -0.4),
      ]);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 20, 0.06, 8, false),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      tube.userData = { kind: 'arc', life: 0, max: 0.35 };
      fxGroup.add(tube);
    }

    /** Arrow streak with a glowing tracer. */
    function arrowStreak(fromX: number, toX: number, color: number) {
      const dir = Math.sign(toX - fromX);
      const curve = new THREE.LineCurve3(
        new THREE.Vector3(fromX + dir * 0.4, 1.5, 0.1),
        new THREE.Vector3(toX - dir * 0.2, 1.45, 0),
      );
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 8, 0.05, 6, false),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      tube.userData = { kind: 'streak', life: 0, max: 0.30 };
      fxGroup.add(tube);
    }

    /** Attacker after-image — a faded clone of the lunging sprite. */
    function afterImage(sprite: THREE.Sprite) {
      const clone = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: sprite.material.map, transparent: true, opacity: 0.55,
          color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      clone.scale.copy(sprite.scale);
      clone.position.copy(sprite.position);
      clone.userData = { kind: 'afterimage', life: 0, max: 0.45 };
      fxGroup.add(clone);
    }

    /** Rig after-image — clones the visible meshes of the attacker rig with a
     *  ghost emissive material, fades over 0.45s. Used by the rogue shadow-step.
     *
     *  SkinnedMesh rigs need SkeletonUtils.clone so the ghost gets an
     *  independent skeleton + bone refs (Object3D.clone shares them, which
     *  would mean later geometry.dispose() on the ghost ALSO frees the
     *  live rig's GPU resources — observed earlier audit-batch bug). The
     *  cloned geometry stays shared between ghost and source so we tag
     *  it userData.shared and the fade tick refuses to dispose it. */
    function afterImageRig(side: 'hero' | 'foe', tint: number) {
      const src = side === 'hero' ? heroRigRef.current : foeRigRef.current;
      if (!src) return;
      const ghost = SkeletonUtils.clone(src);
      ghost.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.geometry) m.geometry.userData.shared = true; // shared with the live rig
        const mat = new THREE.MeshBasicMaterial({
          color: tint, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        m.material = mat;
      });
      ghost.userData = { kind: 'afterimage', life: 0, max: 0.45 };
      fxGroup.add(ghost);
    }

    // Cache for sigil glyph textures so the crit flash doesn't re-rasterise
    // a 256² canvas every time.
    const sigilCache = new Map<string, THREE.CanvasTexture>();
    function sigilTexture(glyph: string): THREE.CanvasTexture {
      const cached = sigilCache.get(glyph);
      if (cached) return cached;
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.font = 'bold 200px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 24;
      ctx.fillText(glyph, 128, 138);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      sigilCache.set(glyph, t);
      return t;
    }

    /** Full-screen sigil flash (anime kanji punctuation on crits). 80ms total. */
    function sigilFlash(glyph: string, color: number) {
      const cam = cameraRef.current;
      if (!cam) return;
      const tex = sigilTexture(glyph);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 6),
        new THREE.MeshBasicMaterial({
          map: tex, color, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
          toneMapped: false,
        }),
      );
      // Attached to the camera so it follows whatever the orbit is doing.
      plane.position.set(0, 0, -3);
      plane.userData = { kind: 'sigil', life: 0, max: 0.20 };
      cam.add(plane);
    }

    /** Dust kick — short-lived grey particle puff at ground level + a
     *  thin shockwave-style ring. Sells the "boots on dirt" weight of
     *  a warrior or rogue lunge. */
    function dustKick(x: number, z: number, intensity: number) {
      // Small horizontal mist ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xb8a988, transparent: true, opacity: 0.55 * intensity,
        blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.18, 18), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.03, z);
      ring.userData = { kind: 'dustRing', life: 0, max: 0.45 };
      fxGroup.add(ring);
      // 12-20 dust motes drifting away + up
      spawnBurst(x, 0.10, z, Math.round(12 * intensity), 0xc7b89a);
    }

    /** Wind streak — horizontal additive line spawning between attacker
     *  and target, drifting toward camera. Used by ranger draw + release. */
    function windStreak(fromX: number, toX: number, color: number) {
      const dir = Math.sign(toX - fromX) || 1;
      const xMid = (fromX + toX) / 2;
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.LineCurve3(
            new THREE.Vector3(fromX, 1.6, 0.5),
            new THREE.Vector3(toX - dir * 0.3, 1.55, 0.45),
          ),
          6, 0.025, 6, false,
        ),
        mat,
      );
      tube.userData = { kind: 'windStreak', life: 0, max: 0.30 };
      fxGroup.add(tube);
      // Small dust motes along the path
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        spawnBurst(fromX + (toX - fromX) * t, 1.4 + Math.random() * 0.3, 0.3, 2, color);
      }
      void xMid;
    }

    /** Floating mana wisps orbiting a point. Used by mage cast wind-up. */
    function manaWisps(x: number, y: number, count: number, color: number) {
      const baseTime = performance.now() / 1000;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = 0.6 + Math.random() * 0.3;
        const wisp = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 8, 6),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        wisp.position.set(x + Math.cos(angle) * r, y - 0.2, Math.sin(angle) * r * 0.4);
        wisp.userData = {
          kind: 'wisp', life: 0, max: 0.9,
          orbitX: x, orbitY: y, orbitR: r, orbitPhase: angle, t0: baseTime,
        };
        fxGroup.add(wisp);
      }
    }

    /** Inky shadow tendrils trailing the rogue during shadow-step. */
    function shadowTendril(side: 'hero' | 'foe', color: number) {
      const src = side === 'hero' ? heroRigRef.current : foeRigRef.current;
      if (!src) return;
      const pos = src.position;
      for (let i = 0; i < 5; i++) {
        const tendril = new THREE.Mesh(
          new THREE.SphereGeometry(0.12 + Math.random() * 0.08, 6, 6),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.45,
            blending: THREE.NormalBlending, depthWrite: false,
          }),
        );
        tendril.position.set(
          pos.x + (Math.random() - 0.5) * 0.5,
          0.3 + Math.random() * 1.5,
          (Math.random() - 0.5) * 0.4,
        );
        tendril.userData = { kind: 'tendril', life: 0, max: 0.55 };
        fxGroup.add(tendril);
      }
    }

    /** Ground-up god-ray bounce — vertical cone of soft light at the
     *  impact point. Sells the "fluorescent burst" of a crit landing. */
    function godRay(x: number, z: number, color: number, height: number) {
      const geo = new THREE.ConeGeometry(0.8, height, 16, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(x, height / 2, z);
      // Cone points down by default; flip so the apex is at ground.
      cone.rotation.x = Math.PI;
      cone.userData = { kind: 'godRay', life: 0, max: 0.7 };
      fxGroup.add(cone);
    }

    /** Lens flare — additive sprite attached to the camera that flickers
     *  briefly. Used after a crit impact for that "lens caught the light"
     *  cinematic punctuation. */
    function lensFlare(color: number, intensity: number, life: number) {
      const cam = cameraRef.current;
      if (!cam) return;
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: intensity,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
        toneMapped: false,
      });
      const flare = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), mat);
      flare.position.set(0.5, 0.3, -2);
      flare.userData = { kind: 'lensFlare', life: 0, max: life, peak: intensity };
      cam.add(flare);
    }

    /** Chromatic ground crack — radial decal expanding from a point. */
    function groundCrack(x: number, z: number, color: number) {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.4, 32), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.04, z);
      mesh.userData = { kind: 'groundCrack', life: 0, max: 0.6 };
      fxGroup.add(mesh);
    }

    /* ----- particle helpers ----- */
    // Hoisted scratch Color so spawn loops don't allocate ~110 fresh
    // THREE.Color instances per crit burst.
    const tmpColor = new THREE.Color();

    /** Fire-and-forget particle burst at (x,y,z). Reuses the ambient pool —
     *  slots are recycled as new bursts overflow. Used by attack timelines. */
    function spawnBurst(x: number, y: number, z: number, count: number, color: number) {
      const p = particlesRef.current!;
      const cap = liteParticleBudget ? Math.min(count, 30) : count;
      tmpColor.set(color);
      for (let i = 0; i < cap; i++) {
        const slot = (p.alive++ % MAX_P);
        const idx = slot * 3;
        if (p.lives[slot] >= p.maxLives[slot]) liveParticleCount++;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.4;
        p.positions[idx]     = x + Math.cos(ang) * r;
        p.positions[idx + 1] = y + Math.sin(ang) * r;
        p.positions[idx + 2] = z + (Math.random() - 0.5) * 0.4;
        const speed = 2 + Math.random() * 3.5;
        const spread = Math.random() * Math.PI * 2;
        p.velocities[idx]     = Math.cos(spread) * speed * 0.4;
        p.velocities[idx + 1] = 1.5 + Math.random() * 3.5;
        p.velocities[idx + 2] = Math.sin(spread) * speed * 0.4;
        p.colors[idx]     = tmpColor.r;
        p.colors[idx + 1] = tmpColor.g;
        p.colors[idx + 2] = tmpColor.b;
        p.lives[slot] = 0;
        p.maxLives[slot] = 0.7 + Math.random() * 0.4;
      }
      geo.attributes.color.needsUpdate = true;
    }

    // Region-aware ambient spawner — tint, rate, and direction read off
    // the recipe so Frostvale gets falling snow, Stormpeaks gets settling
    // mist, Emberreach gets rising embers, Conclave gets rising rune
    // motes, Voidshade gets violet aberration sparks, etc.
    function spawnAmbient(dt: number) {
      if (Math.random() > dt * emberSpec.rate) return;
      const p = particlesRef.current!;
      const slot = (p.alive++ % MAX_P);
      const idx = slot * 3;
      if (p.lives[slot] >= p.maxLives[slot]) liveParticleCount++;
      p.positions[idx] = (Math.random() - 0.5) * 12;
      // Up-spawners start at ground; down-spawners (snow, mist) start in air.
      p.positions[idx + 1] = emberSpec.up ? -0.5 : 6 + Math.random() * 4;
      p.positions[idx + 2] = (Math.random() - 0.5) * 4 - 1;
      p.velocities[idx] = (Math.random() - 0.5) * 0.2;
      p.velocities[idx + 1] = emberSpec.up
        ? (0.6 + Math.random() * 0.4)
        : -(0.4 + Math.random() * 0.4);
      p.velocities[idx + 2] = (Math.random() - 0.5) * 0.1;
      // Subtle hue jitter so the trail doesn't look monochromatic.
      const baseColor = new THREE.Color(emberSpec.color);
      const hsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);
      tmpColor.setHSL(
        (hsl.h + (Math.random() - 0.5) * 0.08 + 1) % 1,
        Math.min(1, hsl.s * (0.85 + Math.random() * 0.3)),
        Math.min(1, hsl.l * (0.85 + Math.random() * 0.3)),
      );
      p.colors[idx] = tmpColor.r; p.colors[idx + 1] = tmpColor.g; p.colors[idx + 2] = tmpColor.b;
      p.lives[slot] = 0;
      p.maxLives[slot] = 3 + Math.random() * 2;
    }

    function burst(x: number, y: number, z: number, color: number, count: number, speedScale = 1) {
      const p = particlesRef.current!;
      tmpColor.set(color);
      const cr = tmpColor.r, cg = tmpColor.g, cb = tmpColor.b;
      for (let i = 0; i < count; i++) {
        const slot = (p.alive++ % MAX_P);
        const idx = slot * 3;
        if (p.lives[slot] >= p.maxLives[slot]) liveParticleCount++;
        p.positions[idx] = x;
        p.positions[idx + 1] = y;
        p.positions[idx + 2] = z;
        const a = Math.random() * Math.PI * 2;
        const e = (Math.random() - 0.3) * Math.PI;
        const speed = (3 + Math.random() * 5) * speedScale;
        p.velocities[idx] = Math.cos(a) * Math.cos(e) * speed;
        p.velocities[idx + 1] = Math.sin(e) * speed + 1.2;
        p.velocities[idx + 2] = Math.sin(a) * Math.cos(e) * speed;
        p.colors[idx] = cr; p.colors[idx + 1] = cg; p.colors[idx + 2] = cb;
        p.lives[slot] = 0;
        p.maxLives[slot] = 0.7 + Math.random() * 0.4;
      }
    }

    /* Audit BUG #4: the VFX functions used to be stashed on the
     * component constructor itself, which meant a second concurrent
     * scene (replay opened while the previous one was tearing down)
     * would overwrite the first scene's bridge and start spawning
     * particles in the wrong fxGroup. They now live in a per-mount
     * ref so each instance has its own callbacks. */
    vfxRef.current = { burst, shockwave, magicCircle, slashArc, arrowStreak, afterImage };

    /* ----- resize ----- */
    function resize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (renderer) renderer.setSize(w, h, false);
      if (composer) composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Invalidate the cached mount rect so the HUD projector re-reads it.
      mountRectDirty.flag = true;
    }
    // Shared dirty flag for the HUD projector's cached mount dimensions.
    const mountRectDirty = { flag: true };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    /* ----- async backend creation + key-light shadow + GUI panel -----
     * Once the renderer + post chain resolve, we wire shadow on the key
     * directional light (PCFSoft 2048²), promote the procedural ground
     * to MeshPhysicalMaterial so SSR has something to reflect, and
     * mount the lil-gui panel when ?debug=1 is on the URL.
     */
    createCombatBackend({ mount, scene, camera, tuneables }).then((b) => {
      if (cancelled) {
        b.dispose();
        return;
      }
      backend = b;
      renderer = b.renderer;
      composer = b.composer;
      vignettePass = b.vignettePass;
      bloom = b.bloomPass;
      rgbShift = b.rgbShift;
      try { mount.removeChild(loadingBg); } catch {}

      // Configure shadow on the brightest scene light (added earlier by
      // the lights setup block) — PCFSoft 2048² across an 8m frustum.
      const keyLight = scene.children.find((c): c is THREE.DirectionalLight =>
        c instanceof THREE.DirectionalLight && c.intensity >= 0.5,
      ) || null;
      if (keyLight && b.kind !== 'webgl1-lite') {
        configureShadows(keyLight, tuneables.shadowMapSize);
      }

      // Replace the existing ground plane (a simple painted disc) with a
      // physically-correct plane so SSR has something to reflect from
      // and GTAO has surface to occlude into.
      const oldGround = scene.children.find((c) =>
        (c as any).userData?.kind === 'ground',
      );
      if (oldGround) {
        scene.remove(oldGround);
        try { (oldGround as any).geometry?.dispose?.(); (oldGround as any).material?.dispose?.(); } catch {}
      }
      const pbrGround = buildPbrGround(40, pal.ground ?? 0x2a2418);
      pbrGround.userData.kind = 'ground';
      scene.add(pbrGround);

      hdPanel = mountHDPanel(b, scene, keyLight);
    });

    /* ----- combat choreographer mount -----
     * Hands the VFX functions defined above + the runtime refs (camera
     * anchor, rig refs, mixers) to the Choreographer. From here on every
     * attack() / defeat() goes through a Timeline; no per-tick state
     * machine. */
    const vfxBus: VfxBus = {
      shockwave: (x, z, color) => shockwave(x, z, color),
      slashArc: (fromX, _fromZ, toX, _toZ, color) => slashArc(fromX, toX, color),
      magicCircle: (x, z, color) => magicCircle(x, z, color),
      arrow: (fromX, _fromZ, toX, _toZ, color) => arrowStreak(fromX, toX, color),
      afterImage: (side, tint) => afterImageRig(side, tint),
      burst: (x, y, z, count, color) => spawnBurst(x, y, z, count, color),
      sigilFlash: (glyph, color) => sigilFlash(glyph, color),
      groundCrack: (x, z, color) => groundCrack(x, z, color),
      dustKick: (x, z, intensity) => dustKick(x, z, intensity ?? 1.0),
      windStreak: (fromX, toX, color) => windStreak(fromX, toX, color),
      manaWisps: (x, y, count, color) => manaWisps(x, y, count, color),
      shadowTendril: (side, color) => shadowTendril(side, color),
      godRay: (x, z, color, height) => godRay(x, z, color, height ?? 4),
      lensFlare: (color, intensity, life) => lensFlare(color, intensity ?? 0.6, life ?? 0.4),
      setVignette: (intensity) => {
        if (vignettePass) {
          // Map 0..1 → darkness 0.95..1.4 (baseline 0.95, doubles
          // toward fully dark at intensity=1).
          vignettePass.uniforms['darkness'].value = 0.95 + intensity * 0.55;
        }
      },
      setDesaturation: (amount) => {
        desaturationAmt = Math.max(0, Math.min(1, amount));
        // Pulling tone-mapping exposure down a bit + tinting bloom strength
        // sells the cinematic slow-mo grade without an extra pass.
        if (renderer && tuneables) {
          renderer.toneMappingExposure = tuneables.exposure * (1 - amount * 0.20);
        }
      },
      shake: (amount, time) => { shakeRef.current = { amount, t: time }; },
      hitstop: (dur) => { hitStopRef.current = dur; },
      bloomKick: (delta, recover) => {
        // Stash on an animRef-like scratchpad; the post tick block below
        // already eases bloom back to its base value, so we just nudge.
        if (bloom) {
          bloom.strength = Math.min(2.0, bloom.strength + delta);
          bloomKickRecoverRef.current = recover;
        }
      },
      setRgbShift: (amount) => { if (rgbShift) rgbShift.uniforms['amount'].value = amount; },
      lightPulse: (side, tint, intensity) => {
        const l = side === 'hero' ? heroLightRef.current : foeLightRef.current;
        if (l) { l.color.setHex(tint); l.intensity = intensity; }
      },
      cameraAnchor: () => camAnchorRef.current,
      fighterPos: (side) => {
        const rig = side === 'hero' ? heroRigRef.current : foeRigRef.current;
        if (rig) return rig.position.clone();
        return new THREE.Vector3(side === 'hero' ? -2.2 : 2.2, 0, 0);
      },
    };
    choreoRef.current = new Choreographer(
      {
        get hero() { return heroRigRef.current; },
        get foe() { return foeRigRef.current; },
        get heroMixer() { return heroMixerRef.current; },
        get foeMixer() { return foeMixerRef.current; },
      } as any,
      vfxBus,
    );

    /* ----- floating HUD projection helper ----- */
    // Scratch vector reused every frame (no per-frame alloc).
    const hudProjVec = new THREE.Vector3();
    const mountRect = { w: 0, h: 0 };
    function projectHud(rig: THREE.Object3D | null, bar: HTMLDivElement | null, camera: THREE.PerspectiveCamera) {
      if (!bar) return;
      if (!rig) { bar.style.opacity = '0'; return; }
      // Anchor a touch above the rig's head (rig is ~2.4u tall, feet at y=0).
      hudProjVec.set(rig.position.x, 2.85, rig.position.z);
      hudProjVec.project(camera);
      // Behind the camera → hide.
      if (hudProjVec.z > 1) { bar.style.opacity = '0'; return; }
      if (mountRectDirty.flag || mountRect.w === 0) {
        mountRect.w = mount.clientWidth; mountRect.h = mount.clientHeight;
        mountRectDirty.flag = false;
      }
      const sx = (hudProjVec.x * 0.5 + 0.5) * mountRect.w;
      const sy = (-hudProjVec.y * 0.5 + 0.5) * mountRect.h;
      bar.style.opacity = '1';
      bar.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    }

    /* ----- adaptive resolution monitor -----
     * If the rolling average frame time stays high, ratchet the renderer
     * pixel ratio down once (then again if still slow). One-way so it
     * never oscillates. Saves laptops + mid phones that picked the WebGL2
     * path but can't quite hold 60fps with the full post chain. */
    let frameAccum = 0, frameCount = 0;
    let dprStep = 0;               // 0 = untouched, 1 = first drop, 2 = floor
    const DPR_STEPS = [1.5, 1.15, 0.85];
    function adaptiveResolution(dtMs: number) {
      if (!renderer || dprStep >= DPR_STEPS.length - 1) return;
      frameAccum += dtMs; frameCount++;
      if (frameCount < 90) return;  // ~1.5s window
      const avg = frameAccum / frameCount;
      frameAccum = 0; frameCount = 0;
      // 28ms ≈ 36fps sustained → step down.
      if (avg > 28) {
        dprStep++;
        const target = Math.min(window.devicePixelRatio, DPR_STEPS[dprStep]);
        renderer.setPixelRatio(target);
        composer?.setPixelRatio(target);
        const w = mount.clientWidth, h = mount.clientHeight;
        renderer.setSize(w, h, false);
        composer?.setSize(w, h);
        mountRectDirty.flag = true;
      }
    }

    /* ----- main loop ----- */
    let last = performance.now();
    function tick(now: number) {
      const frameMs = now - last;          // real (uncapped) frame time
      const rawDt = Math.min(0.05, frameMs / 1000);
      last = now;
      adaptiveResolution(frameMs > 0 && frameMs < 1000 ? frameMs : 16);

      // Hit-stop freezes simulation for a few frames (camera + bloom still tick).
      const ts = timeScaleRef.current;
      hitStopRef.current = Math.max(0, hitStopRef.current - rawDt);
      const dt = hitStopRef.current > 0 ? 0 : rawDt * ts;

      // Ease the time scale back to 1× after a crit-induced slow-mo.
      if (timeScaleRef.current < 1) {
        timeScaleRef.current = Math.min(1, timeScaleRef.current + rawDt * 1.6);
      }

      // Ambient sparks + particles step
      spawnAmbient(dt);
      const p = particlesRef.current!;
      // Audit (animation round): old loop walked all 1200 slots and
      // dirtied the GPU position buffer every frame regardless of
      // whether anything was alive. Now bail entirely when the live
      // count is zero, and only flag needsUpdate when we actually
      // touched a position. Saves ~0.6 ms on idle.
      if (liveParticleCount > 0) {
        let anyMoved = false;
        for (let i = 0; i < MAX_P; i++) {
          if (p.lives[i] >= p.maxLives[i]) continue;
          p.lives[i] += dt;
          if (p.lives[i] >= p.maxLives[i]) {
            p.positions[i*3 + 1] = -100;
            liveParticleCount--;
            anyMoved = true;
            continue;
          }
          p.velocities[i*3 + 1] -= 4.5 * dt;
          p.positions[i*3]     += p.velocities[i*3]     * dt;
          p.positions[i*3 + 1] += p.velocities[i*3 + 1] * dt;
          p.positions[i*3 + 2] += p.velocities[i*3 + 2] * dt;
          anyMoved = true;
        }
        if (anyMoved) {
          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
        }
      }
      pmat.opacity = 1;

      // VFX group tick — shockwave expansion, magic circle rotation, fades.
      const fg = fxGroupRef.current!;
      for (let i = fg.children.length - 1; i >= 0; i--) {
        const obj = fg.children[i] as THREE.Mesh | THREE.Sprite;
        const ud = obj.userData;
        ud.life += dt;
        const k = Math.min(1, ud.life / ud.max);
        const mat = (obj as any).material as THREE.Material & { opacity: number };
        if (ud.kind === 'shockwave') {
          const r = 0.4 + k * 4.2;
          obj.scale.set(r, r, r);
          mat.opacity = (1 - k) * 0.95;
        } else if (ud.kind === 'magicCircle') {
          obj.rotation.z += dt * 1.2;
          const s = 0.6 + Math.min(1, k * 2) * 0.5;
          obj.scale.set(s, s, s);
          mat.opacity = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
        } else if (ud.kind === 'beam') {
          mat.opacity = k < 0.3 ? (k / 0.3) * 0.7 : (1 - (k - 0.3) / 0.7) * 0.7;
          obj.scale.x = 1 + Math.sin(now * 0.02) * 0.1;
          obj.scale.z = 1 + Math.cos(now * 0.02) * 0.1;
        } else if (ud.kind === 'arc' || ud.kind === 'streak') {
          mat.opacity = (1 - k) * 0.95;
        } else if (ud.kind === 'afterimage') {
          // Group clones — iterate every material child + fade them all.
          obj.traverse?.((c: any) => {
            if (c.material && 'opacity' in c.material) c.material.opacity = (1 - k) * 0.55;
          });
          if (mat) mat.opacity = (1 - k) * 0.55;
        } else if (ud.kind === 'groundCrack') {
          const r = 0.4 + k * 5.5;
          obj.scale.set(r, r, r);
          mat.opacity = (1 - k) * 0.8;
        } else if (ud.kind === 'dustRing') {
          const r = 1 + k * 3.5;
          obj.scale.set(r, r, r);
          mat.opacity = (1 - k) * 0.55;
        } else if (ud.kind === 'windStreak') {
          mat.opacity = (1 - k) * 0.55;
          obj.position.z += dt * 0.8; // drift toward camera
        } else if (ud.kind === 'wisp') {
          // Orbit + rise + fade
          const orbitSpeed = 4.5;
          const phase = ud.orbitPhase + (now * 0.001 - ud.t0) * orbitSpeed;
          obj.position.x = ud.orbitX + Math.cos(phase) * ud.orbitR * (1 - k * 0.4);
          obj.position.y = ud.orbitY - 0.2 + k * 1.4;
          obj.position.z = Math.sin(phase) * ud.orbitR * 0.4 * (1 - k * 0.4);
          mat.opacity = k < 0.3 ? (k / 0.3) * 0.9 : (1 - (k - 0.3) / 0.7) * 0.9;
        } else if (ud.kind === 'tendril') {
          obj.position.y += dt * 1.5;
          const scale = 1 + k * 0.6;
          obj.scale.set(scale, scale * 1.4, scale);
          mat.opacity = (1 - k) * 0.45;
        } else if (ud.kind === 'godRay') {
          // Flicker the opacity + slight rotation
          mat.opacity = (1 - k) * 0.4 * (0.85 + Math.sin(now * 0.05) * 0.15);
          obj.rotation.y += dt * 1.8;
        }
        if (ud.life >= ud.max) {
          fg.remove(obj);
          // For afterimages: dispose only the per-instance materials we
          // created on top of the shared rig geometry. The geometry
          // itself is tagged userData.shared (so the env cleanup walker
          // also skips it) — touching it would tear the live rig down.
          if (ud.kind === 'afterimage') {
            obj.traverse?.((c: any) => {
              if (c.material && typeof c.material.dispose === 'function') c.material.dispose();
            });
          } else {
            (obj as any).geometry?.dispose?.();
            mat.dispose?.();
          }
        }
      }
      // Camera-attached sigil flashes live on the camera, not in fxGroup.
      const cam0 = cameraRef.current;
      if (cam0) {
        for (let i = cam0.children.length - 1; i >= 0; i--) {
          const o = cam0.children[i] as THREE.Mesh;
          if (o.userData?.kind === 'sigil') {
            o.userData.life += dt;
            const k = Math.min(1, o.userData.life / o.userData.max);
            // 30ms in → 50ms hold → 120ms out — punchy anime flash curve.
            const opacity = k < 0.15 ? (k / 0.15) * 0.85
                          : k < 0.40 ? 0.85
                          : (1 - (k - 0.40) / 0.60) * 0.85;
            (o.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity);
            if (o.userData.life >= o.userData.max) {
              cam0.remove(o);
              o.geometry?.dispose?.();
              (o.material as any).dispose?.();
            }
          } else if (o.userData?.kind === 'lensFlare') {
            o.userData.life += dt;
            const k = Math.min(1, o.userData.life / o.userData.max);
            // Sharp pop then bias-decay; bias-randomised flicker on top.
            const base = k < 0.2 ? (k / 0.2) : (1 - (k - 0.2) / 0.8);
            const flicker = 0.85 + Math.sin(now * 0.04) * 0.15;
            (o.material as THREE.MeshBasicMaterial).opacity = Math.max(0, base * o.userData.peak * flicker);
            if (o.userData.life >= o.userData.max) {
              cam0.remove(o);
              o.geometry?.dispose?.();
              (o.material as any).dispose?.();
            }
          }
        }
      }

      // Choreographer drives every animation channel now — root motion,
      // bone lean, camera anchor, VFX cues, hit-stop, slow-mo. The
      // executor reads/writes through the VfxBus mounted below.
      choreoRef.current?.update(rawDt);
      const hl = heroLightRef.current!, fl = foeLightRef.current!;
      hl.intensity = Math.max(0, hl.intensity - dt * 8);
      fl.intensity = Math.max(0, fl.intensity - dt * 8);
      // Subtle idle breathing on the rigs — only when the choreographer
      // isn't playing something, otherwise we'd fight its root track.
      // The two rigs breathe out of phase so the scene reads as alive
      // even with the camera locked off.
      if (!choreoRef.current?.isPlaying()) {
        const idleBob = Math.sin(now * 0.0014) * 0.015;
        if (heroRigRef.current) heroRigRef.current.position.y = idleBob;
        if (foeRigRef.current) foeRigRef.current.position.y = -idleBob;
      }
      // Handheld-style micro-shake on the camera anchor — composed of
      // two slow sines at different freqs so it never repeats cleanly
      // and never crosses the strobe threshold. Always on but very
      // subtle; the choreographer's `shake` cue overrides it during
      // attacks via the existing shakeRef path (additive).
      idleHandheldRef.current.x = Math.sin(now * 0.00041) * 0.018 + Math.sin(now * 0.00073) * 0.010;
      idleHandheldRef.current.y = Math.sin(now * 0.00033) * 0.013 + Math.sin(now * 0.00067) * 0.008;

      // Intro orbital sweep — overrides camera anchor for the first 1.4s.
      const intro = introRef.current;
      let camTargetX = camAnchorRef.current.x;
      let camTargetY = camAnchorRef.current.y;
      let camTargetZ = camAnchorRef.current.z;
      let camTargetFov = camAnchorRef.current.fov;
      if (intro.active) {
        intro.t += rawDt;
        const k = Math.min(1, intro.t / intro.dur);
        const eased = 1 - Math.pow(1 - k, 3);
        const ang = (1 - eased) * Math.PI * 0.6 + Math.PI / 2; // 162° → 90° (front)
        const radius = 9.5 - eased * 3.0;
        camTargetX = Math.cos(ang) * radius * 0.4;
        camTargetY = 4.5 - eased * 2.3;
        camTargetZ = Math.sin(ang) * radius;
        camTargetFov = 52 - eased * 6;
        if (k >= 1) intro.active = false;
      }

      const cam = cameraRef.current!;
      const s = shakeRef.current;
      s.t = Math.max(0, s.t - rawDt);
      const shakeX = s.t > 0 ? (Math.random() - 0.5) * s.amount * 2 * (s.t / 0.35) : 0;
      const shakeY = s.t > 0 ? (Math.random() - 0.5) * s.amount * (s.t / 0.35) : 0;

      const lerpK = intro.active ? Math.min(1, rawDt * 8) : Math.min(1, rawDt * 6);
      const hh = idleHandheldRef.current;
      cam.position.x += (camTargetX + shakeX + hh.x - cam.position.x) * lerpK;
      cam.position.y += (camTargetY + shakeY + hh.y - cam.position.y) * lerpK;
      cam.position.z += (camTargetZ - cam.position.z) * Math.min(1, rawDt * 4);
      // Dolly-zoom FOV lerp
      cam.fov += (camTargetFov - cam.fov) * Math.min(1, rawDt * 5);
      cam.updateProjectionMatrix();
      cam.lookAt(camAnchorRef.current.lx, camAnchorRef.current.ly, camAnchorRef.current.lz);

      // Floating HUD projection — anchor each health bar above its rig's
      // head by projecting a world point to screen space. Runs every
      // frame so the bars ride the camera dolly / shake. The fill width
      // is React-driven (props → JSX), only the transform is imperative.
      projectHud(heroRigRef.current, heroBarRef.current, cam);
      projectHud(foeRigRef.current, foeBarRef.current, cam);

      // Bloom + RGB shift ease back to their tuneables baseline. The
      // Choreographer fires `bloomKick(delta, recover)` cues that nudge
      // the values up; this recovery pulls them back over
      // `bloomKickRecoverRef` seconds. Pulling the baseline straight
      // off `tuneables.*` (not literal constants) so the lil-gui live
      // tune panel actually controls the resting point.
      if (bloom && rgbShift) {
        const recover = bloomKickRecoverRef.current || 0.30;
        const decayRate = 1 / Math.max(0.05, recover);
        bloom.strength += (tuneables.bloomStrength - bloom.strength) * Math.min(1, rawDt * decayRate * 4);
        rgbShift.uniforms['amount'].value += (tuneables.rgbShiftAmount - rgbShift.uniforms['amount'].value) * Math.min(1, rawDt * decayRate * 4);
      }

      // Tick rig animation mixers (idle/attack loops). Driven by `dt`
      // which honours hit-stop and slow-mo, so the rig also freezes on
      // crit hit-stops alongside the rest of the simulation.
      if (heroMixerRef.current) heroMixerRef.current.update(dt);
      if (foeMixerRef.current) foeMixerRef.current.update(dt);

      // Backend-aware render — null until createCombatBackend resolves
      // (WebGPU init takes ~50-200ms). The first few rAFs after mount
      // skip drawing; the loading background div stays visible.
      if (backend) backend.render();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      try { choreoRef.current?.stop(); choreoRef.current = null; } catch {}
      try { hdPanel?.dispose(); } catch {}
      envCancelled = true;
      try { environment?.dispose(); } catch {}
      try { backend?.dispose(); } catch {}
      // Stop animation mixers + drop their cached actions on both rigs
      // before the scene traverse-dispose runs. Without this the actions
      // keep their refs to the rig's skeleton and the rig's geometry
      // disposes can race with mixer.update on the next frame.
      for (const ref of [heroMixerRef, foeMixerRef]) {
        const mixer = ref.current;
        if (mixer) {
          try { mixer.stopAllAction(); } catch {}
          try { (mixer as any)._actions?.forEach?.((a: THREE.AnimationAction) => a.reset?.()); } catch {}
          const root = (ref === heroMixerRef ? heroRigRef : foeRigRef).current;
          if (root) try { mixer.uncacheRoot(root); } catch {}
          ref.current = null;
        }
      }
      try { mount.contains(loadingBg) && mount.removeChild(loadingBg); } catch {}
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry?.dispose();
        const mat = (obj as THREE.Mesh).material as any;
        if (mat) { if (Array.isArray(mat)) mat.forEach((m) => m.dispose && m.dispose()); else mat.dispose && mat.dispose(); }
      });
      // Audit (animation round): the cached magic-circle textures live
      // in a per-mount closure Map, never enter the scene graph as
      // standalone references, and therefore were never reached by the
      // traverse-based dispose above. Walk the map explicitly so each
      // cached CanvasTexture (and its 512² backing canvas reference)
      // releases its GPU handle on unmount.
      magicCircleCache.forEach((t) => t.dispose());
      magicCircleCache.clear();
      // sigil planes live as children of the camera (so they ride the
      // orbit on crit) — the scene traverse-dispose above doesn't reach
      // them. Walk the camera explicitly and free both the plane and the
      // cached CanvasTexture for each glyph.
      const camCleanup = cameraRef.current;
      if (camCleanup) {
        for (let i = camCleanup.children.length - 1; i >= 0; i--) {
          const o = camCleanup.children[i] as THREE.Mesh;
          if (o.userData?.kind !== 'sigil') continue;
          o.geometry?.dispose?.();
          (o.material as any)?.dispose?.();
          camCleanup.remove(o);
        }
      }
      sigilCache.forEach((t) => t.dispose());
      sigilCache.clear();
      // Renderer canvas removal is handled inside backend.dispose() now;
      // this used to be the direct unmount call back when renderer was
      // a non-null local. Kept as a no-op safety net for any leftover
      // canvas that might survive the backend dispose.
      try { renderer && mount.removeChild(renderer.domElement); } catch {}
    };
  }, [heroClass, foeClass, region]);

  // Crossfade the named action ("attack" / "death") on a rig. Idle is
  useImperativeHandle(ref, () => ({
    attack({ attacker, effect, crit, damageRatio = 0.3, missed, dodged, onImpact }) {
      // Choreographer-driven: build a Timeline from the class+effect, fold
      // the crit modifier in (dolly-zoom + sigil flash + heavy hit-stop +
      // slow-mo + bloom kick) and play it. The timeline's
      // `callback.onImpact` cue fires `onImpact` at the exact 3D impact
      // frame, so the UI / SFX side stays in sync without the old wall-
      // clock setTimeout drift.
      const cls = attacker === 'hero' ? heroClass : foeClass;
      const base = pickAttackTimeline(cls, attacker, effect);
      const timeline = crit ? applyCritModifier(base) : base;
      choreoRef.current?.play(timeline, {
        attacker,
        damageRatio: damageRatio || 0.3,
        crit: !!crit,
        onImpact,
      });
      if (missed || dodged) shakeRef.current = { amount: 0.05, t: 0.18 };
    },
    defeat(side) {
      // Cinematic knee-buckle with timeScale ramp + camera tilt + push-in
      // hold. Death rig clip fades in via the timeline's rig.crossfade
      // cue; clampWhenFinished is set in Choreographer.rigCrossfade.
      const timeline = pickDefeatTimeline(side);
      choreoRef.current?.play(timeline, {
        attacker: side, // defeat timeline frames the loser as 'attacker'
        damageRatio: 1,
        crit: false,
      });
    },
    resetCamera() {
      camAnchorRef.current = { x: 0, y: 1.9, z: 6.0, lx: 0, ly: 1.3, lz: 0, fov: 48 };
      introRef.current = { t: 0, dur: 1.4, active: true };
      choreoRef.current?.stop();
    },
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} aria-hidden />
      {/* Floating health bars — positioned imperatively each frame by the
          rAF projector; the fill width is React-driven so it updates in
          real time as the fight resolves. */}
      {heroHud && (
        <FloatingHealthBar innerRef={heroBarRef} hud={heroHud} side="hero" />
      )}
      {foeHud && (
        <FloatingHealthBar innerRef={foeBarRef} hud={foeHud} side="foe" />
      )}
      {/* Damage-number layer — anchored over the hero/foe slot. */}
      <div ref={popLayerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
        {(pops || []).map((p) => (
          <div key={p.id} className={`combat3d-pop ${p.side} ${p.kind}`}>{p.text}</div>
        ))}
      </div>
    </div>
  );
});

/** Floating health bar rendered above a fighter's head. The wrapper is
 *  transform-positioned by the scene's rAF tick; this component only owns
 *  the visual fill + ghost trail + label. */
function FloatingHealthBar({
  innerRef, hud, side,
}: {
  innerRef: React.RefObject<HTMLDivElement>;
  hud: FighterHud;
  side: 'hero' | 'foe';
}): React.ReactElement {
  return (
    <div ref={innerRef} className={`combat3d-hpbar ${side}`}>
      <div className="combat3d-hpbar-name">
        <span className="nm">{hud.name}</span>
        <span className="lv">Lv {hud.level}</span>
      </div>
      <div className="combat3d-hpbar-track">
        <div className="combat3d-hpbar-ghost" style={{ width: `${Math.max(hud.ghostPct, hud.hpPct)}%` }} />
        <div className="combat3d-hpbar-fill" style={{ width: `${hud.hpPct}%` }} />
      </div>
      <div className="combat3d-hpbar-num">{Math.max(0, Math.round(hud.hp))} / {hud.hpMax}</div>
    </div>
  );
}

export default CombatScene3D;
