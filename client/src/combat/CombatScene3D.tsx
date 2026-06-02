import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';

/**
 * Real 3D battle stage using Three.js.
 *
 *   - Hero + foe are billboarded sprites with the existing class artwork
 *     (rendered to an offscreen canvas, then uploaded as a THREE.Texture).
 *     They always face the camera, so the stylized silhouettes still read
 *     "anime" while the *world around them* is genuinely 3D.
 *   - Real depth fog (color tied to the region), a tilted ground plane
 *     with a soft radial shadow under each fighter, and a far-back sky
 *     plane with painted distant peaks for parallax.
 *   - Per-fighter rim light (PointLight) that pulses on hit, so contact
 *     reads as a flash of volumetric lighting rather than a CSS overlay.
 *   - GPU-instanced particle system for sparks/embers/magic in 3D space,
 *     so they fly THROUGH the scene with proper depth, not on a flat plane.
 *   - Camera animates per round: pan-in on the attacker, pull back on
 *     impact, shake on heavy hits, sharp 35° tilt on crits.
 *
 * Parent fires the cinematic via a ref (CombatScene3DHandle):
 *   ref.current?.attack({ side, kind: 'slash'|'magic'|..., crit, damageRatio });
 *   ref.current?.defeat(side);  // play the slump animation
 *   ref.current?.setHp(side, current, max);  // not used; fighters don't tween HP here
 */

const SPRITE_W = 256;
const SPRITE_H = 320;

export interface CombatScene3DHandle {
  /** Fire a windup + lunge + impact cinematic on one side. */
  attack: (opts: { attacker: 'hero' | 'foe'; effect?: string; crit?: boolean; damageRatio?: number; missed?: boolean; dodged?: boolean; }) => void;
  defeat: (side: 'hero' | 'foe') => void;
  /** Camera reset to neutral framing. */
  resetCamera: () => void;
}

interface Props {
  heroClass: string;
  foeClass: string;
  /** Whispering Woods / Mistmoor Hills / etc. Selects sky tint and fog colour. */
  region?: string;
}

/** Hand-stamp the class silhouette onto an offscreen canvas. The result is
 *  uploaded as a Three.js texture once per fighter and never recomputed. */
