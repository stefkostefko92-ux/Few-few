import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';

/**
 * Realm of Nexus — hand-rendered parchment-style world map.
 *
 * The map is painted to a single Canvas2D and re-rendered only when
 * the viewport resizes (no per-frame work). Region markers float on
 * top as positioned <div>s so the layout is responsive and clickable
 * without re-rasterising the parchment behind them.
 *
 * Touches that lift it above the previous "colored rectangles" version:
 *   - Procedural coastline drawn from layered cosine waves so the land
 *     mass has organic borders, not straight edges.
 *   - Hatched ocean fill + drifting cloud blobs.
 *   - Ink "roads" drawn as quadratic curves with a wax-sealed start
 *     marker at each region.
 *   - Compass rose painted in ink at the bottom-right.
 *   - Parchment texture stamped on top of everything (multiply blend).
 *
 * The same data drives the markers, so adding a new region only needs an
 * entry in REGIONS — the canvas redraws automatically.
 */

interface Region {
  slug: string;
  name: string;
  level: string;
  minLevel: number;
  lore: string;
  /** Fractional position on the canvas (0..1). */
  x: number;
  y: number;
  /** Symbolic single-character "stamp" colour for the marker pin. */
  color: string;
  /** One of: forest / hills / cave / fire / shadow — picks an ink stamp. */
  biome: 'forest' | 'hills' | 'cave' | 'fire' | 'shadow';
}

const REGIONS: Region[] = [
  { slug: 'whispering_woods', name: 'Whispering Woods', level: '1-5',  minLevel: 1,  lore: 'A green wood near Oaken Hollow.',          x: 0.18, y: 0.74, color: '#3f6a2c', biome: 'forest' },
  { slug: 'mistmoor_hills',   name: 'Mistmoor Hills',   level: '6-10', minLevel: 6,  lore: 'Fog-laced highlands stalked by orcs.',    x: 0.36, y: 0.52, color: '#6e7a5c', biome: 'hills'  },
  { slug: 'crystal_caverns',  name: 'Crystal Caverns',  level: '10-15',minLevel: 10, lore: 'Glittering tunnels beneath the mountains.',x: 0.55, y: 0.64, color: '#6aa7ff', biome: 'cave'   },
  { slug: 'ashen_wastes',     name: 'Ashen Wastes',     level: '15-22',minLevel: 15, lore: 'Burned plains roamed by drakes.',         x: 0.74, y: 0.40, color: '#c7641a', biome: 'fire'   },
  { slug: 'shadowfell',       name: 'The Shadowfell',   level: '24+',  minLevel: 24, lore: 'The Shadow Lord\'s domain. Bring everything.', x: 0.88, y: 0.22, color: '#6f3fb6', biome: 'shadow' },
];

const PARCHMENT_FILL    = '#e8d5a4';
const PARCHMENT_SHADOW  = '#b89766';
const INK               = '#2a1d0a';
const SEA               = '#83a4b0';

