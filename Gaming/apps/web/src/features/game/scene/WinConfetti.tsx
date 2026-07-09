import { useEffect, useRef } from "react";

/**
 * Brass confetti burst for the win moment (Дизайнера #6). A single 2D canvas
 * overlay — works over every game view (DOM and WebGL alike), zero deps, ~2s
 * life, then removes itself. Fully skipped under reduced motion (OS media query
 * AND the in-app toggle) — the static punch-card + sparks remain the fallback.
 */

const PALETTE = ["#d9b25f", "#e8c531", "#f6f1e4", "#b98a2f", "#fff3d8"];
const COUNT = 340;
const LIFE_MS = 2300;

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  drag: number;
}

function reducedMotion(): boolean {
  return (
    (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false) ||
    document.documentElement.dataset.reducedMotion === "true"
  );
}

export function WinConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Two bursts from the lower corners arcing over the verdict card.
    const parts: P[] = [];
    for (let i = 0; i < COUNT; i++) {
      const left = i % 2 === 0;
      parts.push({
        x: left ? W * 0.1 : W * 0.9,
        y: H * 0.82,
        // two fountains arcing inward over the verdict card
        vx: (left ? 1 : -1) * (2.5 + Math.random() * 9) + (Math.random() - 0.5) * 4,
        vy: -(9 + Math.random() * 13),
        w: 3 + Math.random() * 5,
        h: 6 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: PALETTE[i % PALETTE.length]!,
        drag: 0.985 - Math.random() * 0.01,
      });
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - start) / LIFE_MS;
      ctx.clearRect(0, 0, W, H);
      if (t >= 1) return; // done — leave the canvas clear
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      for (const p of parts) {
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + 0.34; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // Fake 3D tumble: width oscillates with rotation for a foil-flip shimmer.
        ctx.fillStyle = p.color;
        ctx.fillRect((-p.w / 2) * Math.abs(Math.cos(p.rot * 2)), -p.h / 2, p.w * Math.abs(Math.cos(p.rot * 2)), p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (reducedMotion()) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 60 }}
    />
  );
}
