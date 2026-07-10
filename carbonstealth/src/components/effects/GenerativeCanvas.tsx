// WF-007 „GENERATIVE CANVAS PAINTING" — курсорът оставя ПЕРМАНЕНТНИ генеративни
// следи във фона на секцията (canvas без изчистване). Отделно е от фосфорната
// следа на курсора (Cursor.tsx) — това е трайно „платно", уникално за всеки посетител.
// Рисува само когато курсорът е над секцията; огледална симетрия за композиция.
import { useEffect, useRef } from 'react';

export default function GenerativeCanvas(): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    // Само на фини показалци (десктоп) — на touch няма hover „рисуване".
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    let cw = 0;
    let ch = 0;

    // Резолюцията се фиксира веднъж — resize би изчистил платното (следите се пазят).
    const setup = (): void => {
      const rect = wrap.getBoundingClientRect();
      cw = Math.max(1, rect.width);
      ch = Math.max(1, rect.height);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setup();

    let lastX = -1;
    let lastY = -1;
    let hue = 0;

    const onMove = (e: PointerEvent): void => {
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // само в границите на секцията
      if (x < 0 || y < 0 || x > cw || y > ch) {
        lastX = -1;
        lastY = -1;
        return;
      }
      if (lastX < 0) {
        lastX = x;
        lastY = y;
        return;
      }
      const d = Math.hypot(x - lastX, y - lastY);
      if (d < 4) return; // прореди — щрих на всеки няколко px

      hue = (hue + 2) % 360;
      // основен щрих (cyan-purple вариация в палитрата) + огледален по X
      const mono = 200 + ((hue / 360) * 40 - 20); // 180..220 (cyan→леко purple)
      const stroke = `hsla(${mono}, 90%, 60%, 0.16)`;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.moveTo(cw - lastX, lastY); // огледало → симетрична композиция
      ctx.lineTo(cw - x, y);
      ctx.stroke();

      // от време на време „пръска" — генеративни възли
      if (d > 22) {
        ctx.fillStyle = 'rgba(0,229,255,0.22)';
        for (let i = 0; i < 3; i++) {
          const ox = x + (Math.random() - 0.5) * 14;
          const oy = y + (Math.random() - 0.5) * 14;
          ctx.fillRect(ox, oy, 1.4, 1.4);
          ctx.fillRect(cw - ox, oy, 1.4, 1.4);
        }
      }
      lastX = x;
      lastY = y;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', opacity: 0.9 }}
      />
    </div>
  );
}
