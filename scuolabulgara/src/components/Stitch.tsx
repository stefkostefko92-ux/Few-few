import { borderTile, outlinePath, rosette, stitchPaths, THREAD, type Motif } from "@/lib/stitch";

// Server-rendered embroidery: no JavaScript, no image request. Each stitch is
// drawn three times — a soft shadow, the thread, a thin sheen — which is what
// makes it read as raised thread rather than a printed X.

function Thread({ d, colour, w, size }: { d: string; colour: string; w: number; size: number }) {
  // white silk on bare linen shows only by its shadow, so it casts a deeper one
  const shadow = colour === THREAD.white ? "rgba(74,20,34,.45)" : "rgba(28,25,23,.22)";
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={shadow} strokeWidth={w} transform={`translate(${size * 0.06} ${size * 0.08})`} />
      <path d={d} stroke={colour} strokeWidth={w} />
      <path d={d} stroke="rgba(255,255,255,.28)" strokeWidth={w * 0.32} transform={`translate(${-size * 0.04} ${-size * 0.04})`} />
    </g>
  );
}

function Threads({ motif, size }: { motif: Motif; size: number }) {
  // Full, plump crosses that all but hide the linen, as on the Divotino cloth.
  const w = Math.max(1, size * 0.34);
  return (
    <>
      {Object.entries(stitchPaths(motif.cells, size, size * 0.12)).map(([c, d]) => <Thread key={c} d={d} colour={c} w={w} size={size} />)}
      {/* the contour is sewn last, over the crosses, as on the cloth */}
      {motif.outline && <Thread d={outlinePath(motif.cells, size)} colour={motif.outline} w={w * 0.55} size={size} />}
    </>
  );
}

/** The Divotino rosette. Decorative: hidden from screen readers. */
export function RosetteMotif({ size = 4, className }: { size?: number; className?: string }) {
  const m = rosette();
  const pad = size * 0.5; // room for the contour, which sits on the outer edge
  const w = m.w * size + 2 * pad, h = m.h * size + 2 * pad;
  return (
    <svg className={className} width={w} height={h} viewBox={`${-pad} ${-pad} ${w} ${h}`} aria-hidden="true" focusable="false">
      <Threads motif={m} size={size} />
    </svg>
  );
}

/** A full-width embroidered border, repeating one tile. */
export function StitchBand({ size = 6, id, className }: { size?: number; id: string; className?: string }) {
  const m = borderTile();
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
