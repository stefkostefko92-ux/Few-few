// Paper shapes of the drawing kernel as SVG: the same primitives the PDF painter draws, in paper millimetres with the
// y axis turned upward, on white paper in every theme (it is a sheet). Lettering keeps the width the kernel measured
// with DejaVu Sans (textLength), whatever font the browser has; halos are a paper-coloured stroke under the letters.
// No state: renders on the server and in the designer.
import { COND, PALETTE, concreteTile, textWidth, type Fill, type Pattern, type Shape, type Stroke } from '@/drawing';

const TILE: Pattern = concreteTile();
const FONT = "'DejaVu Sans', Verdana, 'Segoe UI', Arial, sans-serif";

interface Props {
  shapes: readonly Shape[];
  /** paper box shown [mm] */
  w: number;
  h: number;
  label: string;
  id: string;
  className?: string;
  logo?: { mime: 'image/png' | 'image/jpeg'; data: string } | null;
}

const f2 = (x: number): string => (Math.round(x * 100) / 100).toString();

export default function ShapesSvg({ shapes, w, h, label, id, className, logo }: Props) {
  const Y = (y: number): number => h - y;
  const pts = (p: readonly (readonly [number, number])[]): string => p.map(([x, y]) => `${f2(x)},${f2(Y(y))}`).join(' ');
  const stroke = (s?: Stroke) => (s ? { stroke: PALETTE[s.ink], strokeWidth: s.w, strokeDasharray: s.dash?.join(' ') } : { stroke: 'none' });
  const fill = (f?: Fill): string => (!f ? 'none' : f.k === 'solid' ? PALETTE[f.ink] : `url(#${id}-concrete)`);
  const one = (s: Shape, i: number) => {
    switch (s.t) {
      case 'line':
        return <line key={i} x1={f2(s.a[0])} y1={f2(Y(s.a[1]))} x2={f2(s.b[0])} y2={f2(Y(s.b[1]))} {...stroke(s.s)} />;
      case 'path':
        return s.closed
          ? <polygon key={i} points={pts(s.pts)} fill={fill(s.fill)} {...stroke(s.s)} />
          : <polyline key={i} points={pts(s.pts)} fill={fill(s.fill)} {...stroke(s.s)} />;
      case 'circle':
        return <circle key={i} cx={f2(s.c[0])} cy={f2(Y(s.c[1]))} r={f2(s.r)} fill={fill(s.fill)} {...stroke(s.s)} />;
      case 'arc': {
        const a0 = (s.a0 * Math.PI) / 180, a1 = (s.a1 * Math.PI) / 180, large = ((s.a1 - s.a0 + 360) % 360) > 180 ? 1 : 0;
        const p0 = [s.c[0] + s.r * Math.cos(a0), Y(s.c[1] + s.r * Math.sin(a0))], p1 = [s.c[0] + s.r * Math.cos(a1), Y(s.c[1] + s.r * Math.sin(a1))];
        return <path key={i} d={`M${f2(p0[0])} ${f2(p0[1])}A${f2(s.r)} ${f2(s.r)} 0 ${large} 0 ${f2(p1[0])} ${f2(p1[1])}`} fill="none" {...stroke(s.s)} />;
      }
      case 'text': {
        const width = textWidth(s.text, { size: s.size, bold: s.bold, cond: s.cond }), x = s.at[0], y = Y(s.at[1]);
        const anchor = s.align === 'c' ? 'middle' : s.align === 'r' ? 'end' : 'start';
        return (
          <text key={i} x={f2(x)} y={f2(y)} fontSize={f2(s.size)} fontFamily={FONT} fontWeight={s.bold ? 700 : 400} textAnchor={anchor}
            textLength={f2(width)} lengthAdjust="spacingAndGlyphs" fill={PALETTE[s.ink ?? 'ink']}
            transform={s.angle ? `rotate(${-s.angle} ${f2(x)} ${f2(y)})` : undefined}
            {...(s.halo ? { stroke: PALETTE.paper, strokeWidth: 0.9, paintOrder: 'stroke', strokeLinejoin: 'round' as const } : {})}>
            {s.text}
          </text>
        );
      }
      case 'image':
        return logo
          ? <image key={i} href={`data:${logo.mime};base64,${logo.data}`} x={f2(s.box.x0)} y={f2(Y(s.box.y1))} width={f2(s.box.x1 - s.box.x0)} height={f2(s.box.y1 - s.box.y0)} preserveAspectRatio="xMidYMid meet" />
          : null;
    }
  };
  return (
    <svg className={className ?? 'sheet-svg'} viewBox={`0 0 ${f2(w)} ${f2(h)}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet" data-cond={COND}>
      <defs>
        <pattern id={`${id}-concrete`} patternUnits="userSpaceOnUse" width={TILE.w} height={TILE.h}>
          {TILE.shapes.map((s, i) => {
            // the tile is drawn in its own box, y up: aggregate triangles and dots
            if (s.t === 'path') return <polygon key={i} points={s.pts.map(([x, y]) => `${f2(x)},${f2(TILE.h - y)}`).join(' ')} fill={fill(s.fill)} />;
            if (s.t === 'circle') return <circle key={i} cx={f2(s.c[0])} cy={f2(TILE.h - s.c[1])} r={f2(s.r)} fill={fill(s.fill)} />;
            return null;
          })}
        </pattern>
      </defs>
      <rect x="0" y="0" width={f2(w)} height={f2(h)} fill={PALETTE.paper} />
      <g strokeLinejoin="round">{shapes.map(one)}</g>
    </svg>
  );
}
