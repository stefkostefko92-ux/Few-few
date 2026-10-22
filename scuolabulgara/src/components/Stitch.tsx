import { borderTile, mixHex, outlinePath, rosette, type Motif } from "@/lib/stitch";

// Server-rendered embroidery: no JavaScript, no image request. One stitch is
// drawn once per thread colour as an SVG symbol and placed in every cell, so
// each can afford what makes floss look like floss: two twisted strands, a
// rounded body lit from the top left, legs that thin where they dive into the
// cloth, the top leg's shadow on the bottom one, and the holes in the linen.

const INSET = 0.07; // where the needle goes in, as a share of the cell
const BODY = 0.5; // thread thickness, as a share of the cell

/** One leg, lying along x through the middle of a unit cell: a spindle that
 *  is full in the middle and pinched at both holes. */
const LEG = (() => {
  const x0 = 0.5 - ((1 - 2 * INSET) * Math.SQRT2) / 2, x1 = 1 - x0, h = BODY * 0.68, k = 0.2;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `M${r(x0)} .5C${r(x0 + k)} ${r(0.5 - h)} ${r(x1 - k)} ${r(0.5 - h)} ${r(x1)} .5C${r(x1 - k)} ${r(0.5 + h)} ${r(x0 + k)} ${r(0.5 + h)} ${r(x0)} .5Z`;
})();
const SHEEN = `M.14 ${0.5 - BODY * 0.17}L.86 ${0.5 - BODY * 0.17}`;

function StitchDefs({ id, colours }: { id: string; colours: string[] }) {
  return (
    <defs>
      {/* the twist of two strands: fine ridges across the thread */}
      <pattern id={`${id}-twist`} patternUnits="userSpaceOnUse" width=".11" height=".11" patternTransform="rotate(38)">
        <rect width=".11" height=".04" fill="rgba(20,8,6,.2)" />
      </pattern>
      {/* the thread darkens where it goes into the hole */}
      <linearGradient id={`${id}-ends`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#140806" stopOpacity=".55" />
        <stop offset=".16" stopColor="#140806" stopOpacity="0" />
        <stop offset=".84" stopColor="#140806" stopOpacity="0" />
        <stop offset="1" stopColor="#140806" stopOpacity=".55" />
      </linearGradient>
      {colours.map((c, i) => (
        <linearGradient key={c} id={`${id}-g${i}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mixHex(c, "#000000", 0.42)} />
          <stop offset=".2" stopColor={c} />
          <stop offset=".38" stopColor={mixHex(c, "#ffffff", 0.3)} />
          <stop offset=".56" stopColor={c} />
          <stop offset="1" stopColor={mixHex(c, "#000000", 0.5)} />
        </linearGradient>
      ))}
      {colours.map((c, i) => {
        const leg = (angle: number, under: boolean) => (
          <g transform={`rotate(${angle} .5 .5)`}>
            <path d={LEG} fill={`url(#${id}-g${i})`} />
            {under && <path d={LEG} fill="rgba(20,8,6,.12)" />}
            <path d={LEG} fill={`url(#${id}-twist)`} />
            <path d={LEG} fill={`url(#${id}-ends)`} />
            <path d={SHEEN} stroke="rgba(255,255,255,.3)" strokeWidth=".035" strokeLinecap="round" />
          </g>
        );
        return (
          <symbol key={c} id={`${id}-s${i}`} viewBox="0 0 1 1" overflow="visible">
            {/* holes in the linen, then the stitch's own shadow on the cloth */}
            {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r=".05" fill="rgba(74,46,30,.3)" />)}
            <g transform="translate(.035 .06)" fill="rgba(40,20,10,.2)">
              <path d={LEG} transform="rotate(-45 .5 .5)" />
              <path d={LEG} transform="rotate(45 .5 .5)" />
            </g>
            {leg(-45, true)}
            {/* the top leg's shadow falls on the bottom one */}
            <path d={LEG} transform="translate(.03 .05) rotate(45 .5 .5)" fill="rgba(20,8,6,.28)" />
            {leg(45, false)}
          </symbol>
        );
      })}
    </defs>
  );
}

/** Back-stitch contour: the same kind of thread, lit, with its own soft shadow. */
function Contour({ motif, size }: { motif: Motif; size: number }) {
  if (!motif.outline) return null;
  const d = outlinePath(motif.cells, size);
  const w = Math.max(1, size * 0.2);
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke="rgba(40,20,10,.25)" strokeWidth={w * 1.15} transform={`translate(${size * 0.04} ${size * 0.06})`} />
      <path d={d} stroke={motif.outline} strokeWidth={w} />
      <path d={d} stroke="rgba(255,255,255,.18)" strokeWidth={w * 0.3} transform={`translate(${-size * 0.03} ${-size * 0.03})`} />
    </g>
  );
}

