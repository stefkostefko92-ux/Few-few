// The lettering of the machine room's sheets as it is drawn (round 37): the names, the notes and the references placed
// with the boxes the kernel draws them in (TEXT.min at least, a reference's circle tagRadius) and at the scale the plan
// takes — on the plan and in section B-B of every kind of installation and of a replacement's survey not one lettering
// over another, each inside the frame; the HEB beams' note whole inside the sheet; P2 and P3 once each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { FRAME, TEXT, drawingArea, tagRadius, textBox, textQuad, type Pt, type Shape } from '@/drawing';
import { defaultLift, deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '@/lib/lift/marks';
import { buildTavole } from '@/lib/tavole/build';
import { storedInput } from '@/lib/tavole/compose';
import { surveyView } from '@/lib/tavole/views';
import { HEB_PAD } from '@/shaft/support';
import { KV_VERT } from '@/shaft/norme-vert';
import { AT, dimBands, gridNear, letteringBox, meets, placeOf, takenBy } from '@/shaft/room-label';
import { deriveRoom } from '../room/derive';
import { startSurvey } from '../room/survey';

type Room = NonNullable<LiftInputs['shaft']['room']>;
const base = (): LiftInputs => newLift(), room = (L: LiftInputs): Room => L.shaft.room as Room;
const withRoom = (L: LiftInputs, r: Partial<Room>): LiftInputs => ({ ...L, shaft: { ...L.shaft, room: { ...room(L), ...r } } });
const calc = (L: LiftInputs, c: Record<string, string>): LiftInputs => ({ ...L, calc: { ...L.calc, ...c } });
const cw = (L: LiftInputs, side: 'rear' | 'left' | 'right', cwPos?: number): LiftInputs =>
  ({ ...L, shaft: { ...L.shaft, cw: side, ...(cwPos !== undefined ? { plan: { ...(L.shaft.plan ?? {}), cwPos } } : {}) } });
const sup = (L: LiftInputs, s: Room['support']): LiftInputs => withRoom(L, { support: s });
const direct = (L: LiftInputs): LiftInputs => calc(L, { layout: 'top' });
const maker = (L: LiftInputs, brand: NonNullable<LiftInputs['catalog']>['brand'], model: string): LiftInputs => ({ ...L, catalog: { brand, model } });
const IPE = { kind: 'beams', profile: 'IPE 240' } as const;

/** Every kind of machine room over the shaft: straight, askew and turned, on every support, on HEB beams, the makers'
 *  machines, 2:1 and the replacement's example (the round 37 audit's installations). */
const ROOMS: [string, () => LiftInputs][] = [
  ['tipico', base], ['cw sinistra', () => cw(base(), 'left')], ['cw destra', () => cw(base(), 'right')], ['cw dietro 150', () => cw(base(), 'rear', 150)],
  ['girata', () => withRoom(base(), { motor: 'car' })], ['sinistra girata', () => withRoom(cw(base(), 'left'), { motor: 'car' })],
  ['sbieco sinistra 300', () => cw(base(), 'left', 300)], ['sbieco destra 700', () => cw(base(), 'right', 700)], ['sbieco dietro 550', () => cw(base(), 'rear', 550)],
  ['spessori', () => sup(direct(base()), { kind: 'shims' })], ['telaio', () => sup(direct(base()), { kind: 'frame' })], ['putrelle', () => sup(direct(base()), IPE)],
  ['piastre', () => sup(direct(base()), { kind: 'plates' })], ['plinto', () => sup(direct(base()), { kind: 'plinth' })],
  ['telaio sinistra', () => sup(direct(cw(base(), 'left')), { kind: 'frame' })], ['putrelle sinistra', () => sup(direct(cw(base(), 'left')), IPE)],
  ['plinto destra', () => sup(direct(cw(base(), 'right')), { kind: 'plinth' })], ['piastre dietro', () => sup(direct(cw(base(), 'rear', 150)), { kind: 'plates' })],
  ['telaio sbieco', () => sup(direct(cw(base(), 'left', 300)), { kind: 'frame' })], ['putrelle sbieco', () => sup(direct(cw(base(), 'rear', 550)), IPE)],
  ['plinto sbieco', () => sup(direct(cw(base(), 'right', 700)), { kind: 'plinth' })], ['piastre sbieco', () => sup(direct(cw(base(), 'left', 300)), { kind: 'plates' })],
  ['spessori girata', () => withRoom(sup(direct(cw(base(), 'left')), { kind: 'shims' }), { motor: 'car' })],
  ['telaio e rinvio', () => sup(base(), { kind: 'frame' })], ['putrelle e rinvio', () => sup(base(), IPE)], ['plinto e rinvio', () => sup(cw(base(), 'left'), { kind: 'plinth' })],
  ['HEB x', () => withRoom(sup(direct(base()), { kind: 'frame' }), { heb: { dir: 'x' } })], ['HEB y', () => withRoom(sup(direct(base()), { kind: 'frame' }), { heb: { dir: 'y' } })],
  ['HEB sinistra', () => withRoom(cw(base(), 'left'), { heb: {} })], ['HEB sbieco', () => withRoom(sup(direct(cw(base(), 'rear', 550)), { kind: 'frame' }), { heb: {} })],
  ['HEB rinvio sbieco', () => withRoom(cw(base(), 'left', 300), { heb: {} })], ['HEB rinvio', () => withRoom(base(), { heb: {} })],
  ['SH160', () => maker(base(), 'SICOR', 'SH160')], ['SH160 sinistra', () => maker(cw(base(), 'left'), 'SICOR', 'SH160')],
  ['SH160 sbieco', () => maker(cw(base(), 'rear', 550), 'SICOR', 'SH160')], ['M93 sbieco', () => maker(cw(base(), 'left', 300), 'Montanari', 'M93')],
  ['TORO sbieco girata', () => withRoom(maker(cw(base(), 'right', 700), 'Sassi', 'TORO'), { motor: 'car' })], ['SH160 girata', () => withRoom(maker(base(), 'SICOR', 'SH160'), { motor: 'car' })],
  ['SH140 telaio', () => sup(maker(base(), 'SICOR', 'SH140'), { kind: 'frame' })], ['SH110B putrelle', () => sup(maker(direct(cw(base(), 'left')), 'SICOR', 'SH110B'), IPE)],
  ['SV110', () => maker(base(), 'SICOR', 'SV110')], ['SV110 sinistra', () => maker(cw(base(), 'left'), 'SICOR', 'SV110')],
  ['MR21 piastre', () => sup(maker(direct(base()), 'SICOR', 'MR21'), { kind: 'plates' })], ['MR35 telaio destra', () => sup(maker(direct(cw(base(), 'right')), 'SICOR', 'MR35'), { kind: 'frame' })],
  ['SH190 spessori', () => sup(maker(direct(base()), 'SICOR', 'SH190'), { kind: 'shims' })], ['M93', () => maker(base(), 'Montanari', 'M93')],
  ['M93 sinistra girata', () => withRoom(maker(cw(base(), 'left'), 'Montanari', 'M93'), { motor: 'car' })], ['LEO', () => maker(base(), 'Sassi', 'LEO')],
  ['TORO sinistra', () => maker(cw(base(), 'left'), 'Sassi', 'TORO')], ['MB95 telaio', () => sup(maker(direct(base()), 'Sassi', 'MB95'), { kind: 'frame' })],
  ['MODY plinto', () => sup(maker(direct(base()), 'Sassi', 'MODY'), { kind: 'plinth' })],
  ['2:1', () => calc(base(), { r: '2' })], ['2:1 sinistra SH160', () => maker(calc(cw(base(), 'left'), { r: '2' }), 'SICOR', 'SH160')], ['sostituzione', defaultLift],
];

const sheets = (inp: LiftInputs) => {
  const d = deriveLift(inp), marks = valueMarks(inp.auto, d, d.bottom, d.collaudo), project = { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: '', client: '' };
  const x = storedInput(d.values, d.layout, { number: '26-001', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] }, null, marks);
  assert.ok(x);
  return buildTavole(x);
};

