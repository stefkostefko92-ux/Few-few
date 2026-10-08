// The drawing set's side of the shaft's details (round 36): sheet 1 gives the brackets' longest interval the rails'
// check takes and NOTA 1 the pit's kit, the sign and the plates under the sills; the new sheet of the rails developed;
// the sections' legends only of the symbols drawn; the list of articles counts the plates under the sills.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { A4 } from '@/drawing';
import { defaultInputs, layout, section, type ShaftInputs } from '@/shaft';
import { bracketHeights, bracketSpans, maxBracketSpan, railSpan } from '@/shaft/brackets';
import { railsDev } from '@/shaft/rails-dev';
import { carBracketCode } from '@/shaft/staffe-cabina';
import { projectViews } from '../cad/project';
import { CHECKS_TITLE } from '../tavole/checks-sheet';
import { buildTavole, setLayout } from '../tavole/build';
import { dataSheet } from '../tavole/data';
import type { TavoleInput } from '../tavole/input';
import { machineOf, sectionView } from '../tavole/views';
import { analyse } from '../present/analysis';
import { makeFmt } from '../present/tr';
import { deriveLift } from '../lift/derive';
import { defaultLift } from '../lift/defaults';
import { designBom } from '../prices/bom';

const input = (I: ShaftInputs, pitch?: number): TavoleInput => ({
  values: PRESETS.C, layout: layout(I), plant: { machine: 'M 73 (Sx)', governorLoad: 300, safetyGear: 'progressive', ...(pitch ? { carBracketPitch: pitch } : {}) },
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
  company: { name: 'Ascensori di prova', logo: null },
  set: { number: '26-007', issuedAt: new Date('2026-09-30T10:00:00Z'), author: 'A.C.', revisions: [] },
});
const fmt = makeFmt('it-IT');
const I0: ShaftInputs = { ...defaultInputs(1740, 1445), Q: 400, access: 'none' };

test('foglio 1: l’interasse massimo delle staffe è la l della verifica delle guide, non il passo nominale', () => {
  for (const pitch of [undefined, 1500]) {
    const x = input(I0, pitch), ds = dataSheet(x, analyse(x.values), 12), L = x.layout, [z0, z1] = railSpan(section(L));
    const row = ds.sheet.specs.find((r) => r[0] === 'INTERASSE MASSIMO STAFFE CABINA');
    assert.ok(row, 'riga dell’interasse');
    assert.equal(row[2], fmt(maxBracketSpan(z0, z1, L.inputs.carRail, pitch), 0));
    assert.ok(!ds.sheet.specs.some((r) => r[0].startsWith('PASSO STAFFE')), 'niente passo nominale');
    assert.ok(ds.sheet.specs.some((r) => r[0] === 'INTERASSE MASSIMO STAFFE CONTRAPPESO'));
    // NOTA 1: the pit's kit, the sign with the clearance the checks give, the plates under the sills, the anchors
    const nota = JSON.stringify(ds.sheet.notes);
    assert.ok(ds.cwGap !== null && nota.includes(`gioco massimo ${fmt(ds.cwGap, 0)} mm`), 'cartello');
    for (const t of ['Fossa (', 'STOP', 'Lamiera sottosoglia alta 250 mm', 'zona di sbloccaggio assunta 200 mm', `Fx ${ds.rails.fx}`, '5.2.5.3.2',
      'comando d’ispezione a non più di 300 mm da uno spazio di rifugio', 'comando della luce a non più di 750 mm dal telaio e almeno 1000 mm sopra']) assert.ok(nota.includes(t), t);
    // the checks of the details in the table
    for (const t of ['Porte di soccorso', 'Lamiera sotto la soglia', 'Protezione del contrappeso: bordo', 'Gioco massimo contrappeso']) {
      assert.ok(ds.sheet.checks.some((r) => r[0].startsWith(t)), t);
    }
  }
});

test('foglio delle guide: l’ultimo dei disegni (poi le verifiche), a una scala normale, quote delle staffe e note sotto, tutto nel foglio', () => {
  const r = buildTavole(input(I0)), last = r.sheets.at(-2), page = r.doc.pages.at(-2);
  assert.equal(last?.title, 'SVILUPPO DELLE GUIDE E POSIZIONE DELLE STAFFE');
  assert.equal(r.sheets.at(-1)?.title, CHECKS_TITLE);
  assert.ok(last?.scale !== null && [50, 100, 200, 500].includes(last?.scale ?? 0), `scala ${last?.scale}`);
  const texts = page?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];
  for (const t of ['GUIDA DI CABINA', 'GUIDA DEL CONTRAPPESO']) assert.ok(texts.some((x) => x.startsWith(t)), t);
  assert.ok(texts.some((x) => x.startsWith('Guida ')), 'lunghezze delle guide');
  assert.ok(texts.join(' ').includes('interasse massimo'), 'note');
  assert.ok(texts.includes(`PAGINA N° ${r.doc.pages.length - 1}/${r.doc.pages.length}`));
  for (const s of page?.shapes ?? []) if (s.t === 'text') assert.ok(s.at[0] > 0 && s.at[0] < A4.w && s.at[1] > 0 && s.at[1] < A4.h, s.text);
});

