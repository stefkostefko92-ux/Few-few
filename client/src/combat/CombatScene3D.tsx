import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
  attack: (opts: { attacker: 'hero' | 'foe'; effect?: string; crit?: boolean; damageRatio?: number; missed?: boolean; dodged?: boolean; }) => void;
  defeat: (side: 'hero' | 'foe') => void;
  resetCamera: () => void;
}

interface Props {
  heroClass: string;
  foeClass: string;
  region?: string;
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
  whispering_woods: { sky: 0x2c4a2d, fog: 0x1e2a1f, ground: 0x1c2818, ambient: 0x4a7a3d },
  mistmoor_hills:   { sky: 0x4a5567, fog: 0x2e3540, ground: 0x2c2f37, ambient: 0x6f7a8c },
  crystal_caverns:  { sky: 0x213057, fog: 0x102045, ground: 0x172240, ambient: 0x6aa7ff },
  ashen_wastes:     { sky: 0x4a261a, fog: 0x2a0e07, ground: 0x2c1813, ambient: 0xff7c4d },
  shadowfell:       { sky: 0x2a173d, fog: 0x140820, ground: 0x1c0e26, ambient: 0xc294ff },
};

const CLASS_TINT: Record<string, string> = {
  warrior: '#ffd34d',
  ranger:  '#6ad8a4',
  mage:    '#c294ff',
  rogue:   '#e85a4f',
};

