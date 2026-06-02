import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Per-page animated backdrop, fixed-position behind the app shell.
 *
 * A single full-viewport <canvas> picks a "scene" from the current route
 * and runs the matching ambient renderer. Every scene is GPU-friendly
 * Canvas2D:
 *
 *   forge       — rising sparks + heat shimmer
 *   tower       — slow vortex of motes converging on the centre
 *   camp        — drifting blue-grey smoke + warm fireflies
 *   auction     — falling gold dust through soft volumetric beams
 *   bounty      — drifting red embers, slight blood-mist haze
 *   market      — gentle floating coins
 *   stables     — long horizontal wind streaks
 *   recipe      — alchemical bubbles
 *   trialcache  — purple plasma motes
 *   battlepass  — slow shooting stars
 *   guild       — heraldic banner ripple
 *   world/realm — drifting parchment-coloured clouds
 *   default     — gentle gold/amethyst dust
 *
 * The renderer steps at requestAnimationFrame, but only paints if the
 * document is visible — so backgrounded tabs don't burn CPU.
 */

type Scene =
  | 'forge' | 'tower' | 'camp' | 'auction' | 'bounty'
  | 'market' | 'stables' | 'recipe' | 'trialcache'
  | 'battlepass' | 'guild' | 'world' | 'default';

function sceneFor(pathname: string): Scene {
  if (pathname.startsWith('/app/forge'))        return 'forge';
  if (pathname.startsWith('/app/tower'))        return 'tower';
  if (pathname.startsWith('/app/camp'))         return 'camp';
  if (pathname.startsWith('/app/auction'))      return 'auction';
  if (pathname.startsWith('/app/bounties'))     return 'bounty';
  if (pathname.startsWith('/app/market'))       return 'market';
  if (pathname.startsWith('/app/stables'))      return 'stables';
  if (pathname.startsWith('/app/recipes'))      return 'recipe';
  if (pathname.startsWith('/app/trial-cache'))  return 'trialcache';
  if (pathname.startsWith('/app/battlepass'))   return 'battlepass';
  if (pathname.startsWith('/app/guild'))        return 'guild';
  if (pathname.startsWith('/app/world')
      || pathname.startsWith('/app/quests'))    return 'world';
  return 'default';
}

const TINT: Record<Scene, string> = {
  forge:       'radial-gradient(ellipse at 50% 100%, rgba(255,120,40,.20), transparent 60%), linear-gradient(180deg,#100806 0%, #0a0608 60%)',
  tower:       'radial-gradient(circle at 50% 30%, rgba(194,148,255,.22), transparent 55%), linear-gradient(180deg,#0a0e1a 0%, #06070d 60%)',
  camp:        'radial-gradient(ellipse at 50% 85%, rgba(255,170,90,.16), transparent 55%), linear-gradient(180deg,#0a0c14 0%, #06080d 60%)',
  auction:     'radial-gradient(ellipse at 50% 40%, rgba(255,232,138,.18), transparent 55%), linear-gradient(180deg,#0d0b08 0%, #07060a 60%)',
  bounty:      'radial-gradient(ellipse at 50% 100%, rgba(232,90,79,.18), transparent 60%), linear-gradient(180deg,#100808 0%, #0a0608 60%)',
  market:      'radial-gradient(ellipse at 50% 80%, rgba(214,161,61,.13), transparent 50%), linear-gradient(180deg,#0b0d12 0%, #07080c 60%)',
  stables:     'radial-gradient(ellipse at 50% 60%, rgba(106,167,255,.13), transparent 50%), linear-gradient(180deg,#0b0e16 0%, #07080d 60%)',
  recipe:      'radial-gradient(ellipse at 50% 70%, rgba(106,216,164,.18), transparent 55%), linear-gradient(180deg,#08120e 0%, #050a07 60%)',
  trialcache:  'radial-gradient(ellipse at 30% 30%, rgba(194,148,255,.22), transparent 55%), linear-gradient(180deg,#0b0716 0%, #06040c 60%)',
  battlepass:  'radial-gradient(circle at 80% 20%, rgba(106,167,255,.20), transparent 55%), linear-gradient(180deg,#070b14 0%, #05070d 60%)',
  guild:       'radial-gradient(ellipse at 50% 50%, rgba(214,161,61,.12), transparent 50%), linear-gradient(180deg,#0c0a06 0%, #07060a 60%)',
  world:       'radial-gradient(ellipse at 50% 60%, rgba(255,232,138,.10), transparent 50%), linear-gradient(180deg,#0a0a0e 0%, #06070b 60%)',
  default:     'radial-gradient(ellipse at 50% 50%, rgba(214,161,61,.08), transparent 55%), linear-gradient(180deg,#080a0f 0%, #05070b 60%)',
};

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  life: number; maxLife: number;
  color: string;
  rot: number; vrot: number;
}