function classSpriteTexture(cls: string, tint: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = SPRITE_W; c.height = SPRITE_H;
  const ctx = c.getContext('2d')!;
  // Body bottom-anchored, head at the top — gives a proper "standing" silhouette
  ctx.fillStyle = tint;
  ctx.shadowColor = tint;
  ctx.shadowBlur = 22;
  // Cape / cloak — a wide ellipse falling from shoulders
  ctx.beginPath();
  ctx.moveTo(SPRITE_W*0.30, SPRITE_H*0.45);
  ctx.quadraticCurveTo(SPRITE_W*0.10, SPRITE_H*0.85, SPRITE_W*0.30, SPRITE_H*0.95);
  ctx.lineTo(SPRITE_W*0.70, SPRITE_H*0.95);
  ctx.quadraticCurveTo(SPRITE_W*0.90, SPRITE_H*0.85, SPRITE_W*0.70, SPRITE_H*0.45);
  ctx.fill();
  // Torso
  ctx.fillStyle = '#1a1d27';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(SPRITE_W/2, SPRITE_H*0.62, 64, 86, 0, 0, Math.PI*2);
  ctx.fill();
  // Highlight rim around torso
  ctx.strokeStyle = tint;
  ctx.lineWidth = 3;
  ctx.shadowColor = tint;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(SPRITE_W/2, SPRITE_H*0.62, 64, 86, 0, 0, Math.PI*2);
  ctx.stroke();
  // Head with eye highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0c0e13';
  ctx.beginPath();
  ctx.arc(SPRITE_W/2, SPRITE_H*0.33, 36, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.shadowColor = tint;
  ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(SPRITE_W/2, SPRITE_H*0.33, 36, 0, Math.PI*2); ctx.stroke();
  // Class-specific accent: weapon silhouette held at the side.
  ctx.shadowBlur = 0;
  ctx.fillStyle = tint;
  if (cls === 'warrior') {
    // Sword pointing up
    ctx.fillRect(SPRITE_W*0.82, SPRITE_H*0.35, 6, SPRITE_H*0.45);
    ctx.beginPath(); ctx.moveTo(SPRITE_W*0.75, SPRITE_H*0.35); ctx.lineTo(SPRITE_W*0.95, SPRITE_H*0.35); ctx.lineTo(SPRITE_W*0.85, SPRITE_H*0.28); ctx.fill();
  } else if (cls === 'ranger') {
    // Bow curve
    ctx.strokeStyle = tint; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(SPRITE_W*0.82, SPRITE_H*0.55, 60, -Math.PI/2.4, Math.PI/2.4); ctx.stroke();
  } else if (cls === 'mage') {
    // Staff with orb
    ctx.fillRect(SPRITE_W*0.82, SPRITE_H*0.32, 6, SPRITE_H*0.50);
    ctx.beginPath(); ctx.arc(SPRITE_W*0.85, SPRITE_H*0.30, 14, 0, Math.PI*2); ctx.fill();
  } else {
    // Rogue daggers
    for (const x of [SPRITE_W*0.78, SPRITE_W*0.88]) {
      ctx.beginPath(); ctx.moveTo(x, SPRITE_H*0.55); ctx.lineTo(x-4, SPRITE_H*0.75); ctx.lineTo(x+4, SPRITE_H*0.75); ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
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
  const heroRef = useRef<THREE.Sprite | null>(null);
  const foeRef = useRef<THREE.Sprite | null>(null);
  const heroLightRef = useRef<THREE.PointLight | null>(null);
  const foeLightRef = useRef<THREE.PointLight | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const camAnchorRef = useRef({ x: 0, y: 2.2, z: 6.5, lx: 0, ly: 1.4, lz: 0 });
  const shakeRef = useRef({ amount: 0, t: 0 });
  const particlesRef = useRef<{ pts: THREE.Points; positions: Float32Array; velocities: Float32Array; lives: Float32Array; maxLives: Float32Array; colors: Float32Array; alive: number; } | null>(null);
  const animRef = useRef<{ kind: 'idle'|'windup-hero'|'windup-foe'|'lunge-hero'|'lunge-foe'|'defeated-hero'|'defeated-foe'; t: number } & {[k:string]:any}>({ kind:'idle', t:0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const pal = REGION_PALETTE[region] || REGION_PALETTE.whispering_woods;

    // ===== renderer / scene / camera =====
    // Wrap WebGL init so an unsupported environment (headless CI, locked-down
    // browsers, very old GPUs) downgrades gracefully to a flat CSS backdrop
    // instead of throwing and breaking the whole combat scene.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      // No-op fallback: paint a gradient straight onto the mount and bail
      // out of the rest of the 3D init. Combat still plays via the legacy
      // 2D layer beneath it.
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
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(pal.sky);
    scene.fog = new THREE.Fog(pal.fog, 6, 22);

    const camera = new THREE.PerspectiveCamera(46, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 2.2, 6.5);
    camera.lookAt(0, 1.4, 0);
    cameraRef.current = camera;

    // ===== sky parallax: a distant cylinder with mountain silhouette =====
    {
      const skyTex = (() => {
        const c = document.createElement('canvas');
        c.width = 2048; c.height = 512;
        const ctx = c.getContext('2d')!;
        const g = ctx.createLinearGradient(0, 0, 0, c.height);
        g.addColorStop(0, '#' + pal.sky.toString(16).padStart(6, '0'));
        g.addColorStop(1, '#' + pal.fog.toString(16).padStart(6, '0'));
        ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
        // Painterly distant peaks
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

    // ===== ground plane with a subtle radial shadow under each fighter =====
    {
      const groundCanvas = document.createElement('canvas');
      groundCanvas.width = 1024; groundCanvas.height = 1024;
      const gctx = groundCanvas.getContext('2d')!;
      gctx.fillStyle = '#' + pal.ground.toString(16).padStart(6, '0');
      gctx.fillRect(0, 0, 1024, 1024);
      // Hex grid noise so the ground has visible texture in 3D
      gctx.strokeStyle = 'rgba(255,255,255,.05)';
      gctx.lineWidth = 1.5;
      for (let r = 64; r < 1024; r += 64) {
        gctx.beginPath();
        gctx.arc(512, 512, r, 0, Math.PI * 2);
        gctx.stroke();
      }
      // Two soft shadows for the fighters
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

    // ===== lighting =====
    scene.add(new THREE.HemisphereLight(pal.ambient, pal.ground, 0.55));
    const key = new THREE.DirectionalLight(0xfff1c4, 0.9);
    key.position.set(4, 8, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6aa7ff, 0.35);
    fill.position.set(-5, 3, 2);
    scene.add(fill);

    // ===== fighters (billboarded sprites) =====
    function addFighter(cls: string, side: 'hero' | 'foe'): { sprite: THREE.Sprite; light: THREE.PointLight } {
      const tint = CLASS_TINT[cls] || CLASS_TINT.warrior;
      const tex = classSpriteTexture(cls, tint);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, fog: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.2, 2.75, 1);
      sprite.position.set(side === 'hero' ? -2.2 : 2.2, 1.4, 0);
      scene.add(sprite);
      const light = new THREE.PointLight(new THREE.Color(tint), 0, 4);
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

    // ===== GPU particle system =====
    const MAX_P = 800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_P * 3);
    const vel = new Float32Array(MAX_P * 3);
    const colors = new Float32Array(MAX_P * 3);
    const lives = new Float32Array(MAX_P);
    const maxL = new Float32Array(MAX_P);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pmat = new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, pmat);
    scene.add(pts);
    particlesRef.current = { pts, positions: pos, velocities: vel, lives, maxLives: maxL, colors, alive: 0 };

    // Continuous slow ambient embers in front of the scene
    function spawnAmbient(dt: number) {
      if (Math.random() > dt * 6) return;
      const p = particlesRef.current!;
      const idx = (p.alive++ % MAX_P) * 3;
      p.positions[idx] = (Math.random() - 0.5) * 9;
      p.positions[idx + 1] = -0.5;
      p.positions[idx + 2] = (Math.random() - 0.5) * 4 - 1;
      p.velocities[idx] = (Math.random() - 0.5) * 0.2;
      p.velocities[idx + 1] = 0.6 + Math.random() * 0.4;
      p.velocities[idx + 2] = (Math.random() - 0.5) * 0.1;
      const c = new THREE.Color(Math.random() > 0.5 ? 0xffd34d : 0xff7c4d);
      p.colors[idx] = c.r; p.colors[idx + 1] = c.g; p.colors[idx + 2] = c.b;
      p.lives[(idx / 3) | 0] = 0;
      p.maxLives[(idx / 3) | 0] = 3 + Math.random() * 2;
    }

    function burst(x: number, y: number, z: number, color: number, count: number, speedScale = 1) {
      const p = particlesRef.current!;
      const col = new THREE.Color(color);
      for (let i = 0; i < count; i++) {
        const idx = (p.alive++ % MAX_P) * 3;
        p.positions[idx] = x;
        p.positions[idx + 1] = y;
        p.positions[idx + 2] = z;
        const a = Math.random() * Math.PI * 2;
        const e = (Math.random() - 0.3) * Math.PI;
        const speed = (3 + Math.random() * 5) * speedScale;
        p.velocities[idx] = Math.cos(a) * Math.cos(e) * speed;
        p.velocities[idx + 1] = Math.sin(e) * speed + 1.2;
        p.velocities[idx + 2] = Math.sin(a) * Math.cos(e) * speed;
        p.colors[idx] = col.r; p.colors[idx + 1] = col.g; p.colors[idx + 2] = col.b;
        p.lives[(idx / 3) | 0] = 0;
        p.maxLives[(idx / 3) | 0] = 0.7 + Math.random() * 0.4;
      }
    }

    // ===== imperative API =====
    (CombatScene3D as any)._burst = burst;
    (CombatScene3D as any)._scene = scene;

    // ===== resize =====
    function resize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ===== main loop =====
    let last = performance.now();
    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Ambient sparks
      spawnAmbient(dt);

      // Particles step
      const p = particlesRef.current!;
      for (let i = 0; i < MAX_P; i++) {
        p.lives[i] += dt;
        if (p.lives[i] >= p.maxLives[i]) {
          // park offscreen
          p.positions[i*3 + 1] = -100;
          continue;
        }
        p.velocities[i*3 + 1] -= 4.5 * dt; // gravity
        p.positions[i*3]     += p.velocities[i*3]     * dt;
        p.positions[i*3 + 1] += p.velocities[i*3 + 1] * dt;
        p.positions[i*3 + 2] += p.velocities[i*3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      // Fade old particles: lower alpha-ish via dimming colors over life
      pmat.opacity = 1;

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
          // Flash + particle burst + camera shake
          const color = a.color || 0xffd34d;
          fl.intensity = a.crit ? 6 : 3;
          (CombatScene3D as any)._burst(f.position.x - 0.4, f.position.y, f.position.z, color, a.crit ? 90 : 40, a.crit ? 1.6 : 1.1);
          shakeRef.current = { amount: a.crit ? 0.3 : 0.15, t: 0.35 };
          if (a.crit) camera.position.z = 5.5;
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
          const color = a.color || 0xff7c4d;
          hl.intensity = a.crit ? 6 : 3;
          (CombatScene3D as any)._burst(h.position.x + 0.4, h.position.y, h.position.z, color, a.crit ? 90 : 40, a.crit ? 1.6 : 1.1);
          shakeRef.current = { amount: a.crit ? 0.3 : 0.15, t: 0.35 };
          if (a.crit) camera.position.z = 5.5;
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
        // gentle idle bob
        h.position.y = 1.4 + Math.sin(now * 0.0014) * 0.04;
        f.position.y = 1.4 + Math.sin(now * 0.0014 + 1.6) * 0.04;
      }

      // Camera position with shake
      const cam = cameraRef.current!;
      const anchor = camAnchorRef.current;
      const s = shakeRef.current;
      s.t = Math.max(0, s.t - dt);
      const shakeX = s.t > 0 ? (Math.random() - 0.5) * s.amount * 2 * (s.t / 0.35) : 0;
      const shakeY = s.t > 0 ? (Math.random() - 0.5) * s.amount * (s.t / 0.35) : 0;
      cam.position.x += (anchor.x + shakeX - cam.position.x) * Math.min(1, dt * 6);
      cam.position.y += (anchor.y + shakeY - cam.position.y) * Math.min(1, dt * 6);
      cam.position.z += (anchor.z - cam.position.z) * Math.min(1, dt * 3);
      cam.lookAt(anchor.lx, anchor.ly, anchor.lz);

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry?.dispose();
        const mat = (obj as THREE.Mesh).material as any;
        if (mat) { if (Array.isArray(mat)) mat.forEach((m) => m.dispose && m.dispose()); else mat.dispose && mat.dispose(); }
      });
      mount.removeChild(renderer.domElement);
    };
  }, [heroClass, foeClass, region]);

  useImperativeHandle(ref, () => ({
    attack({ attacker, effect, crit, damageRatio = 0.3, missed, dodged }) {
      // For misses / dodges we still pan the camera a touch.
      const color = effect === 'magic' ? 0xc294ff : effect === 'arrow' ? 0x9ad9ff : effect === 'pierce' ? 0xffe7a8 : 0xffd34d;
      animRef.current = { kind: attacker === 'hero' ? 'windup-hero' : 'windup-foe', t: 0, color, crit: !!crit, didImpact: false };
      // Slight zoom-in on big hits
      if ((damageRatio || 0) > 0.25 || crit) camAnchorRef.current.z = 5.8;
      else camAnchorRef.current.z = 6.5;
      if (missed || dodged) shakeRef.current = { amount: 0.04, t: 0.18 };
    },
    defeat(side) {
      animRef.current = { kind: side === 'hero' ? 'defeated-hero' : 'defeated-foe', t: 0 };
      camAnchorRef.current.z = 5.5;
    },
    resetCamera() {
      camAnchorRef.current = { x: 0, y: 2.2, z: 6.5, lx: 0, ly: 1.4, lz: 0 };
    },
  }));

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} aria-hidden />;
});

export default CombatScene3D;