test('DXF e DWG: il foglio delle guide e le sigle delle staffe al passo dei dati dell’impianto, come il PDF', () => {
  const x = input(I0, 1500), L = setLayout(x), a = analyse(x.values), M = machineOf(a, x.plant, L, null);
  const views = projectViews(L, M, L.inputs.room !== null), view = views.find((v) => v.title === 'SVILUPPO DELLE GUIDE E POSIZIONE DELLE STAFFE');
  assert.ok(view, 'vista delle guide');
  const [z0, z1] = railSpan(section(L)), hs = bracketHeights(z0, z1, L.inputs.carRail, 1500);
  assert.notEqual(hs.length, bracketHeights(z0, z1, L.inputs.carRail).length, 'il passo dei dati cambia il numero di staffe');
  // the brackets' chain at the pitch of the data, its longest interval the l of sheet 1 and of the rails' check
  const cs = view.entities.flatMap((e) => (e.e === 'chain' ? [e.c] : []));
  assert.ok(cs.some((c) => c.pts.length === hs.length + 2), 'catena delle staffe al passo dei dati');
  assert.deepEqual(view.entities, railsDev(L).entities);
  const row = dataSheet(x, a, 12).sheet.specs.find((r) => r[0] === 'INTERASSE MASSIMO STAFFE CABINA');
  assert.equal(row?.[2], fmt(Math.max(...bracketSpans(hs)), 0));
  // the plans name the car rails' brackets with the same count
  const code = carBracketCode(L);
  assert.ok(code.startsWith(`${hs.length}× `), code);
  assert.ok(views.some((v) => v.entities.some((e) => e.e === 'text' && e.text === code)), 'sigla nelle piante');
  // the layout of the set is the stored one with the data's pitches
  assert.equal(L.carBracketPitch, 1500);
  assert.equal(setLayout(input(I0)).carBracketPitch, undefined);
});

test('sezione A-A: la legenda solo dei simboli disegnati, la nota della scala dove la corsa è interrotta', () => {
  const L = layout(I0), area = { x0: 20, y0: 20, x1: 190, y1: 260 };
  const pit = sectionView(L, 'pit', 0, area), floor = sectionView(L, 'floor', 2, area);
  assert.ok(pit.marks.includes('square'), 'rifugio in fossa nel dettaglio della fossa');
  assert.ok(!floor.marks.includes('square') && !floor.marks.includes('tri'), `al piano: ${floor.marks.join(', ')}`);
  const r = buildTavole(input({ ...I0, vertical: { ...I0.vertical, floors: ['0', '1', '2', '3', '4', '5', '6'].map((label, i, a) => ({ label, rise: i < a.length - 1 ? 3000 : 0, door: 'A' as const })) } }));
  const full = r.doc.pages[r.sheets.findIndex((s) => s.title === 'VISTA IN ELEVATO - SEZ. A-A')];
  assert.ok(full?.shapes.some((s) => s.t === 'text' && s.text === 'TRATTO TRA LE INTERRUZIONI FUORI SCALA'), 'nota della scala');
  // the counterweight's sign written by the screen
  assert.ok(r.doc.pages.some((p) => p.shapes.some((s) => s.t === 'text' && s.text.startsWith('CARTELLO: GIOCO MAX'))), 'cartello in sezione');
});

test('elenco degli articoli: una lamiera sottosoglia per ogni porta di piano', () => {
  // a new lift (UNI EN 81-20): the whole bill, a plate under every landing door's sill
  const dv = deriveLift({ ...defaultLift(), collaudo: { norma: 'en81', parti: [] } }), bom = designBom(dv);
  const toe = bom.find((l) => l.key === 'door:toe'), landing = bom.filter((l) => l.key?.startsWith('door:landing:')).reduce((n, l) => n + l.qty, 0);
  assert.ok(toe);
  assert.equal(toe.qty, landing);
  assert.ok(toe.qty >= dv.shaft.vertical.floors.length);
  // a modification that keeps the doors: neither the doors nor their plates in its bill
  assert.ok(!designBom(deriveLift(defaultLift())).some((l) => l.key === 'door:toe' || l.key?.startsWith('door:landing:')));
});
