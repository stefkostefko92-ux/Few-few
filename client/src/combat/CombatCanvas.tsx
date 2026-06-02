import React, { useEffect, useImperativeHandle, useRef } from 'react';

/**
 * High-end Canvas 2D particle layer that overlays the combat stage.
 *
 * Why Canvas2D over SVG/CSS:
 *  - Real particle physics (velocity + drag + gravity + alpha decay)
 *    instead of per-element CSS keyframes. Thousands of particles cost
 *    nothing because they're never in the DOM.
 *  - Additive blending (globalCompositeOperation = 'lighter') gives true
 *    hot-spot lighting that CSS can't replicate.
 *  - One device-pixel-correct framebuffer scales with DPR for crisp
 *    rendering on retina displays without per-element layout cost.
 *
 * The parent fires effects via a ref:
 *
 *   const fx = useRef<CombatCanvasHandle>(null);
 *   fx.current?.burst({ x, y, color, count: 32, intensity: 2 });
 *
 * Effects are scheduled into a small pool; the canvas runs a single
 * rAF loop that ticks every particle and draws everything in one pass.
 * When the pool is empty the loop suspends itself.
 */

export interface BurstOpts {
  /** Hit point in stage-relative pixel coords. */
  x: number;
  y: number;
  /** Base hex like '#ffd34d'. */
  color: string;
  /** How many spark particles to spawn. Default 28. */
  count?: number;
  /** 0.5..3 — scales velocity, size, and shockwave radius. */
  intensity?: number;
  /** Optional motion-blur trail kind. */
  kind?: 'spark' | 'magic' | 'slash' | 'arrow';
}

export interface SlashOpts {
  /** Stroke center on the stage. */
  x: number;
  y: number;
  /** Stroke angle in radians (0 = →, π/4 = ↗). */
  angle: number;
  color: string;
  /** Arc length in pixels. */
  length?: number;
}

export interface FlashOpts {
  color?: string;
  /** 0..1 — how bright the full-stage flash is. */
  strength?: number;
}

export interface CombatCanvasHandle {
  burst: (o: BurstOpts) => void;
  slash: (o: SlashOpts) => void;
  shockwave: (o: { x: number; y: number; color: string; intensity?: number }) => void;
  flash: (o: FlashOpts) => void;
}

/* ---------- internal particle model ---------- */

type ParticleKind = 'spark' | 'ember' | 'mote' | 'ring' | 'slash';
interface Particle {
  alive: boolean;
  kind: ParticleKind;
  x: number; y: number;
  vx: number; vy: number;
  ax: number; ay: number;       // accel (gravity etc.)
  drag: number;                 // 0..1 multiplier per second
  life: number; maxLife: number;
  size: number;
  rot: number; vrot: number;
  color: string;
  alpha: number;
  comp: GlobalCompositeOperation; // additive vs source-over
  trail: { x: number; y: number; a: number }[];
}

const POOL_SIZE = 1200;

function makeParticle(): Particle {
  return {
    alive: false, kind: 'spark',
    x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0,
    life: 0, maxLife: 0, size: 0, rot: 0, vrot: 0,
    color: '#fff', alpha: 1, comp: 'lighter', trail: [],
  };
}

function spawn(p: Particle, init: Partial<Particle>) {
  Object.assign(p, init);
  p.alive = true;
  p.life = 0;
  p.alpha = 1;
  p.trail = [];
}

interface Props {
  /** Defaults to the parent's content-box; should size with combat-field. */
  className?: string;
}

