import { bandTile, star, stitchPaths, type Motif } from "@/lib/stitch";

// Server-rendered embroidery: no JavaScript, no image request. Each stitch is
// drawn three times — a soft shadow, the thread, a thin sheen — which is what
// makes it read as raised thread rather than a printed X.

function Threads({ motif, size }: { motif: Motif; size: number }) {
  const paths = stitchPaths(motif.cells, size);
  const w = Math.max(1, size * 0.26);
  return (
    <>
      {Object.entries(paths).map(([c, d]) => (
        <g key={c} fill="none" strokeLinecap="round">
          <path d={d} stroke="rgba(28,25,23,.22)" strokeWidth={w} transform={`translate(${size * 0.06} ${size * 0.08})`} />
          <path d={d} stroke={c} strokeWidth={w} />
          <path d={d} stroke="rgba(255,255,255,.28)" strokeWidth={w * 0.32} transform={`translate(${-size * 0.04} ${-size * 0.04})`} />
        </g>
      ))}
    </>
  );
}

/** The eight-pointed star. Decorative: hidden from screen readers. */
export function StarMotif({ a = 3, size = 4, className }: { a?: number; size?: number; className?: string }) {
  const m = star(a);
  return (
    <svg className={className} width={m.w * size} height={m.h * size} viewBox={`0 0 ${m.w * size} ${m.h * size}`} aria-hidden="true" focusable="false">
      <Threads motif={m} size={size} />
    </svg>
  );
}

/** A full-width embroidered border, repeating one tile. */
export function StitchBand({ size = 6, id, className }: { size?: number; id: string; className?: string }) {
  const m = bandTile();
  const pid = `band-${id}`;
  return (
    <div className={`band ${className ?? ""}`} aria-hidden="true">
      <svg width="100%" height={m.h * size} focusable="false">
        <defs>
          <pattern id={pid} width={m.w * size} height={m.h * size} patternUnits="userSpaceOnUse">
            <Threads motif={m} size={size} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pid})`} />
      </svg>
    </div>
  );
}