/** How deep two convex outlines overlap (separating axes) [mm]; 0 apart. */
function depth(A: readonly Pt[], B: readonly Pt[]): number {
  let best = Infinity;
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n: Pt = [a[1] - b[1], b[0] - a[0]], l = Math.hypot(n[0], n[1]) || 1;
    const pa = A.map((p) => (p[0] * n[0] + p[1] * n[1]) / l), pb = B.map((p) => (p[0] * n[0] + p[1] * n[1]) / l);
    const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (o <= 0) return 0;
    best = Math.min(best, o);
  }
  return best;
}

/** The letterings of a view or a sheet as drawn: each text turned as it is, a reference (a circle on paper with its
 *  letters in its middle: view.ts tag) as the square round its circle. */
function letterings(shapes: readonly Shape[]): { text: string; q: readonly Pt[] }[] {
  const mid = (s: Shape, c: Shape): boolean => s.t === 'text' && c.t === 'circle' && Math.hypot(s.at[0] - c.c[0], s.at[1] + s.size * 0.36 - c.c[1]) < 0.5;
  const tags = shapes.flatMap((c) => {
    if (c.t !== 'circle' || c.fill?.k !== 'solid' || c.fill.ink !== 'paper' || c.r < 2.4 - 1e-9) return [];
    const t = shapes.find((s) => mid(s, c));
    return t?.t === 'text' ? [{ c, t }] : [];
  });
  return [
    ...shapes.flatMap((s) => (s.t === 'text' && !tags.some((g) => g.t === s) ? [{ text: s.text, q: textQuad(s) }] : [])),
    ...tags.map(({ c, t }) => ({ text: `(${t.text})`, q: [[c.c[0] - c.r, c.c[1] - c.r], [c.c[0] + c.r, c.c[1] - c.r], [c.c[0] + c.r, c.c[1] + c.r], [c.c[0] - c.r, c.c[1] + c.r]] as const })),
  ];
}
const overlaps = (shapes: readonly Shape[]): string[] => {
  const ls = letterings(shapes), out: string[] = [];
  for (const [i, a] of ls.entries()) for (const b of ls.slice(i + 1)) if (depth(a.q, b.q) > 0.4) out.push(`«${a.text}» × «${b.text}»`);
  return out;
};

