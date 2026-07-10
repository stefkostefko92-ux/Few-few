// WF-011 „LIVING MONUMENT" — вечен кристал (phyllotaxis спирала, златен ъгъл),
// който расте от поведението на всеки посетител. Всеки добавя шард, изведен от
// SHA-256 на своя „отпечатък" (екран, timezone, движение, скрол). Кристалът МОЖЕ
// само да расте. Твоят собствен шард пулсира в бяло.
//
// Договор (site.json → monumentApi): GET /api/monument.php → {ok,count,seeds[]};
// POST {seed}. На статичен хостинг endpoint-ът липсва → ГРАЦИОЗЕН fallback към
// localStorage растеж, БЕЗ конзолни грешки (всички мрежови грешки се гълтат).
import { useEffect, useRef, useState } from 'react';
import { useInView } from '@/hooks/useInView';

const ENDPOINT = '/api/monument.php';
const LS_KEY = 'cs_monument_count';
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~137.5° златен ъгъл
const MAX_SHARDS = 1400; // капнат рендер (истинският брой стои в HUD)

interface MonumentResponse {
  ok?: boolean;
  count?: number;
  seeds?: string[];
}

// SHA-256 на поведенчески отпечатък → hex низ (native crypto.subtle, без dependency).
async function behaviorSeed(mouse: number, scroll: number): Promise<string> {
  const parts = [
    screen.width,
    screen.height,
    window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? 0,
    navigator.language,
    Math.round(mouse),
    Math.round(scroll),
    Date.now(),
  ].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readLocalCount(): number {
  const raw = Number(localStorage.getItem(LS_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export default function LivingMonument(): React.JSX.Element {
  const [wrapRef, inView] = useInView<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState<number>(0);
  const [source, setSource] = useState<'core' | 'local'>('local');
  const countRef = useRef(0);
  const ownIndexRef = useRef(-1); // индекс на собствения шард (пулсира)

  // --- регистрация на посетителя (веднъж) ---
  useEffect(() => {
    let alive = true;
    let mouseDist = 0;
    let scrollDist = 0;
    let px = 0;
    let py = 0;
    const onMove = (e: PointerEvent): void => {
      if (px || py) mouseDist += Math.hypot(e.clientX - px, e.clientY - py);
      px = e.clientX;
      py = e.clientY;
    };
    const onScroll = (): void => {
      scrollDist += Math.abs(window.scrollY);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // Гълтащ fetch: всяка мрежова грешка (404/CORS/offline) → тихо към null.
    const safeGet = async (): Promise<MonumentResponse | null> => {
      try {
        const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) return null; // статичен хост връща HTML → игнорирай
        return (await res.json()) as MonumentResponse;
      } catch {
        return null;
      }
    };

    const seal = window.setTimeout(async () => {
      const seed = await behaviorSeed(mouseDist, scrollDist);
      const remote = await safeGet();
      let base: number;
      if (remote && typeof remote.count === 'number') {
        base = remote.count;
        if (alive) setSource('core');
        // регистрирай своя шард (best-effort, грешките се гълтат)
        try {
          await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ seed }),
          });
        } catch {
          /* тихо — POST е незадължителен */
        }
      } else {
        base = readLocalCount();
        if (alive) setSource('local');
      }
      // кристалът може само да расте: +1 за този посетител
      const next = base + 1;
      // пази монотонен растеж локално (не пада под предишното)
      const persisted = Math.max(next, readLocalCount());
      try {
        localStorage.setItem(LS_KEY, String(persisted));
      } catch {
        /* private mode — игнорирай */
      }
      if (!alive) return;
      countRef.current = persisted;
      ownIndexRef.current = Math.min(persisted - 1, MAX_SHARDS - 1);
      setCount(persisted);
    }, 1200);

    return () => {
      alive = false;
      window.clearTimeout(seal);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // --- рендер на кристала ---
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
    let field: HTMLCanvasElement | null = null; // офскрийн кеш на статичните шардове

    const shardCount = (): number => Math.min(Math.max(countRef.current, 1), MAX_SHARDS);

    // Прекомпилирай статичното поле (всички шардове без собствения) в офскрийн canvas.
    const buildField = (): void => {
      const n = shardCount();
      const off = document.createElement('canvas');
      off.width = Math.round(cw * dpr);
      off.height = Math.round(ch * dpr);
      const o = off.getContext('2d');
      if (!o) return;
      o.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = cw / 2;
      const cy = ch / 2;
      const scale = Math.min(cw, ch) * 0.026;
      for (let i = 0; i < n; i++) {
        if (i === ownIndexRef.current) continue; // собственият се рисува на живо
        const a = i * GOLDEN;
        const r = scale * Math.sqrt(i);
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        const norm = i / n;
        const alpha = 0.12 + 0.5 * (1 - norm);
        const s = 1.4 + 2.2 * (1 - norm);
        o.save();
        o.translate(x, y);
        o.rotate(a);
        o.fillStyle = `rgba(0,229,255,${alpha.toFixed(3)})`;
        o.beginPath();
        o.moveTo(0, -s);
        o.lineTo(s, 0);
        o.lineTo(0, s);
        o.lineTo(-s, 0);
        o.closePath();
        o.fill();
        o.restore();
      }
      field = off;
    };

    const resize = (): void => {
      const rect = wrap.getBoundingClientRect();
      cw = Math.max(1, rect.width);
      ch = Math.max(1, rect.height);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildField();
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let t = 0;
    const draw = (): void => {
      t += 0.016;
      ctx.clearRect(0, 0, cw, ch);
      if (field) ctx.drawImage(field, 0, 0, cw, ch);
      // собственият шард — бяла пулсация (бавна, ~2.5s цикъл → без строб)
      const oi = ownIndexRef.current;
      if (oi >= 0) {
        const cx = cw / 2;
        const cy = ch / 2;
        const scale = Math.min(cw, ch) * 0.026;
        const a = oi * GOLDEN;
        const r = scale * Math.sqrt(oi);
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        const pulse = 0.55 + 0.45 * Math.sin(t * 2.4);
        const s = 3.4 + 1.6 * pulse;
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 10 * pulse;
        ctx.fillStyle = `rgba(255,255,255,${(0.6 + 0.4 * pulse).toFixed(3)})`;
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };

    if (inView) raf = requestAnimationFrame(draw);
    else if (field) ctx.drawImage(field, 0, 0, cw, ch);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [inView, count, wrapRef]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={wrapRef}
        aria-hidden
        style={{
          position: 'relative',
          width: '100%',
          height: 340,
          border: '1px solid rgba(0,229,255,0.14)',
          background:
            'radial-gradient(circle at 50% 50%, rgba(0,229,255,0.04), #000 70%)',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
      <div
        className="cs-hud"
        style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}
      >
        <span style={{ color: 'var(--cyan)' }}>
          ◆ {count.toLocaleString('en-US')} SHARDS
        </span>
        <span>
          SRC: {source === 'core' ? 'MONUMENT-CORE' : 'LOCAL-ENTROPY'}
        </span>
        <span style={{ color: '#fff' }}>● YOUR SHARD SEALED</span>
      </div>
    </div>
  );
}
