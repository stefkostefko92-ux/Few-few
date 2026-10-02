// Drilling tables: every hole of every part in finished-part coordinates (face A up, u along the length from the
// u = 0 end, v across from the v = 0 edge), grouped per part, the full CSV, and hardware cards that state which
// holes each hinge, handle and slide needs and where.
import { edgeLabels } from './panel.js';
import { toCsv } from './bom.js';
import { r1 } from './util.js';

export const PURPOSE = {
  system: 'Система 32 mm (рафтоносачи)',
  cup: 'Чашка на панта',
  'cup-dowel': 'Дюбел на панта',
  'cup-screw': 'Винт на панта — без отвор',
  plate: 'Планка на панта',
  handle: 'Дръжка',
  confirmat: 'Конфирмат (през плочата)',
  slide: 'Водач (пилотен)',
  pilot: 'Пилотен отвор',
  screw: 'Винт (проходен)',
  bedfit: 'Връзка за легло — само място',
};
export const purposeOf = (kind) => PURPOSE[kind] ?? kind;

const dec = (v) => String(r1(v)).replace('.', ',');
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

// Per part: one line per (purpose, Ø, depth) with the count.
export function holeGroups(part) {
  const g = new Map();
  for (const h of partHoles(part)) {
    if (h.mark) continue;
    const k = `${h.kind}|${h.d}|${h.depth}`;
    const cur = g.get(k) ?? { kind: h.kind, purpose: h.purpose, d: h.d, depth: h.depth, through: h.through, label: h.label, count: 0 };
    cur.count += 1;
    g.set(k, cur);
  }
  return [...g.values()];
}

export function drillCsv(model) {
  const head = ['Детайл №', 'Детайл', 'Модул', '№ отвор', 'X (u)', 'Y (v)', 'Ø', 'Дълбочина', 'Проходен', 'Предназначение', 'Обков', 'Ръб u=0', 'Ръб v=0'];
  const rows = [head];
  for (const p of model.parts) {
    const e = edgeLabels(p);
    for (const h of partHoles(p)) {
      if (h.mark) continue;
      rows.push([p.id, p.name, p.module ?? '', h.no, dec(h.u), dec(h.v), dec(h.d), dec(h.depth), h.through ? 'да' : 'не', h.purpose, h.label, e.u0, e.v0]);
    }
    for (const op of p.edgeOps) {
      op.at.forEach(([u, v], i) => rows.push([p.id, p.name, p.module ?? '', `Ч${i + 1}`, dec(u), dec(v), dec(op.d), dec(op.depth), 'не', `Хоризонтален в чело ${op.edge} (${purposeOf(op.kind)})`, '', e.u0, e.v0]));
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
      if (!h.ref || !['cup', 'cup-dowel', 'cup-screw', 'plate', 'handle', 'slide'].includes(h.kind)) continue;
      if (!byRef.has(h.ref)) byRef.set(h.ref, []);
      byRef.get(h.ref).push(h);
    }
    for (const [ref, holes] of byRef) {
      const k0 = holes[0].kind;
      const type = k0 === 'handle' ? 'handle' : k0 === 'slide' ? 'slide' : 'hinge';
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
        const hs = holes.filter((h) => h.kind === 'handle').sort(byPos);
        entry.handle = { count: hs.length, d: hs[0].d, spacing: hs.length === 2 ? r1(Math.hypot(hs[1].u - hs[0].u, hs[1].v - hs[0].v)) : null };
      }
      c.parts.push(entry);
    }
  }
  return [...cards.values()];
}
