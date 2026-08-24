// frontend/src/components/SignalFunnel.jsx
//
// Canvas 2D replacement for the old inline-SVG "eight signals converge to
// one dot" funnel inside HeroConverge (Login.jsx / LandingLocalized.jsx).
// No SVG, no animated stroke-dashoffset hack: real particles travel along
// each bezier curve toward the core.
//
//   - `prefers-reduced-motion: reduce` → draws the static dashed curves +
//     core dot once and never starts a loop (belt-and-suspenders with the
//     app-wide CSS neutralizer in index.css).
//   - rAF loop skips drawing while `document.hidden`.
//   - `tops` must be the SAME array the caller uses to count/pair curves
//     with chips — no internal re-derivation, so the "N chips = N curves"
//     invariant (enforced by src/__tests__/landing.test.js) lives in one
//     place, not two.
import { useEffect, useRef } from "react";

const CS_CYAN = "#8fe600"; // must mirror tailwind.config.js cs.cyan

// Bezier matches the funnel's fixed 320×56 design space, scaled to the live
// canvas size on every draw — identical curve shape the old SVG path used
// (`M x0 2 C x0 30 160 26 160 54`).
const DESIGN_W = 320;
const DESIGN_H = 56;
function curvePoint(x0, t) {
  const mt = 1 - t;
  const x = mt ** 3 * x0 + 3 * mt ** 2 * t * x0 + 3 * mt * t ** 2 * 160 + t ** 3 * 160;
  const y = mt ** 3 * 2 + 3 * mt ** 2 * t * 30 + 3 * mt * t ** 2 * 26 + t ** 3 * 54;
  return { x, y };
}

export default function SignalFunnel({ tops }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || !tops?.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const w = parent.clientWidth || 1;
      const h = parent.clientHeight || 1;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    function draw(now) {
      const sx = canvas.width / DESIGN_W;
      const sy = canvas.height / DESIGN_H;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(sx, sy);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(143, 230, 0, 0.4)";
      ctx.setLineDash([3, 7]);

      tops.forEach((x0) => {
        ctx.beginPath();
        ctx.moveTo(x0, 2);
        ctx.bezierCurveTo(x0, 30, 160, 26, 160, 54);
        ctx.stroke();
      });

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.fillStyle = CS_CYAN;
      ctx.arc(160, 54, 2.5, 0, Math.PI * 2);
      ctx.fill();

      if (!reduceMotion && now != null) {
        const cycle = 2.6; // seconds — well under any strobe threshold
        const phase = (now / 1000) % cycle / cycle;
        tops.forEach((x0, i) => {
          const localT = (phase + i * 0.12) % 1;
          const p = curvePoint(x0, localT);
          ctx.beginPath();
          ctx.globalAlpha = 0.85 * (1 - Math.abs(localT - 0.5) * 0.7);
          ctx.fillStyle = CS_CYAN;
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      }
      ctx.restore();
    }

    let raf = 0;
    if (reduceMotion) {
      draw(null);
    } else {
      const loop = (now) => {
        if (!document.hidden) draw(now);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [tops]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