function Threads({ id, motif, size }: { id: string; motif: Motif; size: number }) {
  const colours = [...new Set(motif.cells.map((c) => c.c))];
  return (
    <>
      <StitchDefs id={id} colours={colours} />
      {motif.cells.map((c, i) => (
        <use key={i} href={`#${id}-s${colours.indexOf(c.c)}`} x={c.x * size} y={c.y * size} width={size} height={size} />
      ))}
      {/* the contour is sewn last, over the crosses, as on the cloth */}
      <Contour motif={motif} size={size} />
    </>
  );
}

/** The Divotino rosette. Decorative: hidden from screen readers. */
export function RosetteMotif({ size = 4, className, id = "rosette" }: { size?: number; className?: string; id?: string }) {
  const m = rosette();
  const pad = size * 0.6; // room for the contour and its shadow on the outer edge
  const w = m.w * size + 2 * pad, h = m.h * size + 2 * pad;
  return (
    <svg className={className} width={w} height={h} viewBox={`${-pad} ${-pad} ${w} ${h}`} aria-hidden="true" focusable="false">
      <Threads id={id} motif={m} size={size} />
    </svg>
  );
}

/** A full-width embroidered border on a strip of woven linen, repeating one tile. */
export function StitchBand({ size = 6, id, className }: { size?: number; id: string; className?: string }) {
  const m = borderTile();
  const pid = `band-${id}`;
  const pad = 2; // linen showing above and below the border, in stitches
  return (
    <div className={`band ${className ?? ""}`} aria-hidden="true">
      <svg width="100%" height={(m.h + 2 * pad) * size} focusable="false">
        <defs>
          {/* the weave: a hole at every stitch corner, threads running both ways */}
          <pattern id={`${pid}-linen`} width={size} height={size} patternUnits="userSpaceOnUse">
            <rect width={size} height={size} fill="#efe8dc" />
            <rect y={size * 0.12} width={size} height={size * 0.3} fill="rgba(255,255,255,.35)" />
            <rect x={size * 0.58} width={size * 0.28} height={size} fill="rgba(120,90,60,.07)" />
            <circle cx="0" cy="0" r={size * 0.09} fill="rgba(90,60,40,.28)" />
          </pattern>
          {/* hand-spun fibre: the weave is never quite even */}
          <filter id={`${pid}-fibre`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency=".7 .25" numOctaves="2" seed="7" />
            <feColorMatrix values="0 0 0 0 .35  0 0 0 0 .25  0 0 0 0 .16  0 0 0 .22 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <pattern id={pid} width={m.w * size} height={m.h * size} patternUnits="userSpaceOnUse" y={pad * size}>
            <Threads id={pid} motif={m} size={size} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pid}-linen)`} />
        <rect width="100%" height="100%" fill="#000" filter={`url(#${pid}-fibre)`} />
        <rect y={pad * size} width="100%" height={m.h * size} fill={`url(#${pid})`} />
      </svg>
    </div>
  );
}
