// The lettering of the machine room's sheets as it is drawn (round 37): the names, the notes and the references placed
// with the boxes the kernel draws them in (TEXT.min at least, a reference's circle tagRadius) and at the scale the plan
// takes — on the plan and in section B-B of every kind of installation and of a replacement's survey not one lettering
// over another, each inside the frame; the HEB beams' note whole inside the sheet; P2 and P3 once each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { FRAME, TEXT, drawingArea, tagRadius, textBox, type Entity } from '@/drawing';
import { defaultLift, deriveLift, type LiftInputs } from '@/lib/lift';
import { surveyView } from '@/lib/tavole/views';
import { HEB_PAD } from '@/shaft/support';
import { KV_VERT } from '@/shaft/norme-vert';
import { AT, beyondWall, dimBands, gridNear, letteringBox, meets, placeOf, takenBy } from '@/shaft/room-label';
import { WALL } from '@/shaft/room-draw';
import { outsideSection } from '@/shaft/room-section-extra';
import { hebDrawn } from '@/shaft/heb';
import { hebUnder } from '@/shaft/heb-view';
import { roomGeo } from '@/shaft/machine-room';
import { PROFILES } from '@/shaft/profiles';
import { layoutSite } from '@/shaft/room-site';
import { deriveRoom } from '../room/derive';
import { startSurvey } from '../room/survey';
import { base, calc, cw, overlaps, sheets, withRoom } from './room-lettering-helpers';

type Room = NonNullable<LiftInputs['shaft']['room']>;
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
      // each load named once (round 36 drew P2 and P3 twice on a 2:1 plan), a 2:1 roping's hitches named on the plan
      const refs = page.shapes.flatMap((s) => (s.t === 'text' && /^[PR]\d$/.test(s.text) ? [s.text] : []));
      assert.equal(new Set(refs).size, refs.length, `${name}, foglio ${i + 1}: ${refs.join(' ')}`);
      if (i === 7 && name.startsWith('2:1')) assert.ok(refs.includes('P2') && refs.includes('P3'), `${name}: P2 e P3 nella pianta (${refs.join(' ')})`);
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
  const pick = placeOf([{ places: () => [at([0, 0]), at([50, 0])], within }, { places: () => gridNear(within, [0, 0]).map(at), within }], busy);
  assert.ok(busy.every((q) => !meets(pick.box, q)), JSON.stringify(pick.p));
  // a dimension whose lettering is longer than its segment: its band runs on past the end (dims.ts writes it there)
  const short = dimBands([{ e: 'chain', c: { dir: 'x', pts: [0, 100], at: 0, text: ['{v} Calata Funi molto lunga'] } }])[0];
  assert.ok(short && short.x1 > 100 + 20 * AT, JSON.stringify(short));
  const long = dimBands([{ e: 'chain', c: { dir: 'x', pts: [0, 3000], at: 0, text: ['{v} Locale'] } }])[0];
  assert.ok(long && long.x0 === 0 && long.x1 === 3000);
});

test('fuori dal disegno solo dove non ci sono file di quote, e quanto il foglio lascia: oltre il muro libero in pianta, sotto o a destra in B-B', () => {
  // the plan's band: left of the room with the door at the front or the rear, under it with the door on a side; none
  // without paper for it; a name the room has no place for goes there, never on what is drawn
  const R = { W: 3000, D: 3000 }, left = beyondWall({ ...R, doorWall: 'front' }), under = beyondWall({ ...R, doorWall: 'right' }, 50, 20);
  assert.ok(left && left.x1 < -WALL && left.y0 === -WALL && left.y1 === R.D + WALL, JSON.stringify(left));
  assert.ok(under && under.y1 < -WALL && under.y0 === -WALL - 20 * 50, JSON.stringify(under));
  assert.equal(beyondWall({ ...R, doorWall: 'rear' }, 25, 4), null);
  const within = { x0: 60, y0: 60, x1: 2940, y1: 2940 }, busy = [{ x0: 0, y0: 0, x1: 3000, y1: 3000 }], at = (p: readonly [number, number]) => ({ p, box: { x0: p[0] - 30, y0: p[1] - 30, x1: p[0] + 30, y1: p[1] + 30 } });
  const spot = placeOf([{ places: () => gridNear(within, [100, 1500]).map(at), within }, ...(left ? [{ places: () => gridNear(left, [100, 1500]).map(at), within: left }] : [])], busy);
  assert.ok(left && spot.box.x1 <= left.x1 && busy.every((q) => !meets(spot.box, q)), JSON.stringify(spot.p));
  // section B-B: under its foot always (no row there), right of the room only without a row on that side
  const bounds = { x0: -250, y0: -1800, x1: 3250, y1: 2450 }, row: Entity = { e: 'chain', c: { dir: 'y', pts: [0, 2000], side: 'right', row: 0 } };
  const free = outsideSection([], bounds, 50, { w: 174, h: 214 }), taken = outsideSection([row], bounds, 50, { w: 174, h: 214 });
  assert.ok(free.below && free.below.y1 < bounds.y0 && free.right && free.right.x0 > bounds.x1, JSON.stringify(free));
  assert.equal(taken.right, null);
  // (at 1:25 on the same paper a room this wide leaves no paper right of it)
  assert.equal(outsideSection([], bounds, 25, { w: 148, h: 214 }).right, null);
});

test('B-B: l’altezza delle HEB e quella del telaio sopra di esse in una catena, se il telaio poggia sulle putrelle', () => {
  const d = deriveLift(withRoom(base(), { heb: {} })), G = roomGeo(d.layout, d.machine), lay = G ? hebDrawn(G, d.machine, layoutSite(d.layout), layoutSite(d.layout).govRopes) : null;
  assert.ok(G && lay);
  const top = HEB_PAD + PROFILES[lay.profile].h, one = hebUnder(lay, G, 0, top, top + 700, 100, '{v} Telaio', null);
  assert.ok(one?.e === 'chain' && one.c.pts.length === 3 && one.c.pts[1] === top, JSON.stringify(one));
  assert.equal(hebUnder(lay, G, 0, top + 50, top + 700, 100, '{v} Telaio', null), null);
});
