// The machine's room with the machine below in the drawing set (tavole/below-view.ts): for each scheme its plan and
// section C-C in place of the machine room above, titled by where the room stands; everything on the A4 sheet, no holes
// in the texts, the names on the plan clear of each other and of the machine at whatever scale the sheet takes; and a
// door's width over its dimension line with its words under it ("Porta H. 2000") where the whole text does not fit;
// the loads on the head of the shaft (P1 the head pulleys, P2 and P3 the hitches of a 2:1 roping, P4 the governor) on
// the plan at the top floor, in the set and in its CAD file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { A4, chainShapes, shapeBox, type Shape } from '@/drawing';
import { buildTavole } from '../tavole/build';
import { analyse } from '../present/analysis';
import { inputViews } from '../cad/project';
import { dataSheet } from '../tavole/data';
import { toDxf } from '../cad/export';
import { readCad } from '../cad/read';
import type { TavoleInput } from '../tavole/input';
import { NO_MARKS, type ValueMarks } from '../lift/marks';
import { BOTTOM_SCHEMES, type BottomScheme } from '../lift/bottom';

type Text = Extract<Shape, { t: 'text' }>;

const input = (I: ShaftInputs, bottom: BottomScheme, extra: Partial<ValueMarks> = {}, layoutName = 'bottom'): TavoleInput => ({
  values: { ...PRESETS.A, context: 'new', layout: layoutName, Hv: '14' }, layout: layout(I), plant: { governorLoad: 300, safetyGear: 'progressive' },
  marks: { ...NO_MARKS, bottom, ...extra },
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
  company: { name: 'Ascensori di prova', logo: null }, set: { number: '26-007', issuedAt: new Date('2026-09-30T10:00:00Z'), author: 'A.C.', revisions: [] },
});

const shaft = (W: number, D: number, cw: ShaftInputs['cw'], room: boolean): ShaftInputs =>
  ({ ...defaultInputs(W, D), cw, access: 'none', ...(room ? {} : { room: null }) });

const texts = (shapes: readonly Shape[]): Text[] => shapes.filter((s): s is Text => s.t === 'text');

const VARIANTS = [[1600, 1750, 'rear'], [1800, 1600, 'left'], [1500, 1600, 'right']] as const;

