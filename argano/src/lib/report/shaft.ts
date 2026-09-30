// Section of the relazione for the shaft design a calculation comes from: what was measured and how, the plan at the
// main floor to a standard scale (drawn by the drawing kernel, like the drawing set), the checks of the shaft with
// their clauses, the allowances assumed and the limits of the model. Pure.
import appIt from '../../../messages/it.json';
import type { CheckStatus } from '@/calc/types';
import { fitView, renderView, moveShapes, type Box } from '@/drawing';
import { DEFAULTS, isUpperLimit, planDims, planEntities, travel, verdictOf, vociOfDesign, type Allowance, type Layout, type ShaftCheckId } from '@/shaft';
import type { ShaftSource } from '../shaft-input';
import type { ReportBlock } from './model';

export interface ReportDesign {
  id: string;
  label: string | null;
  createdAt: Date;
  sha256: string;
  engineVersion: string;
  profileId: string;
  author: string | null;
  source: ShaftSource | null;
  /** the layout recomputed by the running engine, which reproduced the stored hash */
  layout: Layout;
}

export interface ShaftTexts {
  fmt(x: number, dec?: number): string;
  st(s: CheckStatus): string;
  when(d: Date): string;
  /** heads of the checks table, the same as the machine's */
  head: string[];
}

const S = appIt.shaft;
const VERDICT = { ok: 'supera le verifiche del vano', warn: 'supera, con avvisi', fail: 'non supera le verifiche del vano' } as const;
const ENTRANCES = { one: 'un accesso', opposite: 'due accessi opposti', adjacent: 'due accessi adiacenti a 90° (arcata a zaino)' } as const;
// the screen labels carry their clause in brackets; the report has a column for it
const plain = (label: string): string => label.replace(/\s*\((UNI|DM) [^)]*\)$/, '');

/** Width of the report's text frame and the most height the plan may take [mm]. */
const PLAN_W = 178, PLAN_H = 175, PAD = 3;

/** The plan at the main floor, laid out by the drawing kernel in a box as wide as the report's text frame. */
export function planBlock(L: Layout): ReportBlock {
  const { W, D, wall: T } = L.inputs, V = L.inputs.vertical, f = Math.min(V.main, V.floors.length - 1);
  const ents = [...planEntities(L, 'main', f), ...planDims(L, 'main', f, { level: `piano "${V.floors[f]?.label ?? ''}"` })];
  const area: Box = { x0: PAD, y0: PAD, x1: PLAN_W - PAD, y1: PLAN_H - PAD };
  const place = fitView({ x0: -T, y0: -T, x1: W + T, y1: D + T }, ents, area, [10, 20, 25, 50, 100, 200]) ?? { scale: 200, ox: PLAN_W / 2, oy: PLAN_H / 2 };
  const r = renderView(ents, place);
  // no empty band above or below the drawing
  return { t: 'plan', shapes: moveShapes(r.shapes, 0, PAD - r.extent.y0), w: PLAN_W, h: r.extent.y1 - r.extent.y0 + 2 * PAD, scale: `Scala 1:${place.scale} sul foglio A4 stampato al 100%` };
}

export function shaftBlocks(d: ReportDesign, calcQ: number, x: ShaftTexts): ReportBlock[] {
  const L = d.layout, I = L.inputs, src = d.source, { fmt, st } = x;
  const B: ReportBlock[] = [];
  if (Math.abs(calcQ - L.Q) > 0.5) {
    B.push({ t: 'box', text: `La portata del calcolo (${fmt(calcQ, 0)} kg) è diversa da quella del progetto del vano (${fmt(L.Q, 0)} kg): la pianta e le verifiche in pianta valgono per ${fmt(L.Q, 0)} kg.` });
  }
  if (!L.fits) B.push({ t: 'box', text: S.notFit });
  B.push(planBlock(L));
  const V = I.vertical;

  B.push({ t: 'kv', rows: [
    ['Progetto del vano', `${d.id}${d.label ? ` · ${d.label}` : ''} · ${x.when(d.createdAt)} · ${d.author ?? '—'}`],
    ['Vano, luce netta', `${fmt(I.W, 0)} × ${fmt(I.D, 0)} mm (larghezza sul lato delle porte × profondità)`],
    ['Origine delle misure', src
      ? `rilievo sul disegno ${src.file} (${src.format.toUpperCase()} ${src.version}, 1 unità = ${fmt(src.mmPerUnit, src.mmPerUnit % 1 ? 1 : 0)} mm), da controllare in cantiere`
      : 'misure inserite a mano'],
    ...(src ? [['Impronta SHA-256 del disegno', src.sha256] as [string, string]] : []),
    ['Cabina proposta, interno', `${fmt(L.A, 0)} × ${fmt(L.B, 0)} mm · ${fmt(L.area, 2)} m² su ${fmt(L.areaMax, 2)} m² ammessi per ${fmt(L.Q, 0)} kg`],
    ['Portata · persone', `${fmt(L.Q, 0)} kg (${L.Qgiven ? 'data' : 'dalla superficie della cabina più grande che entra'}) · ${L.persons} persone`],
    ['Porte · contrappeso', `${S[I.door]}, luce netta ${fmt(I.doorWidth, 0)} × ${fmt(I.doorHeight, 0)} mm, ${ENTRANCES[I.entrances]} · contrappeso: ${S[`cw_${L.cwSide}` as const].toLowerCase()}`],
    ['Fermate · corsa · velocità', `${V.floors.length} fermate · ${fmt(travel(V.floors) / 1000, 2)} m · ${fmt(V.v, 2)} m/s`],
    ['Fossa · testata', `${fmt(V.pit, 0)} mm · ${fmt(V.headroom, 0)} mm`],
    ['Accessibilità', S[`access_${I.access}` as const]],
    ['Esito delle verifiche del vano', VERDICT[verdictOf(L)]],
    ['Motore del progetto', `Argano vano ${d.engineVersion} · profilo normativo ${d.profileId}`],
    ['Impronta SHA-256 del progetto', d.sha256],
  ] });
  const voci = vociOfDesign(I.access);
  const refOf = (id: ShaftCheckId): string => [...new Set(voci.filter((v) => v.verifiche?.includes(id)).flatMap((v) => v.riferimento.split('; '))
    .map((r) => r.trim()).filter((r) => r && r !== '—'))].join('; ') || 'modello di calcolo del software';
  B.push({ t: 'h3', text: 'Verifiche del vano: pianta, sezione e locale macchina' });
  B.push({ t: 'grid', head: x.head, rows: L.checks.map((c) => {
    const unit = c.unit ? ` ${c.unit}` : '';
    return [plain(S[`c_${c.id}` as const]), c.value === null ? '—' : `${fmt(c.value, c.dec)}${unit}`, c.limit === null ? '' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}`, st(c.status), refOf(c.id)];
  }), status: L.checks.map((c) => c.status), statusCol: 3, widths: [0.34, 0.11, 0.11, 0.12, 0.32], align: ['l', 'r', 'r', 'l', 'l'] });

  B.push({ t: 'h3', text: 'Ingombri considerati' });
  B.push({ t: 'kv', rows: (Object.keys(DEFAULTS) as Allowance[]).map((k): [string, string] => [S[`a_${k}` as const], `${fmt(I[k], 0)} mm${I[k] === DEFAULTS[k] ? ' (valore tipico)' : ''}`]) });
  B.push({ t: 'p', text: S.limits, style: 'note' });
  return B;
}
