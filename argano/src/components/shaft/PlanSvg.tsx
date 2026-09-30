// The plan drawing of a shaft design as SVG: the same primitives as the DXF and the report (src/shaft/drawing.ts),
// in millimetres with the y axis turned upward, walls hatched, strokes that keep their width at any scale. Colours
// from the theme (shaft.css). No state: renders on the server and in the designer.
import { explodeDim, type Drawing, type Prim, type Pt } from '@/shaft';

const deg = (rad: number): number => (rad * 180) / Math.PI;
const pts = (p: readonly Pt[]): string => p.map(([x, y]) => `${x},${-y}`).join(' ');

function prim(p: Prim, i: number) {
  if (p.k === 'poly') {
    const cls = `pl-${p.layer.toLowerCase()}${p.fill ? ` fill-${p.fill}` : ''}`;
    return p.closed ? <polygon key={i} className={cls} points={pts(p.pts)} /> : <polyline key={i} className={cls} points={pts(p.pts)} />;
  }
  if (p.k === 'line') return <line key={i} className={`pl-${p.layer.toLowerCase()}`} x1={p.a[0]} y1={-p.a[1]} x2={p.b[0]} y2={-p.b[1]} />;
  if (p.k === 'text') {
    const anchor = p.align === 'c' ? 'middle' : p.align === 'r' ? 'end' : 'start';
    const [x, y] = [p.at[0], -p.at[1]];
    return <text key={i} className={`pt-${p.layer.toLowerCase()}`} x={x} y={y} fontSize={p.h} textAnchor={anchor} transform={p.vertical ? `rotate(-90 ${x} ${y})` : undefined}>{p.text}</text>;
  }
  const d = explodeDim(p), [tx, ty] = [d.text.at[0], -d.text.at[1]];
  return (
    <g key={i} className="pl-quote">
      {d.lines.map(([a, b], j) => <line key={j} x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} />)}
      <text className="pt-quote" x={tx} y={ty} fontSize={d.text.h} textAnchor="middle" transform={`rotate(${-deg(d.text.angle)} ${tx} ${ty})`}>{d.text.value}</text>
    </g>
  );
}

export default function PlanSvg({ drawing, label, id }: { drawing: Drawing; label: string; id: string }) {
  const { minX, minY, maxX, maxY } = drawing.bounds;
  const hatch = `hatch-${id}`;
  return (
    <svg className="plan" viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width="60" height="60" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="60" className="hatch-line" />
        </pattern>
      </defs>
      <g style={{ ['--wall-hatch' as string]: `url(#${hatch})` }}>{drawing.prims.map(prim)}</g>
    </svg>
  );
}
