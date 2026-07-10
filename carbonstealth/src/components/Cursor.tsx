// Собствен курсор: cyan ринг + точка + CRT фосфорна следа (canvas).
// Само на fine pointer устройства (десктоп); на touch не се рендерира.

import { useEffect, useRef } from 'react';
import { pointer, updatePointer } from '@/lib/pointer';

export default function Cursor(): React.JSX.Element | null {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fine = useRef(
    typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
  );

  useEffect(() => {
    if (!fine.current) return;
    document.body.classList.add('cs-custom-cursor');

    const ring = ringRef.current!;
    const dot = dotRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    let rx = window.innerWidth / 2;
    let ry = window.innerHeight / 2;

    const resize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const onMove = (e: PointerEvent): void => {
      updatePointer(e.clientX, e.clientY);
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      // фосфорна следа
      ctx.beginPath();
      const grad = ctx.createRadialGradient(
        e.clientX,
        e.clientY,
        0,
        e.clientX,
        e.clientY,
        7,
      );
      grad.addColorStop(0, 'rgba(0,229,255,0.55)');
      grad.addColorStop(1, 'rgba(0,229,255,0)');
      ctx.fillStyle = grad;
      ctx.arc(e.clientX, e.clientY, 7, 0, Math.PI * 2);
      ctx.fill();
    };

    const overInteractive = (e: PointerEvent): void => {
      const t = e.target as HTMLElement;
      const interactive = !!t.closest('a, button, input, textarea, [data-cursor]');
      ring.style.width = interactive ? '46px' : '26px';
      ring.style.height = interactive ? '46px' : '26px';
      ring.style.borderColor = interactive
        ? 'rgba(0,229,255,0.9)'
        : 'rgba(0,229,255,0.55)';
    };

    const onDown = (): void => {
      pointer.down = true;
      ring.style.transform += ' scale(0.8)';
    };
    const onUp = (): void => {
      pointer.down = false;
    };

    // rAF за плавно догонване на ринга + затихване на следата
    let raf = 0;
    const loop = (): void => {
      rx += (pointer.x - rx) * 0.18;
      ry += (pointer.y - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      // леко избледняване на фосфора
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', overInteractive, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', overInteractive);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', resize);
      document.body.classList.remove('cs-custom-cursor');
    };
  }, []);

  if (!fine.current) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
          mixBlendMode: 'screen',
        }}
      />
      <div
        ref={ringRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 26,
          height: 26,
          border: '1px solid rgba(0,229,255,0.55)',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 9999,
          transition: 'width .18s ease, height .18s ease, border-color .18s ease',
        }}
      />
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          top: -2,
          left: -2,
          width: 4,
          height: 4,
          background: 'rgba(0,229,255,0.9)',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      />
    </>
  );
}
