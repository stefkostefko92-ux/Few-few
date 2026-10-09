// The lettering of the plans and of the pit's detail on the issued sheets (round 37): the references of the loads kept
// apart and off the lettering at the scale the plan is drawn at (1:50 too: tag-place.ts), the landings' sides off the
// section marks, the car rails' bracket code off the counterweight's in the walls, the pit's ladder and control box
// named off each other and off the screen's name, the heights of the box's devices in the pit's detail off any other
// lettering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLift, type LiftInputs } from '@/lib/lift';
import { defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { FRAME, TEXT, shapeBox } from '@/drawing';
import { sectionMarks, servedBy, sideLabels } from '@/lib/tavole/extras';
import { pitKit } from '@/shaft/pit-kit';
import { TAG_R, TAG_SCALE, letteringBoxes, placeTags, tagR } from '@/shaft/tag-place';
import { liftSheets, overlapping, sheetsBy, shaftSheets, textsOf, type Text } from './sheets-helpers';

const D = defaultInputs(1600, 1750);
const isTag = (s: string): boolean => /^P\d$/.test(s);
const KIT = /^(SCALA|STOP · PRESA · LUCE|Scala \d+|Pulsantiera \d+)$/;
const SCREEN = /^(PROTEZIONE CONTRAPPESO H \d+|Protezione \d+)$/;

test('riferimenti a 1:50: cerchi e distanze come sulla carta a 1:25', () => {
  assert.equal(TAG_R, tagR(TAG_SCALE));
  assert.equal(tagR(50), 2 * TAG_R);
  assert.equal(tagR(20), TAG_R, 'a 1:20 la carta di 1:25');
  const room = { x0: 0, y0: 0, x1: 3000, y1: 3000 }, asks = [{ text: 'P7', to: [1000, 1000] as const, at: [1200, 1000] as const }, { text: 'P6', to: [1000, 1040] as const, at: [1200, 1050] as const, rank: 1 }];
  const [a, b] = placeTags(asks.map((q) => ({ ...q, to: [...q.to] as [number, number], at: [...q.at] as [number, number] })), room, [], [], 50);
  assert.ok(a?.e === 'tag' && b?.e === 'tag');
  assert.ok(Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) >= 2 * tagR(50) + 0.5 * 50, 'cerchi a 2r + 0,5 mm a 1:50');
  // a lettering takes twice the model at 1:50
  const [s25] = letteringBoxes([{ e: 'text', at: [0, 0], text: 'CONTRAPPESO', align: 'c' }]), [s50] = letteringBoxes([{ e: 'text', at: [0, 0], text: 'CONTRAPPESO', align: 'c' }], 50);
  assert.ok(s25 && s50 && Math.abs((s50.x1 - s50.x0) - 2 * (s25.x1 - s25.x0)) < 1e-6);
});

test('pianta della fossa a 1:50: P5–P8 lontani dalle scritte e fra loro, scala e pulsantiera leggibili', () => {
  const I: ShaftInputs = { ...D, W: 2190, D: 1130, wall: 400 }, [pit] = sheetsBy(shaftSheets(I), /E IN FOSSA$/);
  assert.ok(pit && pit.scale === 50, `scala ${pit?.scale}`);
  const T = textsOf(pit.shapes), tags = T.filter((t) => isTag(t.text));
  assert.ok(['P5', 'P6', 'P7', 'P8'].every((p) => tags.some((t) => t.text === p)), tags.map((t) => t.text).join(' '));
  assert.deepEqual(overlapping(T, (a, b) => isTag(a) || isTag(b)), []);
  for (const [i, a] of tags.entries()) for (const b of tags.slice(i + 1)) assert.ok(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) >= 2 * 2.4 + 0.5 - 1e-6, `${a.text}–${b.text}`);
  // the kit's and the screen's names and dimensions off each other
  assert.deepEqual(overlapping(T, (a, b) => (KIT.test(a) || SCREEN.test(a)) && (KIT.test(b) || SCREEN.test(b))), []);
});