test('locale macchina, pianta e sezione B-B: nessuna scritta né riferimento sopra un altro, tutto nella cornice, P2 e P3 una volta', () => {
  for (const [name, make] of ROOMS) {
    const r = sheets(make());
    for (const i of [7, 8]) {
      const page = r.doc.pages[i], title = r.sheets[i]?.title ?? '';
      assert.ok(page && title.includes('LOCALE MACCHINA'), `${name}: foglio ${i + 1} ${title}`);
      const drawn = page.shapes.filter((s) => s.t !== 'text' || s.at[1] > FRAME.y0 + 30);
      assert.deepEqual(overlaps(drawn), [], `${name}, foglio ${i + 1}`);
      for (const s of page.shapes) if (s.t === 'text') {
        const b = textBox(s);
        assert.ok(b.x0 >= FRAME.x0 - 0.2 && b.x1 <= FRAME.x1 + 0.2 && b.y0 >= FRAME.y0 - 0.2 && b.y1 <= FRAME.y1 + 0.2, `${name}, foglio ${i + 1}: «${s.text}» fuori dalla cornice`);
      }
      // each load named once (round 36 drew P2 and P3 twice on a 2:1 plan)
      const refs = page.shapes.flatMap((s) => (s.t === 'text' && /^[PR]\d$/.test(s.text) ? [s.text] : []));
      assert.equal(new Set(refs).size, refs.length, `${name}, foglio ${i + 1}: ${refs.join(' ')}`);
    }
  }
});

test('sostituzione: pianta e B-B del rilievo senza scritte sovrapposte, dentro l’area del foglio', () => {
  const area = drawingArea(true), inner = { x0: area.x0 + 8, y0: area.y0 + 8, x1: area.x1 - 8, y1: area.y1 - 8 };
  for (const [pn, preset] of Object.entries(PRESETS)) for (const calata of [600, 780]) for (const support of ['frame', 'plinth', null] as const) {
    const s = startSurvey(calata), V: FormValues = { ...preset, context: 'repl', alphaMode: 'geo', h: 0.95 };
    const d = deriveRoom(V, support ? { ...s, room: { ...s.room, support: { kind: support } } } : s);
    for (const kind of ['plan', 'section'] as const) {
      const v = surveyView(d, kind, inner), tag = `${pn} ${calata} ${support ?? '-'} ${kind}`;
      if (!v) continue;
      assert.deepEqual(overlaps(v.r.shapes), [], tag);
      for (const t of v.r.shapes) if (t.t === 'text') {
        const b = textBox(t);
        assert.ok(b.x0 >= area.x0 - 0.2 && b.x1 <= area.x1 + 0.2 && b.y0 >= area.y0 - 0.2 && b.y1 <= area.y1 + 0.2, `${tag}: «${t.text}»`);
      }
    }
  }
});

test('locale grande: la pianta a 1:50 con i nomi e i riferimenti misurati a quella scala', () => {
  for (const [W, D] of [[3600, 3600], [4200, 4000], [5000, 4500]]) {
    const r = sheets(withRoom(base(), { W, D }));
    assert.equal(r.sheets[7]?.scale, 50, `${W}×${D}`);
    assert.deepEqual(overlaps(r.doc.pages[7]?.shapes.filter((s) => s.t !== 'text' || s.at[1] > FRAME.y0 + 30) ?? []), [], `${W}×${D}`);
  }
});