export default function PageBackdrop(): React.ReactElement {
  const { pathname } = useLocation();
  const sceneRef = useRef<Scene>(sceneFor(pathname));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastSpawnRef = useRef<number>(0);

  // Update scene without remounting the canvas, so the background fades.
  useEffect(() => { sceneRef.current = sceneFor(pathname); }, [pathname]);

  useEffect(() => {
    const c = canvasRef.current!;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      step(dt, now);
      draw();
    }

    function spawn(scene: Scene, now: number) {
      const ps = particlesRef.current;
      // Rate per scene
      const rates: Record<Scene, number> = {
        forge: 50, tower: 35, camp: 18, auction: 22, bounty: 30,
        market: 14, stables: 10, recipe: 22, trialcache: 35, battlepass: 6,
        guild: 10, world: 8, default: 10,
      };
      const want = rates[scene];
      const elapsed = (now - lastSpawnRef.current) / 1000;
      if (elapsed < 1 / want) return;
      lastSpawnRef.current = now;
      const p: Particle = createForScene(scene, w, h);
      ps.push(p);
      if (ps.length > 220) ps.shift();
    }

    function step(dt: number, now: number) {
      spawn(sceneRef.current, now);
      const ps = particlesRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.maxLife) { ps.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        // Scene-specific gentle drag / wind
        if (sceneRef.current === 'stables') p.vx += 12 * dt;          // wind
        if (sceneRef.current === 'tower')   { // converge on centre
          p.vx += (w/2 - p.x) * 0.02 * dt;
          p.vy += (h*0.4 - p.y) * 0.02 * dt;
        }
        if (sceneRef.current === 'camp' && p.color.includes('255,180')) p.vy -= 8 * dt; // smoke rises
      }
    }

    function draw() {
      const ctx = c.getContext('2d')!;
      // Subtle global fade so particles tail across frames (mild trail)
      ctx.fillStyle = 'rgba(0,0,0,.06)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const ps = particlesRef.current;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const k = p.life / p.maxLife;
        const alpha = (1 - k) * (1 - k);
        ctx.globalAlpha = alpha;
        // Render as a soft radial glow
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        g.addColorStop(0, p.color);
        g.addColorStop(1, p.color.replace(/,1\)$/, ',0)').replace(/,(\d*\.?\d+)\)$/, (_, a) => `,0)`));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, []);

  // The CSS gradient backdrop sits beneath the canvas, cross-fading on
  // route change. Setting `background` directly on the wrapper gives us a
  // smooth transition for free.
  const tint = TINT[sceneFor(pathname)] || TINT.default;
  return (
    <div
      className="page-backdrop"
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        background: tint,
        transition: 'background 800ms ease-in-out',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </div>
  );
}

