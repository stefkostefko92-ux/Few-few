// „MATRIX RAIN / ASCII поле" (каталог на стария сайт — design-tokens.json).
// Падащи колони от '01アイウ{}[]<>CS|@#', ниска opacity, дискретен фон.
// Вплетено дискретно (напр. фон на 404), за да не се бие с hero-то.
// rAF пауза извън екрана; dpr капнат; чисти се при unmount.
import { useEffect, useRef } from 'react';
import { useInView } from '@/hooks/useInView';

const GLYPHS = '01アイウエオカキ{}[]<>CS|@#/\\+*'.split('');

export default function MatrixRain(): React.JSX.Element {
  const [wrapRef, inView] = useInView<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    const fontPx = 13;
    let cols = 0;
    let drops: number[] = [];
    let cw = 0;
    let ch = 0;

    const resize = (): void => {
      const rect = wrap.getBoundingClientRect();
      cw = Math.max(1, rect.width);
      ch = Math.max(1, rect.height);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(cw / fontPx);
      drops = Array.from({ length: cols }, () => Math.random() * -50);
      ctx.clearRect(0, 0, cw, ch);
    };
    resize();
    window.addEventListener('resize', resize);

    // Кадрите се тротлят (~14fps) — дъждът е дискретен фон, не иска 60fps, пести GPU.
    const STEP = 70;
    let last = performance.now();
    let raf = 0;
    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw);
      if (now - last < STEP) return;
      last = now;
      // лек шлейф: полупрозрачно черно вместо пълно изчистване
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.font = `${fontPx}px "Space Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        const g = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        const x = i * fontPx;
        const y = drops[i] * fontPx;
        // водещият символ е по-ярък cyan, опашката — по-слаба
        ctx.fillStyle = 'rgba(0,229,255,0.55)';
        ctx.fillText(g, x, y);
        ctx.fillStyle = 'rgba(0,229,255,0.14)';
        ctx.fillText(g, x, y - fontPx);
        if (y > ch && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.5;
      }
    };

    if (inView) {
      last = performance.now();
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [inView, wrapRef]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.5 }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