test('B-B con le putrelle HEB: la nota di appoggi e fissaggio intera, nella cornice, con la linea di richiamo a un appoggio', () => {
  const pad = `HEB su piastre ${KV_VERT.hebBearing}×${KV_VERT.hebPlateW}×${KV_VERT.hebPlateT} e malta antiritiro ${KV_VERT.hebMortar} sopra i muri del vano · distacco ${HEB_PAD} dalla soletta fra gli appoggi`;
  for (const [name, make] of ROOMS.filter(([n]) => n.startsWith('HEB'))) {
    const page = sheets(make()).doc.pages[8]?.shapes ?? [], texts = page.flatMap((s) => (s.t === 'text' ? [s] : []));
    // the note's lines, read in order, give the whole text (none cut by the paper's edge or another lettering)
    const first = texts.findIndex((t) => pad.startsWith(t.text)), x = texts[first]?.at[0];
    assert.ok(first >= 0, `${name}: nota HEB`);
    // (its lines one under another, aligned left)
    const note = texts.slice(first).filter((t, i, a) => t.at[0] === x && a.slice(0, i).every((u) => u.at[0] === x)), joined = note.map((t) => t.text).join(' ');
    assert.ok(joined.startsWith(pad) && joined.includes('Basamento fissato alle ali delle putrelle'), `${name}: ${joined.slice(0, 160)}`);
    for (const t of note) {
      const b = textBox(t);
      assert.ok(b.x0 >= FRAME.x0 && b.x1 <= FRAME.x1, `${name}: «${t.text}» ${b.x0.toFixed(1)}…${b.x1.toFixed(1)}`);
      assert.equal(t.size, TEXT.min);
    }
  }
});

test('riferimenti come li disegna il nucleo: cerchio di raggio tagRadius, mai sotto 2,4 mm', () => {
  assert.equal(tagRadius('P1'), 2.4);
  assert.ok(tagRadius('R12') >= 2.4);
});

test('le caselle dei nomi: alla misura con cui il nucleo li scrive, alla scala della vista; i posti scartati mai presi se un altro è libero', () => {
  // a name asked at 1,4 mm is drawn at TEXT.min: its box is that one, at 1:25 and twice as large at 1:50
  const a = letteringBox([0, 0], 'Asse guide cabina', 1.4), b = letteringBox([0, 0], 'Asse guide cabina', TEXT.min), c = letteringBox([0, 0], 'Asse guide cabina', 1.4, 'l', 0, false, 50);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(c.x1 - c.x0 - 2 * (a.x1 - a.x0)) < 1e-9 && Math.abs(c.y1 - c.y0 - 2 * (a.y1 - a.y0)) < 1e-9);
  const k = textBox({ t: 'text', at: [0, 0], text: 'Asse guide cabina', size: TEXT.min, cond: true });
  assert.ok(Math.abs(a.x1 - k.x1 * AT) < 1e-9 && Math.abs(a.y1 - k.y1 * AT) < 1e-9);
  // a reference: the kernel's circle
  const t = takenBy([{ e: 'tag', at: [1000, 1000], text: 'R1' }])[0];
  assert.ok(t && Math.abs(t.x1 - 1000 - tagRadius('R1') * AT) < 1e-9);
  // a name with a room to fit that does not fit there at TEXT.min: where the kernel writes it, at its `out`
  const out = takenBy([{ e: 'text', at: [0, 0], text: 'QUADRO MANOVRA', size: TEXT.min, align: 'c', fit: 400, out: [5000, 5000] }], 50)[0];
  assert.ok(out && out.x0 > 4000 && out.y0 > 4000, JSON.stringify(out));
  // the usual places all taken: the grid's first clear one, never one turned down
  const busy = [{ x0: -100, y0: -100, x1: 100, y1: 100 }], within = { x0: -1000, y0: -1000, x1: 1000, y1: 1000 };
  const at = (p: readonly [number, number]) => ({ p, box: { x0: p[0] - 20, y0: p[1] - 20, x1: p[0] + 20, y1: p[1] + 20 } });
  const pick = placeOf([at([0, 0]), at([50, 0])], () => gridNear(within, [0, 0]).map(at), busy, within);
  assert.ok(busy.every((q) => !meets(pick.box, q)), JSON.stringify(pick.p));
  // a dimension whose lettering is longer than its segment: its band runs on past the end (dims.ts writes it there)
  const short = dimBands([{ e: 'chain', c: { dir: 'x', pts: [0, 100], at: 0, text: ['{v} Calata Funi molto lunga'] } }])[0];
  assert.ok(short && short.x1 > 100 + 20 * AT, JSON.stringify(short));
  const long = dimBands([{ e: 'chain', c: { dir: 'x', pts: [0, 3000], at: 0, text: ['{v} Locale'] } }])[0];
  assert.ok(long && long.x0 === 0 && long.x1 === 3000);
});