for (const scheme of BOTTOM_SCHEMES) {
  test(`macchina in basso, schema ${scheme}: pianta e sezione C-C del locale, nel foglio, nomi che non si coprono`, () => {
    const where = scheme === 'under' ? 'SOTTO IL VANO' : 'ACCANTO AL VANO';
    for (const [W, D, cw] of VARIANTS) {
      for (const catalog of [null, { brand: 'SICOR', model: 'SH160', ratio: '1/37', staticKg: 3300, src: 'D: prova' }]) {
        const I = shaft(W, D, cw, scheme === 'room'), r = buildTavole(input(I, scheme, catalog ? { catalog } : {})), tag = `${scheme} ${cw}${catalog ? ' SH160' : ''}`;
        // the machine room above is not drawn: its two sheets are the room below's
        const titles = r.sheets.map((s) => s.title);
        assert.ok(!titles.includes('VISTA IN PIANTA DEL LOCALE MACCHINA'), `${tag}: niente locale sopra`);
        const plan = titles.indexOf(`VISTA IN PIANTA DEL LOCALE MACCHINA ${where}`), sec = titles.indexOf(`VISTA IN ELEVATO DEL LOCALE MACCHINA ${where} - SEZ. C-C`);
        assert.ok(plan > 0 && sec === plan + 1, `${tag}: ${titles.join(' | ')}`);
        assert.equal(r.doc.pages.length, buildTavole({ ...input(shaft(W, D, cw, false), scheme, {}, 'topDefl') }).doc.pages.length + 2, `${tag}: due fogli in più`);
        for (const i of [plan, sec]) {
          assert.ok([25, 50].includes(r.sheets[i]?.scale ?? 0), `${tag}: scala ${r.sheets[i]?.scale}`);
          for (const s of r.doc.pages[i]?.shapes ?? []) {
            const b = shapeBox(s);
            assert.ok(b.x0 > -0.5 && b.x1 < A4.w + 0.5 && b.y0 > -0.5 && b.y1 < A4.h + 0.5, `${tag} foglio ${i + 1}: ${s.t} fuori dal foglio`);
            if (s.t === 'text') for (const bad of ['undefined', 'NaN', 'null', '[object']) assert.ok(!s.text.includes(bad), `${tag}: «${s.text}»`);
          }
        }
        // the plan's names: the room's, the machine's, the main switch's, the controller's; none over another
        const words = texts(r.doc.pages[plan]?.shapes ?? []), names = words.filter((t) => /^(LOCALE MACCHINA|INTERRUTTORE|QUADRO|ARGANO|SICOR|VANO$)/.test(t.text));
        for (const n of [scheme === 'under' ? 'LOCALE MACCHINA SOTTO IL VANO' : 'LOCALE MACCHINA', 'INTERRUTTORE GENERALE', 'QUADRO MANOVRA', `${catalog ? 'SICOR SH160' : 'ARGANO'} · Ø 560`]) {
          assert.ok(names.some((t) => t.text === n), `${tag}: manca «${n}»`);
        }
        names.forEach((a, i) => names.forEach((b, j) => {
          if (j <= i) return;
          const p = shapeBox(a), q = shapeBox(b);
          assert.ok(p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0, `${tag}: «${a.text}» su «${b.text}»`);
        }));
        // the door on its wall: its width and height, whole or split round the line
        assert.ok(words.some((t) => t.text === 'Porta 800x H. 2000') || (words.some((t) => t.text === '800') && words.some((t) => t.text === 'Porta H. 2000')), `${tag}: porta`);
        // the section: the room's height, the sheave's axis over its floor, the pit
        const cut = texts(r.doc.pages[sec]?.shapes ?? []).map((t) => t.text);
        for (const n of ['2400 H. Locale', 'Fossa 1400']) assert.ok(cut.includes(n), `${tag}: manca «${n}» (${cut.join(' | ')})`);
        assert.ok(cut.some((t) => /^Asse \d+$/.test(t)), `${tag}: asse della puleggia`);
        // beside the shaft one chain along the section: the shaft, its wall and the room
        if (scheme !== 'under') assert.ok(cut.includes('2200 Locale') && cut.includes(`Vano ${cw === 'rear' ? D : W}`), `${tag}: ${cut.join(' | ')}`);
      }
    }
    // the same input gives the same drawing
    const I = shaft(1600, 1750, 'rear', scheme === 'room');
    assert.equal(JSON.stringify(buildTavole(input(I, scheme)).doc), JSON.stringify(buildTavole(input(I, scheme)).doc));
  });
}

test('quota di una porta stretta: la larghezza sulla linea, le parole sotto senza la «x»; il «×» staccato resta', () => {
  const place = { scale: 50, ox: 0, oy: 0 }, edges = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const door = texts(chainShapes({ dir: 'x', pts: [0, 200, 1000, 2200], side: 'top', row: 0, text: [null, 'Porta 800x H. 2000', null] }, place, edges)).map((t) => t.text);
  assert.ok(door.includes('800') && door.includes('Porta H. 2000'), door.join(' | '));
  // 1200 mm at 1:50 = 24 mm: the whole text would be smaller than the least size, its words fit under the line
  const bed = texts(chainShapes({ dir: 'x', pts: [0, 1200, 5000], side: 'top', row: 0, text: ['{v} × 640 Telaio con rinvio', '{v}'] }, place, edges)).map((t) => t.text);
  assert.ok(bed.includes('1200') && bed.includes('× 640 Telaio con rinvio'), bed.join(' | '));
});

