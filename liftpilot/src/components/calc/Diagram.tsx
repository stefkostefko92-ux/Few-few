// Suspension sketch of the prototype v12 (renderDiagram), drawn from the entered geometry: machine at the top
// (direct or with a deflector) or at the bottom, wrap angle, masses, shaft load.
import type { ReactNode } from 'react';
import { rad } from '@/calc/math';
import type { Machine, Plant, Results } from '@/calc/types';
import type { Pres } from '@/lib/present/tr';

export default function Diagram({ P, I, N, res }: { P: Pres; I: Plant; N: Machine; res: Results }) {
  const { t, fmt } = P;
  const a = res.alphaDeg, R = 30, cx = 160, VBW = 320;
  let key = 0;
  const n1 = (x: number): number => Math.round(x * 10) / 10;
  const rpOf = (lo: number, hi: number): number => Math.min(hi, Math.max(lo, (R * I.Dp) / N.D));
  const kgText = (kg: number): string => (kg >= 10000 ? `${fmt(kg / 1000, kg >= 100000 ? 0 : 1)} t` : `${fmt(kg, 0)} kg`);
  const rope = (x1: number, y1: number, x2: number, y2: number): ReactNode =>
    <line key={key++} x1={n1(x1)} y1={n1(y1)} x2={n1(x2)} y2={n1(y2)} className="svg-rope" strokeWidth={2.2} />;
  const pulley = (x: number, y: number, rr: number): ReactNode =>
    <circle key={key++} cx={n1(x)} cy={n1(y)} r={n1(rr)} className="svg-rope svg-surface" strokeWidth={2} />;
  const sheave = (x: number, y: number): ReactNode[] => [pulley(x, y, R),
    <circle key={key++} cx={x} cy={y} r={R - 7} className="svg-steel svg-none" strokeWidth={1} />, <circle key={key++} cx={x} cy={y} r={4} className="svg-cw" />];
  const txt = (x: number, y: number, str: string, cls = 'svg-ink', size = 11, anchor: 'start' | 'middle' | 'end' = 'middle', weight = 500): ReactNode =>
    <text key={key++} x={n1(x)} y={n1(y)} fontSize={size} fontWeight={weight} textAnchor={anchor} className={cls}>{str}</text>;
  const width10 = (s: string): number => s.length * 6.1; // monospace at 10px
  // counterweight label: to its right, or centred under it when it would leave the drawing
  const side = (xc: number, yTop: number, s: string): ReactNode => (xc + 18 + width10(s) <= VBW - 4
    ? txt(xc + 18, yTop + 28, s, 'svg-muted', 10, 'start')
    : txt(Math.min(VBW - 4 - width10(s) / 2, xc), yTop + 46 + 14, s, 'svg-muted', 10, 'middle'));
  const hang = (xc: number, y: number): ReactNode => (I.r === 2 ? pulley(xc, y - 7, 6) : null); // 2:1: pulley on the car / counterweight
  const car = (xc: number, y: number): ReactNode[] => [hang(xc, y),
    <rect key={key++} x={n1(xc - 30)} y={y} width={60} height={56} rx={4} className="svg-rope svg-car" strokeWidth={1.6} />,
    txt(xc, y + 24, 'Q + P', 'svg-ink', 10.5), txt(xc, y + 40, kgText(I.Q + I.P), 'svg-muted', 10)];
  const cwt = (xc: number, y: number): ReactNode[] => [hang(xc, y), <rect key={key++} x={n1(xc - 12)} y={y} width={24} height={46} rx={3} className="svg-cw" />];
  const machine = (xr: number, cy: number): ReactNode[] => [txt(xr, cy - 4, `D ${fmt(N.D, 0)}`, 'svg-muted', 10, 'end'),
    txt(xr, cy + 10, `i ${fmt(N.i, 0)} · ${fmt(N.Pn, 1)} kW`, 'svg-muted', 10, 'end')];
  const mcw = `M_cw ${kgText(res.Mcw)}`;
  const s: ReactNode[] = [];
  if (I.layout !== 'bottom') {
    const cy = 70;
    s.push(rope(cx - R, cy, cx - R, 180), ...car(cx - R, 180));
    if (I.layout === 'top') {
      s.push(rope(cx + R, cy, cx + R, 128), ...cwt(cx + R, 128), side(cx + R, 128, mcw));
    } else {
      // branch to the deflector leaves the sheave at θ = 180° − α from the vertical (drawing clamped);
      // α > 180° means the rope passes on the inner side of the deflector (reverse bend)
      const thDeg = Math.min(70, Math.max(-20, 180 - a)), th = rad(thDeg), rp = rpOf(12, 26), reverse = thDeg < 0;
      const offs = reverse ? R + rp : R - rp;
      // shortest branch that keeps the pulleys apart; a reverse bend stays short so the drop clears the car
      const Lmin = Math.sqrt((R + rp + 6) ** 2 - offs ** 2), L = reverse ? Lmin : Math.max(46, Lmin);
      const t1x = cx + R * Math.cos(th), t1y = 70 - R * Math.sin(th);
      const t2x = t1x + L * Math.sin(th), t2y = t1y + L * Math.cos(th);
      const sg = reverse ? 1 : -1;
      const dcx = t2x + sg * rp * Math.cos(th), dcy = t2y - sg * rp * Math.sin(th), xr = reverse ? dcx - rp : dcx + rp;
      s.push(rope(t1x, t1y, t2x, t2y), pulley(dcx, dcy, rp), rope(xr, dcy, xr, 158), ...cwt(xr, 158), side(xr, 158, mcw));
    }
    s.push(...sheave(cx, cy));
    const ar = R + 9, p2 = [cx + ar * Math.cos(Math.PI - rad(a)), cy - ar * Math.sin(Math.PI - rad(a))] as const;
    s.push(<path key={key++} d={`M ${cx - ar} ${cy} A ${ar} ${ar} 0 ${a > 180 ? 1 : 0} 1 ${n1(p2[0])} ${n1(p2[1])}`} className="svg-arc" strokeWidth={1.6} strokeDasharray="3 2" />);
    s.push(txt(cx, cy - R - 17, `α ${fmt(a, 1)}°`, 'svg-ink', 12, 'middle', 600), ...machine(cx - R - 22, cy));
  } else {
    // the car hangs clear of the rising branch only if rp ≥ 18
    const cy = 206, top = 50, rp = rpOf(18, 24), ax = cx - R - rp, bx = cx + R + rp;
    s.push(rope(cx - R, cy, cx - R, top), rope(cx + R, cy, cx + R, top));
    s.push(rope(ax - rp, top, ax - rp, 118), ...car(ax - rp, 118));
    s.push(rope(bx + rp, top, bx + rp, 90), ...cwt(bx + rp, 90), txt(bx + rp - 12, 152, mcw, 'svg-muted', 10, 'start'));
    s.push(pulley(ax, top, rp), pulley(bx, top, rp), ...sheave(cx, cy));
    const ar = R + 9;
    s.push(<path key={key++} d={`M ${cx - ar} ${cy} A ${ar} ${ar} 0 0 0 ${cx + ar} ${cy}`} className="svg-arc" strokeWidth={1.6} strokeDasharray="3 2" />);
    s.push(txt(cx, cy + R + 24, `α ${fmt(a, 1)}°`, 'svg-ink', 12, 'middle', 600));
    s.push(<path key={key++} d={`M ${cx + R + 44} ${cy + 12} v -36 m -5 7 l 5 -7 l 5 7`} className="svg-arrow" strokeWidth={1.8} />);
    const rtxt = `R ${kgText(res.shaft.testKg)}`;
    s.push(cx + R + 54 + width10(rtxt) <= VBW - 4 ? txt(cx + R + 54, cy - 2, rtxt, 'svg-muted', 10, 'start') : txt(VBW - 4, cy - 2, rtxt, 'svg-muted', 10, 'end'));
    s.push(txt(cx, 132, `Hv ${fmt(I.Hv, 1)} m`, 'svg-muted', 10), ...machine(cx - R - 12, cy));
  }
  return (
    <div className="diagram">
      <svg viewBox="0 0 320 270" role="img" aria-label={t('aria_diag')}>{s}</svg>
      <div className="cap">{`${t(`lay_${I.layout}`)} · ${I.r}:1 · ${t('diagcap')}`}</div>
    </div>
  );
}