function createForScene(scene: Scene, w: number, h: number): Particle {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  switch (scene) {
    case 'forge':
      return {
        x: rand(0, w), y: h + 10,
        vx: rand(-20, 20), vy: rand(-160, -80),
        size: rand(1, 3),
        life: 0, maxLife: rand(2, 3.5),
        color: Math.random() > 0.5 ? 'rgba(255,180,80,1)' : 'rgba(255,90,40,1)',
        rot: 0, vrot: 0,
      };
    case 'tower':
      return {
        x: rand(0, w), y: rand(0, h),
        vx: rand(-30, 30), vy: rand(-30, 30),
        size: rand(1.5, 3.5),
        life: 0, maxLife: rand(3, 4.5),
        color: 'rgba(194,148,255,1)', rot: 0, vrot: 0,
      };
    case 'camp':
      return {
        x: rand(0, w), y: rand(h * 0.7, h + 20),
        vx: rand(-10, 10), vy: rand(-30, -10),
        size: rand(1, 2.5),
        life: 0, maxLife: rand(3, 5),
        color: Math.random() > 0.5 ? 'rgba(255,180,90,1)' : 'rgba(180,160,170,0.4)',
        rot: 0, vrot: 0,
      };
    case 'auction':
      return {
        x: rand(0, w), y: -10,
        vx: rand(-5, 5), vy: rand(40, 90),
        size: rand(1.5, 3),
        life: 0, maxLife: rand(3, 6),
        color: 'rgba(255,232,138,1)', rot: 0, vrot: 0,
      };
    case 'bounty':
      return {
        x: rand(0, w), y: h + 10,
        vx: rand(-20, 20), vy: rand(-120, -50),
        size: rand(1.5, 3),
        life: 0, maxLife: rand(2, 4),
        color: 'rgba(232,90,79,1)', rot: 0, vrot: 0,
      };
    case 'market':
      return {
        x: rand(0, w), y: rand(0, h),
        vx: rand(-10, 10), vy: rand(-20, -5),
        size: rand(2, 4),
        life: 0, maxLife: rand(3, 5),
        color: 'rgba(214,161,61,1)', rot: 0, vrot: 0,
      };
    case 'stables':
      return {
        x: -20, y: rand(h * 0.2, h * 0.85),
        vx: rand(120, 200), vy: rand(-6, 6),
        size: rand(1, 2),
        life: 0, maxLife: rand(3, 5),
        color: 'rgba(180,200,220,1)', rot: 0, vrot: 0,
      };
    case 'recipe':
      return {
        x: rand(0, w), y: h + 10,
        vx: rand(-8, 8), vy: rand(-60, -30),
        size: rand(2, 4),
        life: 0, maxLife: rand(2, 4),
        color: 'rgba(106,216,164,1)', rot: 0, vrot: 0,
      };
    case 'trialcache':
      return {
        x: rand(0, w), y: rand(0, h),
        vx: rand(-20, 20), vy: rand(-20, 20),
        size: rand(1.5, 3),
        life: 0, maxLife: rand(2.5, 4),
        color: 'rgba(194,148,255,1)', rot: 0, vrot: 0,
      };
    case 'battlepass':
      return {
        x: rand(w * 0.6, w + 50), y: rand(-10, h * 0.4),
        vx: rand(-280, -160), vy: rand(80, 160),
        size: rand(1.5, 3),
        life: 0, maxLife: rand(1.4, 2),
        color: 'rgba(180,220,255,1)', rot: 0, vrot: 0,
      };
    case 'guild':
      return {
        x: rand(0, w), y: rand(0, h),
        vx: rand(-6, 6), vy: rand(-10, -2),
        size: rand(1.5, 3),
        life: 0, maxLife: rand(3, 5),
        color: 'rgba(214,161,61,1)', rot: 0, vrot: 0,
      };
    case 'world':
      return {
        x: -30, y: rand(h * 0.1, h * 0.6),
        vx: rand(15, 35), vy: rand(-3, 3),
        size: rand(8, 16),
        life: 0, maxLife: rand(20, 32),
        color: 'rgba(240,220,180,1)', rot: 0, vrot: 0,
      };
    default:
      return {
        x: rand(0, w), y: rand(0, h),
        vx: rand(-10, 10), vy: rand(-15, -5),
        size: rand(1.5, 3),
        life: 0, maxLife: rand(3, 6),
        color: Math.random() > 0.5 ? 'rgba(214,161,61,1)' : 'rgba(194,148,255,1)',
        rot: 0, vrot: 0,
      };
  }
}