const CombatCanvas = React.forwardRef<CombatCanvasHandle, Props>(({ className }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const flashRef = useRef<{ color: string; alpha: number } | null>(null);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });

  // ----- pool init -----
  useEffect(() => {
    poolRef.current = Array.from({ length: POOL_SIZE }, makeParticle);
  }, []);

  // ----- sizing (DPR aware) -----
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = c!.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      c!.width = Math.round(rect.width * dpr);
      c!.height = Math.round(rect.height * dpr);
      const ctx = c!.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    window.addEventListener('orientationchange', size);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', size); };
  }, []);

  // ----- rAF loop, only running when there's work -----
  function ensureLoop() {
    if (rafRef.current != null) return;
    lastTickRef.current = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - lastTickRef.current) / 1000);
      lastTickRef.current = t;
      const more = tick(dt);
      const c = canvasRef.current;
      if (c) draw(c);
      if (more) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function tick(dt: number): boolean {
    let any = false;
    const ps = poolRef.current;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.alive) continue;
      any = true;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; continue; }
      // Velocity verlet-lite
      p.vx = (p.vx + p.ax * dt) * (1 - p.drag * dt);
      p.vy = (p.vy + p.ay * dt) * (1 - p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      // Fade out: alpha follows a curve so the head stays bright then drops.
      const k = p.life / p.maxLife;
      p.alpha = (1 - k) * (1 - k);
      // Trail capture (every other frame to keep cost down).
      if (p.kind === 'spark' || p.kind === 'slash') {
        p.trail.push({ x: p.x, y: p.y, a: p.alpha });
        if (p.trail.length > 6) p.trail.shift();
      }
    }
    if (flashRef.current) {
      flashRef.current.alpha *= Math.exp(-dt * 6);
      if (flashRef.current.alpha < 0.01) flashRef.current = null;
      else any = true;
    }
    return any;
  }

  function draw(c: HTMLCanvasElement) {
    const ctx = c.getContext('2d')!;
    const { w, h } = sizeRef.current;
    ctx.clearRect(0, 0, w, h);

    // Two passes: source-over for ring/ember, lighter for sparks/motes/slash
    // so the additive ones build true hot-spot brightness.
    const ps = poolRef.current;

    // PASS 1 — source-over (rings, ember bodies)
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.alive || p.comp !== 'source-over') continue;
      drawParticle(ctx, p);
    }
    // PASS 2 — lighter (sparks, magic motes, slash strokes)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.alive || p.comp !== 'lighter') continue;
      drawParticle(ctx, p);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Full-stage flash, drawn last so it sits on top.
    if (flashRef.current) {
      ctx.fillStyle = flashRef.current.color;
      ctx.globalAlpha = flashRef.current.alpha;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    if (p.kind === 'ring') {
      // Expanding shockwave: radius grows with life.
      const r = p.size * (0.4 + p.life / p.maxLife * 6);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.5, 4 * (1 - p.life / p.maxLife));
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'slash') {
      // Smear: draw a fat translucent arc along the trail.
      if (p.trail.length >= 2) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke();
      }
    } else {
      // Spark / ember / mote — bright dot with trail and glow.
      if (p.kind === 'spark' && p.trail.length > 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let i = 1; i < p.trail.length; i++) ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
      g.addColorStop(0, p.color);
      g.addColorStop(0.4, p.color + 'aa');
      g.addColorStop(1, p.color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function findFree(): Particle | null {
    const ps = poolRef.current;
    for (let i = 0; i < ps.length; i++) if (!ps[i].alive) return ps[i];
    return null;
  }

  // ---------- imperative API ----------
  useImperativeHandle(ref, () => ({
    burst({ x, y, color, count = 28, intensity = 1, kind = 'spark' }: BurstOpts) {
      // Sparks fly in all directions with falloff drag.
      for (let i = 0; i < count; i++) {
        const p = findFree(); if (!p) break;
        const a = Math.random() * Math.PI * 2;
        const speed = (140 + Math.random() * 240) * intensity;
        spawn(p, {
          kind: 'spark',
          x, y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 80 * intensity,
          ax: 0, ay: 420 * intensity, drag: 1.2,
          size: 1.6 + Math.random() * 2.4 * intensity,
          maxLife: 0.55 + Math.random() * 0.4,
          color, comp: 'lighter',
          rot: 0, vrot: 0, alpha: 1, trail: [], life: 0, alive: true,
        });
      }
      // Inner bright "core" mote that punctuates the impact.
      const core = findFree();
      if (core) spawn(core, {
        kind: 'mote', x, y, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0,
        size: 18 * intensity, maxLife: 0.35,
        color, comp: 'lighter',
        rot: 0, vrot: 0, alpha: 1, trail: [], life: 0, alive: true,
      });
      // Expanding shockwave ring.
      this.shockwave({ x, y, color, intensity });
      // Tiny full-stage flash on heavy hits.
      if (intensity >= 1.6) this.flash({ color, strength: 0.18 * (intensity - 1) });
      ensureLoop();
    },

    slash({ x, y, angle, color, length = 110 }: SlashOpts) {
      // Smear a single big trail particle along the slash direction.
      const p = findFree(); if (!p) return;
      const speed = length / 0.18;
      spawn(p, {
        kind: 'slash',
        x: x - Math.cos(angle) * length * 0.5,
        y: y - Math.sin(angle) * length * 0.5,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        ax: 0, ay: 0, drag: 0,
        size: 14, maxLife: 0.22,
        color, comp: 'lighter',
        rot: 0, vrot: 0, alpha: 1, trail: [], life: 0, alive: true,
      });
      ensureLoop();
    },

    shockwave({ x, y, color, intensity = 1 }: { x: number; y: number; color: string; intensity?: number }) {
      const p = findFree(); if (!p) return;
      spawn(p, {
        kind: 'ring', x, y, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0,
        size: 12 * intensity, maxLife: 0.55,
        color, comp: 'source-over',
        rot: 0, vrot: 0, alpha: 1, trail: [], life: 0, alive: true,
      });
      ensureLoop();
    },

    flash({ color = '#ffe7a8', strength = 0.4 }: FlashOpts) {
      flashRef.current = { color, alpha: Math.min(1, strength) };
      ensureLoop();
    },
  }));

  // ----- ambient embers — a few slow upward motes for atmosphere -----
  useEffect(() => {
    const id = setInterval(() => {
      const { w, h } = sizeRef.current;
      if (!w || !h) return;
      const p = findFree(); if (!p) return;
      spawn(p, {
        kind: 'ember', x: Math.random() * w, y: h + 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -(18 + Math.random() * 24),
        ax: 0, ay: -4, drag: 0.05,
        size: 1.2 + Math.random() * 1.4,
        maxLife: 3.2 + Math.random() * 1.6,
        color: Math.random() > 0.6 ? '#ffd34d' : '#ff7c4d',
        comp: 'lighter',
        rot: 0, vrot: 0, alpha: 1, trail: [], life: 0, alive: true,
      });
      ensureLoop();
    }, 280);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className || 'combat-canvas'}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9 }}
      aria-hidden
    />
  );
});

export default CombatCanvas;