test('progetto in DXF con la macchina in basso: le due viste del locale dopo le sezioni, come nelle tavole', () => {
  for (const scheme of BOTTOM_SCHEMES) {
    const x = input(shaft(1600, 1750, 'rear', scheme === 'room'), scheme);
    const views = inputViews(x), sheets = buildTavole(x).sheets;
    // the same views as the set's sheets after the data, in its order and at its scales
    assert.deepEqual(views.map((v) => [v.title, v.scale]).filter(([t]) => String(t).includes('LOCALE MACCHINA')),
      sheets.filter((s) => s.title.includes('LOCALE MACCHINA')).map((s) => [s.title, s.scale]), scheme);
    assert.ok(readCad(new TextEncoder().encode(toDxf(views, 'Prova', new Date('2026-10-08T10:00:00Z'))), 'progetto.dxf').count > 1000, scheme);
  }
});

test('macchina in basso: i carichi della testata sulla pianta in testata — P1 sulle pulegge, P2 e P3 sugli attacchi a 2:1, P4 sul limitatore', () => {
  for (const scheme of BOTTOM_SCHEMES) {
    for (const [W, D, cw] of VARIANTS) {
      for (const r of ['1', '2']) {
        const base = input(shaft(W, D, cw, scheme === 'room'), scheme), x = { ...base, values: { ...base.values, r } }, tag = `${scheme} ${cw} ${r}:1`;
        const t = buildTavole(x), P = dataSheet(x, analyse(x.values), t.doc.pages.length).sheet.P;
        // every load sheet 1 gives (the total on the slab aside) has its reference on a drawing sheet
        const drawn = new Set(t.doc.pages.slice(1).flatMap((p) => texts(p.shapes).map((s) => s.text)).filter((s) => /^P[1-9]$/.test(s)));
        P.forEach((v, i) => {
          if (i < 8 && v !== '—') assert.ok(drawn.has(`P${i + 1}`), `${tag}: P${i + 1} = ${v} senza riferimento (${[...drawn].join(' ')})`);
        });
        assert.equal(drawn.has('P2') && drawn.has('P3'), r === '2', tag);
        // on the plan at the top: P1 with a leader to each head pulley, its CAD view the same
        const head = t.sheets.findIndex((s) => s.title.startsWith('VISTA IN PIANTA DEL VANO IN TESTATA')), top = texts(t.doc.pages[head]?.shapes ?? []).map((s) => s.text);
        for (const p of ['P1', 'P4', ...(r === '2' ? ['P2', 'P3'] : [])]) assert.ok(top.includes(p), `${tag}: ${p} non in testata`);
        const plan = inputViews(x).find((v) => v.title.startsWith('VISTA IN PIANTA DEL VANO IN TESTATA')), p1 = plan?.entities.find((e) => e.e === 'tag' && e.text === 'P1');
        assert.ok(p1?.e === 'tag' && (p1.also?.length ?? 0) >= 1, `${tag}: P1 nel DXF`);
      }
    }
  }
});

test('schema room senza locale nel progetto: sul foglio 1 le verifiche del locale delle pulegge disegnato (altezza, porta, spazio sopra)', () => {
  const x = input(shaft(1600, 1750, 'rear', false), 'room'), checks = dataSheet(x, analyse(x.values), 8).sheet.checks;
  const row = (start: string) => checks.find((c) => c[0].startsWith(start));
  // the standard room the sheets draw, as the checks measure it: 1500 mm high, its door 600 × 1400 mm
  assert.deepEqual(row('Altezza libera del locale delle pulegge')?.slice(1), ['1500 mm', '≥ 1500 mm', 'OK']);
  assert.deepEqual(row('Porta del locale delle pulegge')?.slice(1), ['600 × 1400 mm', '≥ 600 × 1400 mm', 'OK']);
  assert.ok(row('Spazio libero sopra le pulegge'), 'the space over the pulleys');
});