const floors = (n: number, door: (i: number) => 'A' | 'B' | 'AB' = () => 'A'): ShaftInputs['vertical']['floors'] =>
  Array.from({ length: n }, (_, i) => ({ label: String(i), rise: i === n - 1 ? 0 : 3000, door: door(i) }));

test('lato fermate: mai sotto il segno della sezione A, con molte fermate in intervalli', () => {
  const cases: [string, ShaftInputs][] = [2, 6, 12, 25].map((n) => [`${n} fermate`, { ...D, vertical: { ...D.vertical, floors: floors(n), main: 0 } }]);
  cases.push(['22 fermate su due lati', { ...D, entrances: 'opposite', D: 2000, vertical: { ...D.vertical, floors: floors(22, (i) => (i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'AB')), main: 0 } }]);
  for (const [name, I] of cases) {
    const r = shaftSheets(I);
    for (const s of sheetsBy(r, /^VISTA IN PIANTA DEL VANO/)) {
      const T = textsOf(s.shapes), lato = T.filter((t) => t.text.startsWith('LATO FERMAT'));
      assert.ok(lato.length, `${name}: ${s.title}`);
      assert.deepEqual(overlapping(T, (a, b) => (a === 'A' && b.startsWith('LATO')) || (b === 'A' && a.startsWith('LATO'))), [], `${name}: ${s.title}`);
    }
  }
  // the whole list where it fits, in ranges only where it does not
  const r = shaftSheets({ ...D, vertical: { ...D.vertical, floors: floors(25), main: 0 } });
  assert.ok(sheetsBy(r, /^VISTA IN PIANTA DEL VANO/).some((s) => textsOf(s.shapes).some((t) => t.text === 'LATO FERMATE "0–24"')), 'intervallo');
  assert.ok(sheetsBy(shaftSheets(D), /^VISTA IN PIANTA DEL VANO/).some((s) => textsOf(s.shapes).some((t) => /^LATO FERMATE "0, 1, /.test(t.text))), 'elenco');
});

test('lato fermate: dove l’elenco non sta nemmeno in intervalli, più piccolo fino al minimo, poi su più righe, mai sui segni', () => {
  const ext = { x0: 60, y0: 100, x1: 150, y1: 200 }, mark = sectionMarks([95, 88], [95, 195], 'up', 'A'), keep = mark.filter((m) => m.t !== 'line');
  for (const [n, lines] of [[22, 1], [70, 2]] as const) {
    const I: ShaftInputs = { ...D, entrances: 'opposite', D: 2000, vertical: { ...D.vertical, floors: floors(n, (i) => (i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'AB')), main: 0 } };
    const out = textsOf(sideLabels(layout(I), ext, keep));
    for (const t of out) {
      const b = shapeBox(t);
      assert.ok(t.size !== undefined && t.size >= TEXT.min && b.x0 >= FRAME.x0 && b.x1 <= FRAME.x1, `${n}: ${t.text}`);
      for (const m of keep.map(shapeBox)) assert.ok(b.x1 <= m.x0 || b.x0 >= m.x1 || b.y1 <= m.y0 || b.y0 >= m.y1, `${n}: «${t.text}» sul segno`);
    }
    // each side's list whole: the floors it serves, once
    const front = out.filter((t) => t.at[1] < ext.y0), words = front.map((t) => t.text).join(' ');
    assert.equal(front.length, lines, `${n}: righe`);
    assert.ok(lines > 1 || (front[0]?.size ?? 0) < 3.8, `${n}: più piccolo su una riga`);
    assert.equal(words, servedBy(layout(I))[0]?.short, `${n}: elenco intero`);
  }
});

const cwRear = (L: LiftInputs, cwPos: number): LiftInputs => ({ ...L, shaft: { ...L.shaft, cw: 'rear', plan: { ...(L.shaft.plan ?? {}), cwPos } } });
/** Car rails and counterweight on one side wall, adjacent entrances, the machine below (round 37 fuzz, seed 16). */
const sideWall = (): LiftInputs => {
  const L = newLift(), S = L.shaft;
  return {
    ...L, calc: { ...L.calc, layout: 'bottom' }, bottom: 'head',
    shaft: { ...S, W: 2230, D: 1330, door: 'C2', doorWidth: 1100, access: 'dm236_residential', entrances: 'adjacent', side2: 'left', carRail: 'T75-3/B', cwRail: 'T90/B', room: null,
      vertical: { ...S.vertical, v: 1.6, pit: 790, headroom: 3500, carH: 2260, carOutH: 2310, main: 2,
        floors: [4500, 4100, 3600, 4300, 0].map((rise, i) => ({ label: String(i), rise, door: i % 2 ? 'AB' as const : 'A' as const })) } },
  } as LiftInputs;
};

test('staffe della cabina e del contrappeso: i due codici mai uno sull’altro nelle pareti', () => {
  for (const [name, L] of [['contrappeso dietro fuori asse', cwRear(newLift(), 150)], ['guide e contrappeso sulla stessa parete', sideWall()]] as const) {
    const r = liftSheets(L);
    for (const s of sheetsBy(r, /^VISTA IN PIANTA DEL VANO/)) {
      const T = textsOf(s.shapes);
      assert.ok(T.some((t) => /SQUADRA|SG/.test(t.text)), `${name}: ${s.title}`);
      assert.deepEqual(overlapping(T, (a, b) => (/SQUADRA/.test(a) && /× S[UDCN] /.test(b)) || (/SQUADRA/.test(b) && /× S[UDCN] /.test(a))), [], `${name}: ${s.title}`);
    }
  }
});

test('fossa: scala, pulsantiera e le loro quote mai una sull’altra; le altezze di stop e luce libere nel particolare', () => {
  const sameWall = (I: ShaftInputs): boolean => { const k = pitKit(layout(I)); return !!k.ladder && !!k.box && k.ladder.wall === k.box.wall; };
  const cases: [string, ShaftInputs][] = [
    ['contrappeso dietro', D], ['contrappeso a destra, fossa 2190', { ...D, cw: 'right', vertical: { ...D.vertical, pit: 2190 } }],
    ['vano largo, pareti da 400', { ...D, W: 2190, D: 1130, wall: 400 }], ['contrappeso a sinistra, accessi opposti', { ...defaultInputs(2140, 2420), cw: 'left', entrances: 'opposite' }],
  ];
  assert.ok(cases.some(([, I]) => sameWall(I)), 'scala e pulsantiera su una parete');
  for (const [name, I] of cases) {
    const r = shaftSheets(I), [plan] = sheetsBy(r, /E IN FOSSA$/), [pit] = sheetsBy(r, /IN FOSSA - ULTIMA FERMATA INFERIORE/);
    assert.ok(plan && pit, name);
    const T = textsOf(plan.shapes);
    assert.deepEqual(overlapping(T, (a, b) => KIT.test(a) && KIT.test(b)), [], `${name}: pianta`);
    assert.deepEqual(overlapping(T, (a, b) => (KIT.test(a) && (SCREEN.test(b) || isTag(b))) || (KIT.test(b) && (SCREEN.test(a) || isTag(a)))), [], `${name}: pianta, protezione e riferimenti`);
    const P: Text[] = textsOf(pit.shapes), kit = (s: string): boolean => /^(STOP|LUCE) [+-]\d+/.test(s);
    assert.ok(P.some((t) => kit(t.text)), `${name}: altezze della pulsantiera`);
    assert.deepEqual(overlapping(P, (a, b) => kit(a) || kit(b)), [], `${name}: particolare della fossa a 1:${pit.scale}`);
  }
});
