// The rails of a surveyed lift in the relazione tecnica di modifica (RT plan §3.3, §4.5): what the shaft design gives
// the rails' check on the shaft path (tavole/forces.ts railGeometryOf), the RT's inputs give on the room path — the
// car's sling (central or cantilever), its inside A × B, its centre and its suspension point from the rails' axis, the
// distance of its guide shoes, its entrances; the counterweight's width, depth and shoes; the profile (the catalogue's
// or typed by hand), the steel's Rm and elongation, the rails' length. Sizes in mm as entered, the geometry in m as the
// forces take it; what is missing is listed by its field, never guessed. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import { RAILS, RAIL_SECTIONS, type RailType } from '@/shaft/rails';
import type { CwRailGeometry } from '../../tavole/cw-rail-check';
import type { RailGeometry, Suspension } from '../../tavole/forces';
import type { RailCoreSection, RailOpts } from '../../tavole/rail-check';
import type { RtComponenti } from '../input-componenti';

type GuideCabina = NonNullable<RtComponenti['guideCabina']>;
type GuideCw = NonNullable<RtComponenti['guideContrappeso']>;
type Materiale = Pick<GuideCabina, 'profilo' | 'custom' | 'Rm' | 'allungamento'>;

const CUSTOM = ['A', 'Ix', 'Iy', 'Wx', 'Wy', 'iMin', 'c', 'q'] as const;

/** The rails' section of a block (`campo`: its path, «componenti.guideCabina»): the profile chosen, else the design's
 *  (`progetto`, shaft path); typed by hand all its sizes [mm², mm⁴, mm³, mm, kg/m], its least radius of gyration given. */
export function sezioneDi(g: Materiale | undefined, campo: string, progetto?: RailType): { S: RailCoreSection | null; sigla: string | null; mancanti: string[] } {
  const p = g?.profilo ?? progetto;
  if (!p) return { S: null, sigla: null, mancanti: [`${campo}.profilo`] };
  if (p !== 'custom') return { S: { ...RAIL_SECTIONS[p], q: RAILS[p].q }, sigla: p, mancanti: [] };
  const c = g?.custom ?? {}, mancanti = CUSTOM.filter((k) => c[k] === undefined).map((k) => `${campo}.custom.${k}`);
  const { A, Ix, Iy, Wx, Wy, iMin, c: cc, q } = c;
  if (A === undefined || Ix === undefined || Iy === undefined || Wx === undefined || Wy === undefined || iMin === undefined || cc === undefined || q === undefined) {
    return { S: null, sigla: c.sigla ?? null, mancanti };
  }
  return { S: { A, Ix, Iy, Wx, Wy, c: cc, q, i: iMin }, sigla: c.sigla ?? null, mancanti };
}

/** The steel's options: an Rm other than the registry's (370 N/mm²: no option, the very operations of sheet 1), an
 *  elongation from 8 to 12 %. */
export function opzioniDi(g: Materiale | undefined): Pick<RailOpts, 'Rm' | 'a5'> {
  return { ...(g?.Rm !== undefined && g.Rm !== KV_VERT.railRm ? { Rm: g.Rm } : {}), ...(g?.allungamento === 'da8a12' ? { a5: 'da8a12' as const } : {}) };
}

const sgn = (x: number): number => (x < 0 ? -1 : 1);

/** The suspension point from the rails' axis, turned to the side of the car's offsets; none when not given or at the axis. */
export function sospensioneDi(g: Pick<GuideCabina, 'xS' | 'yS' | 'xC' | 'yC'> | undefined): Suspension | undefined {
  const xS = g?.xS ?? 0, yS = g?.yS ?? 0;
  return xS === 0 && yS === 0 ? undefined : { xS: (xS * sgn(g?.xC ?? 0)) / 1000, yS: (yS * sgn(g?.yC ?? 0)) / 1000 };
}

const CAMPO = 'componenti.guideCabina';

/** The car on its rails from the RT's inputs (room path): central sling — the rails' line across the car's depth B —
 *  or cantilever (zaino) — the rails on a side wall, their line along the depth —; the rated load 1/8 off the car's
 *  centre as sheet 1 takes it (KV_VERT.loadOffset); the sills of the entrances A (front), AB (front and rear), A90 (front
 *  and the side away from the rails). The cantilever asks the car's centre and the suspension point. */
export function geometriaCabina(g: GuideCabina | undefined): { geo: RailGeometry | null; S?: Suspension; mancanti: string[] } {
  const zaino = g?.arcata === 'zaino';
  const req: [keyof GuideCabina, boolean][] = [['arcata', true], ['A', true], ['B', true], ['h', true], ['accessi', true], ['xC', zaino], ['yC', zaino], ['xS', zaino], ['yS', zaino]];
  const mancanti = req.filter(([k, si]) => si && g?.[k] === undefined).map(([k]) => `${CAMPO}.${String(k)}`);
  if (!g || mancanti.length || g.A === undefined || g.B === undefined || g.h === undefined) return { geo: null, mancanti };
  const e = KV_VERT.loadOffset, A = g.A, B = g.B, xC = g.xC ?? 0, yC = g.yC ?? 0, xP = Math.abs(xC) / 1000, yP = Math.abs(yC) / 1000;
  const m = (x: number, y: number): readonly [number, number] => [Math.abs(x) / 1000, Math.abs(y) / 1000];
  // the sills [mm from the rails' axis]: across the rails' line the depth on a central sling, the width on a cantilever
  const front = zaino ? m(xC, yC - B / 2) : m(xC - B / 2, yC), rear = zaino ? m(xC, yC + B / 2) : m(xC + B / 2, yC);
  const side = zaino ? m(Math.abs(xC) + A / 2, yC) : m(xC, Math.abs(yC) + A / 2);
  const sills = g.accessi === 'AB' ? [front, rear] : g.accessi === 'A90' ? [front, side] : [front];
  const geo: RailGeometry = zaino
    ? { n: 2, h: g.h / 1000, xP, yP, xQ: xP + (A * e) / 1000, yQ: yP + (B * e) / 1000, sills }
    : { n: 2, h: g.h / 1000, xP, yP, xQ: xP + (B * e) / 1000, yQ: yP + (A * e) / 1000, sills };
  const S = sospensioneDi(g);
  return { geo, ...(S ? { S } : {}), mancanti };
}

/** The counterweight on its rails from the RT's inputs (room path): its width between its rails, its depth, its shoes,
 *  the rails' length and the bracket pitch of the plant data. */
export function geometriaContrappeso(g: GuideCw | undefined, S: RailCoreSection | null, passo: number | undefined): { geo: CwRailGeometry | null; mancanti: string[] } {
  const c = 'componenti.guideContrappeso';
  const mancanti = [
    ...(['larghezza', 'profondita', 'h', 'colonna'] as const).filter((k) => g?.[k] === undefined).map((k) => `${c}.${k}`),
    ...(passo === undefined ? ['impianto.cwBracketPitch'] : []),
  ];
  if (!g || !S || passo === undefined || g.larghezza === undefined || g.profondita === undefined || g.h === undefined || g.colonna === undefined) return { geo: null, mancanti };
  return { geo: { section: S, l: passo, len: g.colonna * 1000, width: g.larghezza / 1000, depth: g.profondita / 1000, h: g.h / 1000 }, mancanti };
}