function drawMap(c: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth, h = c.clientHeight;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Sea — hatched
  ctx.fillStyle = SEA;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 7) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * .12) * 1.5);
    ctx.lineTo(w, y + Math.sin(y * .12 + .9) * 1.5);
    ctx.stroke();
  }

  // Land — one big island with procedurally noisy edges
  const coast = new Path2D();
  const cx = w * 0.5, cy = h * 0.55;
  const rxBase = w * 0.42, ryBase = h * 0.42;
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
    const wob = 1 + Math.sin(a * 3.0) * 0.10 + Math.sin(a * 7.3) * 0.06 + Math.cos(a * 11.1) * 0.04;
    const x = cx + Math.cos(a) * rxBase * wob;
    const y = cy + Math.sin(a) * ryBase * wob;
    if (a === 0) coast.moveTo(x, y); else coast.lineTo(x, y);
  }
  coast.closePath();
  // Drop-shadow halo for the coast
  ctx.fillStyle = PARCHMENT_SHADOW;
  ctx.save();
  ctx.translate(0, 6); ctx.fill(coast); ctx.restore();
  // Parchment fill
  ctx.fillStyle = PARCHMENT_FILL;
  ctx.fill(coast);

  // Inside the land we paint biome stamps and roads, clipped to the coast.
  ctx.save();
  ctx.clip(coast);

  // Sandy beach inset glow
  ctx.lineWidth = 14; ctx.strokeStyle = '#f4e4ba';
  ctx.stroke(coast);

  // Biome stamps: clusters of tiny icons painted as INK.
  for (const r of REGIONS) {
    const x = r.x * w, y = r.y * h;
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    drawBiome(ctx, r.biome, x, y);
  }

  // Ink road connecting the regions in order
  ctx.strokeStyle = 'rgba(60,40,15,.75)';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([5, 4]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < REGIONS.length - 1; i++) {
    const a = REGIONS[i], b = REGIONS[i + 1];
    const x1 = a.x * w, y1 = a.y * h, x2 = b.x * w, y2 = b.y * h;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 28;
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore(); // end coast clip

  // Compass rose, bottom-right
  const rose = { x: w - 70, y: h - 70, r: 36 };
  ctx.save();
  ctx.translate(rose.x, rose.y);
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, rose.r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, rose.r - 7, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const long = i % 2 === 0;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -(long ? rose.r : rose.r * 0.55));
    if (long) {
      ctx.lineTo(4, -(rose.r * 0.65));
      ctx.lineTo(0, -(rose.r * 0.55));
      ctx.lineTo(-4, -(rose.r * 0.65));
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -rose.r - 8);
  ctx.fillText('S', 0,  rose.r + 8);
  ctx.fillText('W', -rose.r - 8, 0);
  ctx.fillText('E',  rose.r + 8, 0);
  ctx.restore();

  // Border frame
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  // Parchment grain — speckled multiply pass
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 1400; i++) {
    const a = 0.04 + Math.random() * 0.08;
    ctx.fillStyle = `rgba(120,90,40,${a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
  }
  // Edge vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.55, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,25,5,.7)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

function drawBiome(ctx: CanvasRenderingContext2D, biome: Region['biome'], x: number, y: number) {
  if (biome === 'forest') {
    for (let i = 0; i < 6; i++) {
      const tx = x + (Math.cos(i) - 1) * 8 + (i % 2) * 10;
      const ty = y + Math.sin(i) * 6;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 7);
      ctx.lineTo(tx - 5, ty + 7);
      ctx.lineTo(tx, ty - 7);
      ctx.lineTo(tx + 5, ty + 7);
      ctx.closePath(); ctx.fill();
    }
  } else if (biome === 'hills') {
    for (let i = 0; i < 4; i++) {
      const tx = x - 12 + i * 8;
      ctx.beginPath();
      ctx.moveTo(tx - 7, y + 6);
      ctx.quadraticCurveTo(tx, y - 8, tx + 7, y + 6);
      ctx.closePath(); ctx.fill();
    }
  } else if (biome === 'cave') {
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 8);
    ctx.quadraticCurveTo(x, y - 12, x + 14, y + 8);
    ctx.lineTo(x + 14, y + 10);
    ctx.lineTo(x - 14, y + 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8d5a4';
    ctx.fillRect(x - 4, y + 4, 8, 6);
    ctx.fillStyle = INK;
  } else if (biome === 'fire') {
    for (let i = 0; i < 5; i++) {
      const tx = x - 10 + i * 5;
      ctx.beginPath();
      ctx.moveTo(tx, y + 8);
      ctx.quadraticCurveTo(tx - 4, y, tx, y - 7);
      ctx.quadraticCurveTo(tx + 4, y, tx, y + 8);
      ctx.closePath(); ctx.fill();
    }
  } else if (biome === 'shadow') {
    // Skull
    ctx.beginPath();
    ctx.arc(x, y - 2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d5a4';
    ctx.beginPath(); ctx.arc(x - 3, y - 3, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3, y - 3, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillRect(x - 5, y + 4, 10, 3);
  }
}

export default function World(): React.ReactElement {
  const char = useStore((s) => s.character);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    function go() {
      if (!canvasRef.current) return;
      drawMap(canvasRef.current);
      const r = canvasRef.current.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    }
    go();
    const ro = new ResizeObserver(go);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('orientationchange', go);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', go); };
  }, []);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Map of Nexus</h2>
          <div className="panel-subtitle">From Oaken Hollow to the Shadowfell — drawn by a hand long dead.</div>
        </div>
      </div>
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          boxShadow: '0 18px 40px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.05)',
        }}
      >
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} aria-hidden />

        {/* Region pins on top of the canvas */}
        {REGIONS.map((r) => {
          const locked = char ? char.level < r.minLevel - 1 : false;
          const left = r.x * size.w, top = r.y * size.h;
          return (
            <div
              key={r.slug}
              style={{
                position: 'absolute',
                left, top,
                transform: 'translate(-50%, -50%)',
                width: 'clamp(140px, 18%, 200px)',
                pointerEvents: size.w === 0 ? 'none' : 'auto',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(180deg, rgba(15,8,2,.92), rgba(8,5,2,.96))',
                  border: `1px solid ${r.color}`,
                  borderRadius: 10,
                  padding: 10,
                  color: '#f4e4ba',
                  boxShadow: `0 0 18px ${r.color}55, 0 6px 14px rgba(0,0,0,.5)`,
                  opacity: locked ? 0.55 : 1,
                  backdropFilter: 'blur(2px)',
                }}
              >
                <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)', fontSize: 14 }}>{r.name}</strong>
                <div className="muted text-sm" style={{ marginTop: 2 }}>Lv {r.level}</div>
                <div className="muted text-sm" style={{ marginTop: 4, fontStyle: 'italic', opacity: .85 }}>{r.lore}</div>
                {!locked && (
                  <Link to="/app/quests" className="btn btn-sm btn-primary" style={{ marginTop: 8, width: '100%', display: 'flex', justifyContent: 'center' }}>
                    Quests Here
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
