// Drilling tables: every hole of every part in finished-part coordinates (face A up, u along the length from the
// u = 0 end, v across from the v = 0 edge), grouped per part, the full CSV, and hardware cards that state which
// holes each hinge, handle and slide needs and where.
import { edgeLabels } from './panel.js';
import { toCsv } from './bom.js';
import { r1, neg, dimTxt } from './util.js';

const PURPOSE = {
  system: 'Система 32 mm (рафтоносачи)',
  cup: 'Чашка на панта',
  'cup-dowel': 'Дюбел на панта',
  'cup-screw': 'Винт на панта — без отвор',
  plate: 'Планка на панта',
  handle: 'Дръжка',
  'handle-mark': 'Дръжка — по шаблона на производителя, без отвор',
  confirmat: 'Конфирмат (през плочата)',
  slide: 'Водач (пилотен)',
  'slide-hook': 'Водач — заден отвор за закачване',
  pilot: 'Пилотен отвор',
  screw: 'Винт (проходен)',
  bedfit: 'Връзка за легло — само място',
  'stack-pilot': 'Пилот Ø3 — на място, през отвора на горния корпус',
};
export const purposeOf = (kind) => PURPOSE[kind] ?? kind;
// A horizontal hole in an edge is the other half of the joint: PURPOSE describes the hole through the face.
const EDGE_PURPOSE = { confirmat: 'Конфирмат, за резбата' };
export const edgePurposeOf = (kind) => EDGE_PURPOSE[kind] ?? purposeOf(kind);
const byPos = (a, b) => a.u - b.u || a.v - b.v;

// Holes of a part numbered 1…n in a stable order (by purpose, then position); marks (no drilling) come last.
export function partHoles(part) {
  const order = Object.keys(PURPOSE);
  const holes = part.features
    .filter((f) => f.type === 'hole' || f.type === 'mark')
    .slice()
    .sort((a, b) => (a.type === 'mark') - (b.type === 'mark') || order.indexOf(a.kind) - order.indexOf(b.kind) || byPos(a, b));
  return holes.map((f, i) => ({
    no: i + 1,
    u: f.u,
    v: f.v,
    d: f.d ?? null,
    depth: f.depth ?? null,
    through: Boolean(f.through),
    kind: f.kind,
    purpose: purposeOf(f.kind),
    label: f.label ?? '',
    ref: f.ref ?? null,
    refName: f.refName ?? null,
    mark: f.type === 'mark',
  }));
}

// The real-world name of the edge a horizontal hole goes into (op.edge is the edge's outward direction).
export function edgeOpName(part, labels, dir) {
  if (dir === part.frame.eu) return labels.u1;
  if (dir === neg(part.frame.eu)) return labels.u0;
  if (dir === part.frame.ev) return labels.v1;
  return labels.v0;
}

export function drillCsv(model) {
  const head = ['Детайл №', 'Детайл', 'Модул', '№ отвор', 'X (u)', 'Y (v)', 'Ø', 'Дълбочина', 'Проходен', 'Предназначение', 'Обков', 'Ръб u=0', 'Ръб v=0'];
  const rows = [head];
  for (const p of model.parts) {
    const e = edgeLabels(p);
    for (const h of partHoles(p)) {
      if (h.mark) continue;
      rows.push([p.id, p.name, p.module ?? '', h.no, dimTxt(h.u), dimTxt(h.v), dimTxt(h.d), dimTxt(h.depth), h.through ? 'да' : 'не', h.purpose, h.label, e.u0, e.v0]);
    }
    let ch = 0; // Ч1…Чn run over all the edges of the part, so a number names one hole
    for (const op of p.edgeOps) {
      for (const [u, v] of op.at) rows.push([p.id, p.name, p.module ?? '', `Ч${++ch}`, dimTxt(u), dimTxt(v), dimTxt(op.d), dimTxt(op.depth), 'не', `Хоризонтален в чело „${edgeOpName(p, e, op.edge)}“ (${edgePurposeOf(op.kind)})`, op.label ?? '', e.u0, e.v0]);
    }
  }
  return toCsv(rows);
}

// Hardware cards: for every hinge, handle and slide product the holes it needs on each part.
export function hardwareCards(model) {
  const cards = new Map();
  const card = (ref, type, label) => {
    if (!cards.has(ref)) cards.set(ref, { ref, type, label, parts: [] });
    return cards.get(ref);
  };
  for (const p of model.parts) {
    const byRef = new Map();
    for (const h of partHoles(p)) {
      if (!h.ref || !['cup', 'cup-dowel', 'cup-screw', 'plate', 'handle', 'handle-mark', 'slide'].includes(h.kind)) continue;
      if (!byRef.has(h.ref)) byRef.set(h.ref, []);
      byRef.get(h.ref).push(h);
    }
    for (const [ref, holes] of byRef) {
      const k0 = holes[0].kind;
      const type = k0 === 'handle' || k0 === 'handle-mark' ? 'handle' : k0 === 'slide' ? 'slide' : 'hinge';
      const c = card(ref, type, holes.find((h) => h.refName)?.refName ?? holes[0].label);
      const entry = { partId: p.id, name: p.name, L: p.L, W: p.W, edges: edgeLabels(p), holes };
      if (p.role === 'door') {
        const cups = holes.filter((h) => h.kind === 'cup');
        if (cups.length) {
          const left = p.hingeSide === 'left';
          // door frame: u runs up the door, v runs from the left edge (seen from the front) to the right
          entry.cup = { d: cups[0].d, depth: cups[0].depth, boring: r1((left ? cups[0].v : p.W - cups[0].v) - cups[0].d / 2), side: p.hingeSide, heights: cups.map((h) => h.u) };
        }
      }
      if (type === 'handle') {
        const hs = holes.filter((h) => h.kind === 'handle' || h.kind === 'handle-mark').sort(byPos);
        entry.handle = { count: hs.length, d: hs[0].d, template: hs[0].mark, spacing: hs.length === 2 ? r1(Math.hypot(hs[1].u - hs[0].u, hs[1].v - hs[0].v)) : null };
      }
      c.parts.push(entry);
    }
  }
  return [...cards.values()];
}
