// WF-001 „LIVE PRINT FORGE" — canvas 2D симулация на 3D принтер: детайлът се
// гради слой по слой в реално време, движеща се глава депозира материал, после
// влиза reverse-engineering скен режим („SCANNING GEOMETRY" → „MESH RECONSTRUCTED").
// Циклично. rAF пауза извън екрана; dpr капнат по капацитет на устройството.
import { useEffect, useRef } from 'react';
import { useInView } from '@/hooks/useInView';

const LAYERS = 34; // 34 слоя
const LAYER_MM = 0.2; // 0.20 мм на слой
const LAYER_MS = 62; // време за депозиране на един слой
const SCAN_MS = 1500; // reverse-engineering скен
const HOLD_MS = 900; // задържане на готовия детайл

// Полу-ширина на детайла (0..1) по височина t=0 (дъно) … 1 (връх) — органичен профил.
function profile(t: number): number {
  const body = 0.55 + 0.3 * Math.sin(t * Math.PI * 2.2 + 0.4);
  const taper = 0.82 + 0.18 * (1 - t);
  return Math.max(0.12, Math.min(1, body * taper));
}

export default function PrintForge(): React.JSX.Element {
  const [wrapRef, inView] = useInView<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    let cw = 0;
    let ch = 0;

    const resize = (): void => {
      const r = wrap.getBoundingClientRect();
      cw = Math.max(1, r.width);
      ch = Math.max(1, r.height);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // --- състояние на симулацията ---
    let mode: 'print' | 'scan' | 'hold' = 'print';
    let layer = 0; // текущ слой (завършени = layer)
    let headX = 0; // 0..1 позиция на главата по текущия слой
    let acc = 0; // натрупано време в текущата фаза
    let last = performance.now();

    // геометрия на сцената (в CSS px)
    const geo = () => {
      const padX = cw * 0.14;
      const baseY = ch * 0.86; // дъно на плочата
      const topY = ch * 0.14;
      const partH = baseY - topY;
      const lh = partH / LAYERS; // височина на слой
      const maxHalf = cw * 0.5 - padX;
      const cx = cw * 0.5;
      return { baseY, topY, lh, maxHalf, cx };
    };

    // рисуване на един слой (запълнен слаб + горна cyan черта)
    const layerBox = (i: number, frac: number): void => {
      const { baseY, lh, maxHalf, cx } = geo();
      const t = i / LAYERS;
      const half = profile(t) * maxHalf * Math.max(0, Math.min(1, frac));
      const y = baseY - (i + 1) * lh;
      const shade = 0.06 + 0.1 * (1 - t);
      ctx.fillStyle = `rgba(0,229,255,${shade})`;
      ctx.fillRect(cx - half, y, half * 2, lh + 0.6);
      ctx.strokeStyle = 'rgba(0,229,255,0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - half, y + 0.5);
      ctx.lineTo(cx + half, y + 0.5);
      ctx.stroke();
    };

    const drawPlate = (): void => {
      const { baseY, maxHalf, cx } = geo();
      ctx.strokeStyle = 'rgba(245,245,240,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - maxHalf - 12, baseY + 1);
      ctx.lineTo(cx + maxHalf + 12, baseY + 1);
      ctx.stroke();
      // тикове по плочата
      ctx.strokeStyle = 'rgba(245,245,240,0.08)';
      for (let x = -maxHalf; x <= maxHalf; x += 22) {
        ctx.beginPath();
        ctx.moveTo(cx + x, baseY + 2);
        ctx.lineTo(cx + x, baseY + 7);
        ctx.stroke();
      }
    };

    const drawHUD = (line: string, sub: string, accent: string): void => {
      ctx.font = '10px "Space Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = accent;
      ctx.fillText(line, 12, 12);
      ctx.fillStyle = 'rgba(245,245,240,0.5)';
      ctx.fillText(sub, 12, 26);
    };

    const drawHead = (): void => {
      const { baseY, lh, maxHalf, cx } = geo();
      const t = layer / LAYERS;
      const half = profile(t) * maxHalf;
      const y = baseY - (layer + 1) * lh;
      const x = cx - half + headX * half * 2;
      // портал/гантри
      ctx.strokeStyle = 'rgba(0,229,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 10);
      ctx.lineTo(x + 6, y - 10);
      ctx.lineTo(x + 6, y - 3);
      ctx.lineTo(x - 6, y - 3);
      ctx.closePath();
      ctx.stroke();
      // гореща точка на депозиране (amber)
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(x - 1, y - 3, 2, lh + 1);
    };

    const draw = (now: number): void => {
      const dt = Math.min(now - last, 60);
      last = now;
      acc += dt;
      ctx.clearRect(0, 0, cw, ch);
      drawPlate();

      if (mode === 'print') {
        // завършените слоеве
        for (let i = 0; i < layer; i++) layerBox(i, 1);
        // текущият слой се депозира по headX
        headX = Math.min(1, acc / LAYER_MS);
        if (layer < LAYERS) layerBox(layer, headX);
        drawHead();
        if (acc >= LAYER_MS) {
          acc = 0;
          layer++;
          headX = 0;
          if (layer >= LAYERS) {
            mode = 'scan';
          }
        }
        const z = (layer * LAYER_MM).toFixed(2);
        drawHUD(
          `> FORGING · LAYER ${String(Math.min(layer + 1, LAYERS)).padStart(2, '0')}/${LAYERS}`,
          `Z=${z}mm · 0.20mm · PLA-CARBON`,
          '#00e5ff',
        );
      } else if (mode === 'scan') {
        for (let i = 0; i < LAYERS; i++) layerBox(i, 1);
        const { baseY, topY, maxHalf, cx } = geo();
        const p = Math.min(1, acc / SCAN_MS);
        const y = baseY - (baseY - topY) * p;
        // скен линия (green, за да се различи от режима на печат)
        ctx.strokeStyle = 'rgba(0,255,136,0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - maxHalf - 12, y);
        ctx.lineTo(cx + maxHalf + 12, y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,255,136,0.06)';
        ctx.fillRect(cx - maxHalf - 12, y, (maxHalf + 12) * 2, baseY - y);
        drawHUD(
          '> SCANNING GEOMETRY...',
          `RECONSTRUCTION ${Math.round(p * 100)}%`,
          '#00ff88',
        );
        if (acc >= SCAN_MS) {
          acc = 0;
          mode = 'hold';
        }
      } else {
        for (let i = 0; i < LAYERS; i++) layerBox(i, 1);
        drawHUD('> MESH RECONSTRUCTED', 'READY · REVERSE-ENGINEERED', '#00ff88');
        if (acc >= HOLD_MS) {
          acc = 0;
          layer = 0;
          headX = 0;
          mode = 'print';
        }
      }
      raf = requestAnimationFrame(draw);
    };

    let raf = 0;
    if (inView) {
      last = performance.now();
      raf = requestAnimationFrame(draw);
    } else {
      // статичен постер, когато е извън екрана — не празно платно
      ctx.clearRect(0, 0, cw, ch);
      drawPlate();
      for (let i = 0; i < LAYERS; i++) layerBox(i, 1);
      drawHUD('> LIVE PRINT FORGE', 'IDLE', '#00e5ff');
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
      style={{
        position: 'relative',
        width: '100%',
        height: 300,
        border: '1px solid rgba(0,229,255,0.14)',
        background: '#000',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