const CombatScene3D = React.forwardRef<CombatScene3DHandle, Props>(({ heroClass, foeClass, region = 'whispering_woods' }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
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
  const heroLightRef = useRef<THREE.PointLight | null>(null);
  const foeLightRef = useRef<THREE.PointLight | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const camAnchorRef = useRef({ x: 0, y: 2.4, z: 8.0, lx: 0, ly: 1.4, lz: 0, fov: 42 });
  const shakeRef = useRef({ amount: 0, t: 0 });
  const timeScaleRef = useRef(1);
  const hitStopRef = useRef(0);
  const introRef = useRef({ t: 0, dur: 1.4, active: true });
  const particlesRef = useRef<{ pts: THREE.Points; positions: Float32Array; velocities: Float32Array; lives: Float32Array; maxLives: Float32Array; colors: Float32Array; sizes: Float32Array; alive: number; } | null>(null);
  const fxGroupRef = useRef<THREE.Group | null>(null);
  const animRef = useRef<{ kind: 'idle'|'windup-hero'|'windup-foe'|'lunge-hero'|'lunge-foe'|'defeated-hero'|'defeated-foe'; t: number } & {[k:string]:any}>({ kind:'idle', t:0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const pal = REGION_PALETTE[region] || REGION_PALETTE.whispering_woods;

    /* ----- renderer ----- */
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      const fb = document.createElement('div');
      fb.style.cssText = `position:absolute;inset:0;background:
        radial-gradient(ellipse at 50% 70%, ${'#' + (pal.ambient.toString(16).padStart(6,'0'))}33, transparent 60%),
        linear-gradient(180deg, ${'#' + (pal.sky.toString(16).padStart(6,'0'))} 0%, ${'#' + (pal.fog.toString(16).padStart(6,'0'))} 100%)`;
      mount.appendChild(fb);
      return () => { try { mount.removeChild(fb); } catch {} };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(pal.sky);
    scene.fog = new THREE.Fog(pal.fog, 6, 22);

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 2.4, 8.0);
    camera.lookAt(0, 1.4, 0);
    cameraRef.current = camera;

    /* ----- post-processing stack ----- */
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(mount.clientWidth, mount.clientHeight);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight),
      0.55,   // strength — luminous halo on sparks/magic circles only
      0.40,   // radius
      0.55,   // threshold — only the brightest emissive pixels bloom,
              // so fighter silhouettes stay readable instead of blowing out
    );
    composer.addPass(bloom);
    const rgbShift = new ShaderPass(RGBShiftShader);
    rgbShift.uniforms['amount'].value = 0.0018; // baseline chromatic aberration
    composer.addPass(rgbShift);
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms['offset'].value = 0.85;
    vignette.uniforms['darkness'].value = 0.95;
    composer.addPass(vignette);
    composer.addPass(new OutputPass());

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
      for (const cx of [340, 684]) {
        const grd = gctx.createRadialGradient(cx, 700, 0, cx, 700, 110);
        grd.addColorStop(0, 'rgba(0,0,0,.55)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        gctx.fillStyle = grd;
        gctx.fillRect(cx - 120, 590, 240, 220);
      }
      const groundTex = new THREE.CanvasTexture(groundCanvas);
      groundTex.colorSpace = THREE.SRGBColorSpace;
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 14),
        new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      scene.add(ground);
    }

    /* ----- lights ----- */
    scene.add(new THREE.HemisphereLight(pal.ambient, pal.ground, 0.55));
    const key = new THREE.DirectionalLight(0xfff1c4, 0.95);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6aa7ff, 0.35);
    fill.position.set(-5, 3, 2);
    scene.add(fill);

    /* ----- fighters ----- */
    function addFighter(cls: string, side: 'hero' | 'foe'): { sprite: THREE.Sprite; light: THREE.PointLight } {
      const tint = CLASS_TINT[cls] || CLASS_TINT.warrior;
      const tex = classSpriteTexture(cls, tint);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, fog: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.2, 2.75, 1);
      sprite.position.set(side === 'hero' ? -2.2 : 2.2, 1.4, 0);
      scene.add(sprite);
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
    heroLightRef.current = heroPair.light;
    foeLightRef.current = foePair.light;

    /* ----- optional Blender GLB rig swap -----
       Drop /public/assets/characters/<class>.glb to override the sprite.
       The sprite stays as a fallback so the game ships without art deps. */
    const loader = new GLTFLoader();
    const tryLoadRig = (cls: string, side: 'hero' | 'foe') => {
      const url = `/assets/characters/${cls}.glb`;
      loader.load(url, (gltf) => {
        const model = gltf.scene;
        model.position.set(side === 'hero' ? -2.2 : 2.2, 0, 0);
        model.rotation.y = side === 'hero' ? Math.PI / 6 : -Math.PI / 6;
        model.scale.setScalar(1.0);
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
        });
        scene.add(model);
        // Hide the procedural sprite once the rig loads
        const pair = side === 'hero' ? heroPair : foePair;
        pair.sprite.material.opacity = 0;
        if (side === 'hero') heroRigRef.current = model; else foeRigRef.current = model;
      }, undefined, () => { /* no asset → silently keep sprite */ });
    };
    tryLoadRig(heroClass, 'hero');
    tryLoadRig(foeClass, 'foe');

    /* ----- particle system ----- */
    const MAX_P = 1200;
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

    /* ----- particle helpers ----- */
    // Hoisted scratch Color so spawn loops don't allocate ~110 fresh
    // THREE.Color instances per crit burst.
    const tmpColor = new THREE.Color();
    function spawnAmbient(dt: number) {
      if (Math.random() > dt * 6) return;
      const p = particlesRef.current!;
      const slot = (p.alive++ % MAX_P);
      const idx = slot * 3;
      // If the slot was dead, we're growing the live count by one;
      // if not, we're recycling and the count stays the same.
      if (p.lives[slot] >= p.maxLives[slot]) liveParticleCount++;
      p.positions[idx] = (Math.random() - 0.5) * 9;
      p.positions[idx + 1] = -0.5;
      p.positions[idx + 2] = (Math.random() - 0.5) * 4 - 1;
      p.velocities[idx] = (Math.random() - 0.5) * 0.2;
      p.velocities[idx + 1] = 0.6 + Math.random() * 0.4;
      p.velocities[idx + 2] = (Math.random() - 0.5) * 0.1;
      tmpColor.set(Math.random() > 0.5 ? 0xffd34d : 0xff7c4d);
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
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    /* ----- main loop ----- */
    let last = performance.now();
    function tick(now: number) {
      const rawDt = Math.min(0.05, (now - last) / 1000);
      last = now;

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
          mat.opacity = (1 - k) * 0.55;
        }
        if (ud.life >= ud.max) {
          fg.remove(obj);
          (obj as any).geometry?.dispose?.();
          mat.dispose?.();
        }
      }

      // Animation state
      const a = animRef.current; a.t += dt;
      const h = heroRef.current!, f = foeRef.current!;
      const hl = heroLightRef.current!, fl = foeLightRef.current!;
      hl.intensity = Math.max(0, hl.intensity - dt * 8);
      fl.intensity = Math.max(0, fl.intensity - dt * 8);

      function ease(t: number, k: number) { return 1 - Math.pow(1 - t, k); }
      if (a.kind === 'windup-hero') {
        const k = Math.min(1, a.t / 0.25);
        h.position.x = -2.2 - 0.6 * ease(k, 3);
        h.material.rotation = -0.18 * ease(k, 3);
        if (k >= 1) { a.kind = 'lunge-hero'; a.t = 0; }
      } else if (a.kind === 'lunge-hero') {
        const k = Math.min(1, a.t / 0.32);
        const eased = ease(k, 2);
        h.position.x = -2.2 - 0.6 + 4.0 * eased;
        h.scale.x = 2.2 + 0.55 * (1 - Math.abs(2 * eased - 1));
        h.material.rotation = -0.18 + 0.4 * eased;
        if (k >= 0.5 && !a.didImpact) {
          a.didImpact = true;
          fireImpact('hero', a);
        }
        if (k >= 1) { a.kind = 'idle'; h.position.x = -2.2; h.scale.x = 2.2; h.material.rotation = 0; }
      } else if (a.kind === 'windup-foe') {
        const k = Math.min(1, a.t / 0.25);
        f.position.x = 2.2 + 0.6 * ease(k, 3);
        f.material.rotation = 0.18 * ease(k, 3);
        if (k >= 1) { a.kind = 'lunge-foe'; a.t = 0; }
      } else if (a.kind === 'lunge-foe') {
        const k = Math.min(1, a.t / 0.32);
        const eased = ease(k, 2);
        f.position.x = 2.2 + 0.6 - 4.0 * eased;
        f.scale.x = 2.2 + 0.55 * (1 - Math.abs(2 * eased - 1));
        f.material.rotation = 0.18 - 0.4 * eased;
        if (k >= 0.5 && !a.didImpact) {
          a.didImpact = true;
          fireImpact('foe', a);
        }
        if (k >= 1) { a.kind = 'idle'; f.position.x = 2.2; f.scale.x = 2.2; f.material.rotation = 0; }
      } else if (a.kind === 'defeated-hero') {
        const k = Math.min(1, a.t / 1.0);
        h.position.y = 1.4 - 1.0 * ease(k, 2);
        h.material.rotation = -0.9 * ease(k, 2);
        h.material.opacity = 1 - 0.6 * k;
      } else if (a.kind === 'defeated-foe') {
        const k = Math.min(1, a.t / 1.0);
        f.position.y = 1.4 - 1.0 * ease(k, 2);
        f.material.rotation = 0.9 * ease(k, 2);
        f.material.opacity = 1 - 0.6 * k;
      } else {
        h.position.y = 1.4 + Math.sin(now * 0.0014) * 0.04;
        f.position.y = 1.4 + Math.sin(now * 0.0014 + 1.6) * 0.04;
      }

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
      cam.position.x += (camTargetX + shakeX - cam.position.x) * lerpK;
      cam.position.y += (camTargetY + shakeY - cam.position.y) * lerpK;
      cam.position.z += (camTargetZ - cam.position.z) * Math.min(1, rawDt * 4);
      // Dolly-zoom FOV lerp
      cam.fov += (camTargetFov - cam.fov) * Math.min(1, rawDt * 5);
      cam.updateProjectionMatrix();
      cam.lookAt(camAnchorRef.current.lx, camAnchorRef.current.ly, camAnchorRef.current.lz);

      // Bloom pulse on heavy hits — driven by anim flag
      if (a.bloomKick && a.bloomKick > 0) {
        bloom.strength = 0.55 + a.bloomKick * 0.7;
        rgbShift.uniforms['amount'].value = 0.0018 + a.bloomKick * 0.0035;
        a.bloomKick = Math.max(0, a.bloomKick - rawDt * 3);
      } else {
        bloom.strength += (0.55 - bloom.strength) * Math.min(1, rawDt * 4);
        rgbShift.uniforms['amount'].value += (0.0018 - rgbShift.uniforms['amount'].value) * Math.min(1, rawDt * 4);
      }

      composer.render();
      rafRef.current = requestAnimationFrame(tick);
    }

    /** Handles impact bookkeeping for both sides — particle bursts, light flashes,
     *  shockwave/magic/arrow signature VFX, camera shake, dolly-zoom on crits. */
    function fireImpact(attacker: 'hero' | 'foe', a: any) {
      const isHero = attacker === 'hero';
      const target = isHero ? foeRef.current! : heroRef.current!;
      const targetLight = isHero ? foeLightRef.current! : heroLightRef.current!;
      const color = a.color || 0xffd34d;
      const tx = target.position.x;
      const tz = target.position.z;

      // Core burst + rim flash
      targetLight.intensity = a.crit ? 7 : 3;
      vfxRef.current?.burst(tx + (isHero ? -0.4 : 0.4), target.position.y, tz, color, a.crit ? 110 : 50, a.crit ? 1.7 : 1.15);

      // Signature VFX per effect.
      const effect = a.effect as string | undefined;
      const attackerSprite = isHero ? heroRef.current! : foeRef.current!;
      if (effect === 'magic') {
        vfxRef.current?.magicCircle(tx, tz, color);
      } else if (effect === 'arrow') {
        vfxRef.current?.arrowStreak(attackerSprite.position.x, tx, color);
      } else if (effect === 'pierce') {
        vfxRef.current?.afterImage(attackerSprite);
      } else {
        // slash (default)
        vfxRef.current?.slashArc(attackerSprite.position.x, tx, color);
      }
      // Every impact lands a ground shockwave under the target.
      vfxRef.current?.shockwave(tx, tz, color);

      // Cinematic punch: shake, hit-stop, slow-mo on crits, dolly-zoom + bloom kick.
      shakeRef.current = { amount: a.crit ? 0.32 : 0.16, t: 0.40 };
      a.bloomKick = a.crit ? 1.4 : 0.55;
      if (a.crit) {
        hitStopRef.current = 0.085;          // ~5 frame freeze at 60fps
        timeScaleRef.current = 0.35;         // slow-mo until eased back to 1×
        camAnchorRef.current.z = 6.4;        // push camera in (Hitchcock)
        camAnchorRef.current.fov = 54;       // widen FOV → dolly-zoom feel
      } else {
        camAnchorRef.current.z = 7.2;
        camAnchorRef.current.fov = 42;
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      composer.dispose();
      renderer.dispose();
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
      try { mount.removeChild(renderer.domElement); } catch {}
    };
  }, [heroClass, foeClass, region]);

  useImperativeHandle(ref, () => ({
    attack({ attacker, effect, crit, damageRatio = 0.3, missed, dodged }) {
      const color = effect === 'magic' ? 0xc294ff : effect === 'arrow' ? 0x9ad9ff : effect === 'pierce' ? 0xffe7a8 : 0xffd34d;
      animRef.current = { kind: attacker === 'hero' ? 'windup-hero' : 'windup-foe', t: 0, color, crit: !!crit, effect, didImpact: false };
      // Pre-position camera for the lunge (overridden again on impact).
      if ((damageRatio || 0) > 0.25 || crit) { camAnchorRef.current.z = 7.0; }
      else camAnchorRef.current.z = 8.0;
      camAnchorRef.current.fov = 42;
      if (missed || dodged) shakeRef.current = { amount: 0.05, t: 0.18 };
    },
    defeat(side) {
      animRef.current = { kind: side === 'hero' ? 'defeated-hero' : 'defeated-foe', t: 0 };
      camAnchorRef.current.z = 6.8;
      camAnchorRef.current.fov = 38; // tight tele-lens for the death beat
    },
    resetCamera() {
      camAnchorRef.current = { x: 0, y: 2.4, z: 8.0, lx: 0, ly: 1.4, lz: 0, fov: 42 };
      introRef.current = { t: 0, dur: 1.4, active: true };
    },
  }));

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} aria-hidden />;
});

export default CombatScene3D;
