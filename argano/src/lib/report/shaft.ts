// Section of the relazione for the shaft design a calculation comes from: what was measured and how, the plan to a
// standard scale, the checks in plan with their clauses, the allowances assumed and the limits of the model. Pure.
import appIt from '../../../messages/it.json';
import type { CheckStatus } from '@/calc/types';
import { DEFAULTS, drawPlan, explodeDim, isUpperLimit, verdictOf, vociOfDesign, type Allowance, type Drawing, type Layout, type ShaftCheckId } from '@/shaft';
import { PLAN_LABELS_IT } from '../shaft-labels';
import type { ShaftSource } from '../shaft-input';
import type { PlanItem, ReportBlock } from './model';

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
const VERDICT = { ok: 'supera le verifiche in pianta', warn: 'supera, con avvisi', fail: 'non supera le verifiche in pianta' } as const;
// the screen labels carry their clause in brackets; the report has a column for it
const plain = (label: string): string => label.replace(/\s*\((UNI|DM) [^)]*\)$/, '');

/** The primitives of the plan for the renderer: dimensions become lines and one text, vertical texts an angle. */
export function planItems(d: Drawing): PlanItem[] {
  return d.prims.flatMap((p): PlanItem[] => {
    switch (p.k) {
      case 'poly':
      case 'line':
        return [p];
      case 'text':
        return [{ k: 'text', layer: p.layer, at: p.at, h: p.h, text: p.text, align: p.align, angle: p.vertical ? Math.PI / 2 : 0 }];
      case 'dim': {
        const e = explodeDim(p);
        return [...e.lines.map(([a, b]): PlanItem => ({ k: 'line', layer: 'QUOTE', a, b })),
          { k: 'text', layer: 'QUOTE', at: e.text.at, h: e.text.h, text: e.text.value, align: 'c', angle: e.text.angle }];
      }
    }
  });
}

export function shaftBlocks(d: ReportDesign, calcQ: number, x: ShaftTexts): ReportBlock[] {
  const L = d.layout, I = L.inputs, src = d.source, { fmt, st } = x;
  const B: ReportBlock[] = [];
  if (Math.abs(calcQ - L.Q) > 0.5) {
    B.push({ t: 'box', text: `La portata del calcolo (${fmt(calcQ, 0)} kg) è diversa da quella del progetto del vano (${fmt(L.Q, 0)} kg): la pianta e le verifiche in pianta valgono per ${fmt(L.Q, 0)} kg.` });
  }
  if (!L.fits) B.push({ t: 'box', text: S.notFit });

  const drawing = drawPlan(L, PLAN_LABELS_IT);
  B.push({ t: 'plan', items: planItems(drawing), bounds: drawing.bounds, maxHeight: 175, scale: 'Scala 1:{n} sul foglio A4 stampato al 100%' });

  B.push({ t: 'kv', rows: [
    ['Progetto del vano', `${d.id}${d.label ? ` · ${d.label}` : ''} · ${x.when(d.createdAt)} · ${d.author ?? '—'}`],
    ['Vano, luce netta', `${fmt(I.W, 0)} × ${fmt(I.D, 0)} mm (larghezza sul lato delle porte × profondità)`],
    ['Origine delle misure', src
      ? `rilievo sul disegno ${src.file} (${src.format.toUpperCase()} ${src.version}, 1 unità = ${fmt(src.mmPerUnit, src.mmPerUnit % 1 ? 1 : 0)} mm), da controllare in cantiere`
      : 'misure inserite a mano'],
    ...(src ? [['Impronta SHA-256 del disegno', src.sha256] as [string, string]] : []),
    ['Cabina proposta, interno', `${fmt(L.A, 0)} × ${fmt(L.B, 0)} mm · ${fmt(L.area, 2)} m² su ${fmt(L.areaMax, 2)} m² ammessi per ${fmt(L.Q, 0)} kg`],
    ['Portata · persone', `${fmt(L.Q, 0)} kg (${L.Qgiven ? 'data' : 'dalla superficie della cabina più grande che entra'}) · ${L.persons} persone`],
    ['Porte · contrappeso', `${S[I.door]}, luce netta ${fmt(I.doorWidth, 0)} mm · contrappeso: ${S[`cw_${I.cw}` as const].toLowerCase()}`],
    ['Accessibilità', S[`access_${I.access}` as const]],
    ['Esito in pianta', VERDICT[verdictOf(L)]],
    ['Motore del progetto', `Argano vano ${d.engineVersion} · profilo normativo ${d.profileId}`],
    ['Impronta SHA-256 del progetto', d.sha256],
  ] });
  const voci = vociOfDesign(I.access);
  const refOf = (id: ShaftCheckId): string => [...new Set(voci.filter((v) => v.verifiche?.includes(id)).flatMap((v) => v.riferimento.split('; '))
    .map((r) => r.trim()).filter((r) => r && r !== '—'))].join('; ') || 'modello di calcolo del software';
  B.push({ t: 'h3', text: 'Verifiche in pianta' });
  B.push({ t: 'grid', head: x.head, rows: L.checks.map((c) => {
    const unit = c.unit ? ` ${c.unit}` : '';
    return [plain(S[`c_${c.id}` as const]), c.value === null ? '—' : `${fmt(c.value, c.dec)}${unit}`, c.limit === null ? '' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)}${unit}`, st(c.status), refOf(c.id)];
  }), status: L.checks.map((c) => c.status), statusCol: 3, widths: [0.34, 0.11, 0.11, 0.12, 0.32], align: ['l', 'r', 'r', 'l', 'l'] });

  B.push({ t: 'h3', text: 'Ingombri considerati' });
  B.push({ t: 'kv', rows: (Object.keys(DEFAULTS) as Allowance[]).map((k): [string, string] => [S[`a_${k}` as const], `${fmt(I[k], 0)} mm${I[k] === DEFAULTS[k] ? ' (valore tipico)' : ''}`]) });
  B.push({ t: 'p', text: S.limits, style: 'note' });
  return B;
}
