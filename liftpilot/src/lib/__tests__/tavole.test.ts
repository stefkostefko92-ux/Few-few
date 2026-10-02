// The drawing set: loads on the building by hand (the sample set's own figures where they apply), forces on the rails
// by EN 81-50 recomputed independently, the sheets (count that adapts, everything on the A4 page, no holes in the
// texts, a stable drawing), the stored parts that must read back, the logo check and old shaft designs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { KV_VERT, defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { A4, type Shape } from '@/drawing';
import { loads } from '../tavole/loads';
import { impactFactor, railForces } from '../tavole/forces';
import { buildTavole } from '../tavole/build';
import { revisionsSchema, setNumber, storedInput, projectDataSchema } from '../tavole/compose';
import type { TavoleInput } from '../tavole/input';
import { NO_MARKS } from '../lift/marks';
import { readLogo } from '../logo';
import { shaftInputsSchema } from '../shaft-input';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const daN = (kg: number) => (kg * 9.81) / 10;

test('carichi P1…P9: macchina con coefficiente dinamico, fossa, soletta (valori del foglio di esempio)', () => {
  const base = {
    P: 520, Q: 400, Mcw: 720, ropes: 10, cables: 25, machine: 420, roping: 1, carRailQ: 8.32, carRailLen: 22.5, cwRailQ: 3.34, cwRailLen: 22.5,
    safetyGear: 'progressive' as const, dyn: 1.5, carBuffers: 2, cwBuffers: 1, governor: 300,
  };
  const L1 = loads(base);
  assert.equal(L1.static, 1675);
  near(L1.dynamic, 2512.5);
  // the sample set: 2465 daN on the machine, 1805 daN per car buffer, 2825 daN under the counterweight buffer
  assert.equal(Math.round(L1.P[0] ?? 0), 2465);
  assert.equal(L1.P[1], null);
  assert.equal(L1.P[2], null);
  assert.equal(L1.P[3], 300);
  near(L1.P[4] ?? 0, daN((2 * 920) / 2 + 8.32 * 22.5));
  assert.equal(Math.round(L1.P[5] ?? 0), 1805);
  near(L1.P[6] ?? 0, daN(3.34 * 22.5));
  assert.equal(Math.round(L1.P[7] ?? 0), 2825);
  near(L1.P[8] ?? 0, daN(2512.5) + daN(420));
  // 2:1: half of car, load and counterweight on the machine, the rest on the hitches
  const L2 = loads({ ...base, roping: 2 });
  assert.equal(L2.static, 820 + 35);
  near(L2.P[1] ?? 0, daN(460 * 1.5));
  near(L2.P[2] ?? 0, daN(360 * 1.5));
  // an instantaneous safety gear pushes the rails harder
  assert.ok((loads({ ...base, safetyGear: 'instantaneous' }).P[4] ?? 0) > (L1.P[4] ?? 0));
  assert.equal(impactFactor('roller'), KV_VERT.k1Roller);
});

test('spinte sulle guide (UNI EN 81-50, 5.10): arcata centrale e a zaino', () => {
  const I: ShaftInputs = { ...defaultInputs(1740, 1445), entrances: 'opposite', cw: 'left', Q: 400, access: 'none' };
  const L = layout(I), F = railForces(L, 520, 400, 'progressive'), h = (I.vertical.frameTop + I.vertical.frameBelow) / 1000, k = KV_VERT.k1Progressive;
  near(F.h, h);
  assert.equal(F.k, k);
  // central sling, centred: only the 1/8 offsets of the rated load count
  near(F.fx, (k * 9.81 * 400 * (L.B / 8 / 1000)) / (2 * h) / 10, 1e-9);
  near(F.fy, (k * 9.81 * 400 * (L.A / 8 / 1000)) / (1 * h) / 10, 1e-9);
  // cantilever: the car hangs off the line of its rails, the force across it is much larger
  const C = layout({ ...defaultInputs(1800, 1900), entrances: 'adjacent', side2: 'right', Q: 400, access: 'none' });
  const G = railForces(C, 520, 400, 'progressive');
  const xP = Math.abs(C.car.x + C.car.w / 2 - C.frame.axis) / 1000;
  near(G.fx, (k * 9.81 * (400 * (xP + C.A / 8 / 1000) + 520 * xP)) / (2 * h) / 10, 1e-9);
  assert.ok(G.fx > 3 * F.fx, `${G.fx} ≫ ${F.fx}`);
});

const input = (I: ShaftInputs, logo = false): TavoleInput => ({
  values: PRESETS.C, layout: layout(I), plant: { machine: 'M 73 (Sx)', carRails: 'existing', governorLoad: 300, safetyGear: 'progressive' },
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
  company: { name: 'Ascensori di prova', logo: logo ? { mime: 'image/png', data: LOGO } : null },
  set: { number: '26-007', issuedAt: new Date('2026-09-30T10:00:00Z'), author: 'A.C.', revisions: [{ mark: 'R1', text: 'Portata aggiornata', date: new Date('2026-10-02T09:00:00Z') }] },
});

function points(s: Shape): (readonly [number, number])[] {
  switch (s.t) {
    case 'line': return [s.a, s.b];
    case 'path': return [...s.pts];
    case 'circle': case 'arc': return [[s.c[0] - s.r, s.c[1] - s.r], [s.c[0] + s.r, s.c[1] + s.r]];
    case 'text': return [s.at];
    case 'image': return [[s.box.x0, s.box.y0], [s.box.x1, s.box.y1]];
  }
}

test('tavole: numero di fogli, tutto dentro il foglio A4, testi senza buchi', () => {
  const floors = ['-1', '0', '1', '2', '3', '4', '5'].map((label, i, a) => ({ label, rise: i < a.length - 1 ? 3000 : 0, door: 'A' as const }));
  const full = buildTavole(input({ ...defaultInputs(1740, 1445), Q: 400, access: 'none', vertical: { ...defaultInputs(1, 1).vertical, floors, main: 1 } }, true));
  // data, 3 plans, 4 sections, machine room in plan and section, pit
  assert.equal(full.doc.pages.length, 11);
  assert.equal(full.sheets.length, 11);
  const small = buildTavole(input({ ...defaultInputs(1740, 1445), Q: 400, access: 'none', room: null }));
  // main floor = lowest: one plan less; no machine room: two sheets less
  assert.equal(small.doc.pages.length, 8);
  for (const r of [full, small]) {
    for (const [n, p] of r.doc.pages.entries()) {
      assert.deepEqual([p.w, p.h], [A4.w, A4.h]);
      for (const s of p.shapes) {
        for (const [x, y] of points(s)) assert.ok(x > -0.5 && x < A4.w + 0.5 && y > -0.5 && y < A4.h + 0.5, `foglio ${n + 1}: ${s.t} a ${x}, ${y}`);
        if (s.t === 'text') for (const bad of ['undefined', 'NaN', 'null', '[object']) assert.ok(!s.text.includes(bad), `foglio ${n + 1}: «${s.text}»`);
      }
    }
  }
  const texts = (i: number) => full.doc.pages[i]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];
  assert.ok(texts(0).includes('CARATTERISTICHE DI BASE') && texts(0).includes('26-007') && texts(0).includes('R1 02/10/2026'), 'foglio 1');
  assert.ok(full.doc.pages[0]?.shapes.some((s) => s.t === 'image'), 'logo nel cartiglio');
  assert.ok(texts(4).includes('PAGINA N° 5/11') && texts(4).includes('SCALA 1:50'), 'striscia e scala della sezione');
  assert.ok(texts(1).some((t) => t.startsWith('LATO FERMAT')), 'lati delle fermate');
  // the same input gives the same drawing
  assert.equal(JSON.stringify(buildTavole(input({ ...defaultInputs(1740, 1445), Q: 400, access: 'none', room: null })).doc), JSON.stringify(small.doc));
});

test('logo del committente: nel cartiglio accanto al nome, fra le immagini del documento; senza, solo il nome', () => {
  const I = { ...defaultInputs(1740, 1445), Q: 400, access: 'none' as const, room: null };
  const withClient = buildTavole({ ...input(I, true), clientLogo: { mime: 'image/png', data: LOGO } }), without = buildTavole(input(I, true));
  const refs = (r: typeof without) => r.doc.pages[0]?.shapes.flatMap((s) => (s.t === 'image' ? [s.ref] : [])) ?? [];
  assert.deepEqual(refs(withClient).sort(), ['client', 'logo']);
  assert.deepEqual(refs(without), ['logo']);
  assert.ok(withClient.doc.images.client && !without.doc.images.client);
  // the client's logo inside the title block's client row, left of the column of the author
  const box = withClient.doc.pages[0]?.shapes.find((s) => s.t === 'image' && s.ref === 'client');
  assert.ok(box?.t === 'image' && box.box.x1 <= 150 && box.box.y1 - box.box.y0 > 5);
});

test('peso della cabina stimato dal software: segnato nel foglio 1 con la sua nota; calcolo e vano diversi tornano come avvisi', () => {
  const I: ShaftInputs = { ...defaultInputs(1740, 1445), Q: 400, access: 'none', room: null };
  const plain = buildTavole(input(I)), marked = buildTavole({ ...input(I), marks: { pEstimate: true, geometry: [], machineProposed: false } });
  const sheet1 = (r: typeof plain): string[] => r.doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];
  assert.ok(!sheet1(plain).some((t) => t.includes('STIMA')), 'nessun segno senza stima');
  assert.ok(sheet1(marked).includes('700 (STIMA)'), 'peso totale della cabina');
  assert.ok(sheet1(marked).includes('DATI STIMATI DAL SOFTWARE') && sheet1(marked).includes('NOTA 3'), 'nota per il cliente');
  for (const s of marked.doc.pages[0]?.shapes ?? []) for (const [x, y] of points(s)) assert.ok(x > -0.5 && x < A4.w + 0.5 && y > -0.5 && y < A4.h + 0.5, `${s.t} a ${x}, ${y}`);
  // the rated load of the calculation (630 kg) is not the shaft's (400 kg)
  assert.deepEqual(plain.warnings.filter((w) => w.what === 'load'), [{ what: 'load', calc: 630, shaft: 400 }]);
});

test('argano nel foglio 1: come scritto nei dati dell’impianto, altrimenti il modello del catalogo del progetto', () => {
  const I: ShaftInputs = { ...defaultInputs(1740, 1445), Q: 400, access: 'none', room: null };
  const sheet1 = (r: ReturnType<typeof buildTavole>): string[] => r.doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];
  const marks = { ...NO_MARKS, catalog: { brand: 'SICOR', model: 'SH140', ratio: '1/37', staticKg: 3300, src: 'D: prova' } };
  assert.ok(sheet1(buildTavole({ ...input(I), marks })).includes('M 73 (Sx)'), 'il testo dei dati dell’impianto resta');
  const blank = buildTavole({ ...input(I), plant: { ...input(I).plant, machine: undefined }, marks });
  assert.ok(sheet1(blank).includes('SICOR SH140'), 'senza testo, il modello del catalogo');
});

test('parti conservate delle tavole: si rileggono, altrimenti nessuna tavola', () => {
  assert.equal(setNumber(2026, 7), '26-007');
  assert.equal(setNumber(2031, 123), '31-123');
  const L = layout(defaultInputs(1600, 1750));
  const stored = {
    number: '26-001', createdAt: new Date(), authorInitials: 'A.C.', companyName: 'Ditta', plant: { machine: 'X' },
    projectData: { name: 'P', address: null, city: null, province: null, plantNumber: null, client: null },
    revisions: [{ mark: 'R1', text: 'prima modifica', date: new Date().toISOString() }],
  };
  assert.ok(storedInput(PRESETS.C, L, stored, null));
  assert.equal(storedInput(PRESETS.C, L, { ...stored, plant: { machine: 5 } }, null), null);
  assert.equal(storedInput(PRESETS.C, L, { ...stored, revisions: [{ mark: 'X', text: 'a', date: 'ieri' }] }, null), null);
  assert.ok(!projectDataSchema.safeParse({ name: '' }).success);
  assert.ok(!revisionsSchema.safeParse([{ mark: 'R1', text: '', date: new Date().toISOString() }]).success);
});

// 96 × 32 PNG
const LOGO = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAAAgCAIAAABiouoDAAAAfUlEQVR42u3aywmAMBBFUSO2YDlWZR1WZTkWMS7cDRgQowieu8n+8t6QX4mIDuf0FNQZjmWcFi4S2zpLkIq1qljK1Z9J00aCVIwggr40pOsT64mNhgSpGEEEgSCCCCKIIIIIIgjXDqsuGCWIIIJenUFeECWIoKYUvzsk6BY7X3sSQy3KvssAAAAASUVORK5CYII=';

test('logo: PNG o JPEG dai byte, non dal nome; dimensioni e peso controllati', () => {
  const png = new Uint8Array(Buffer.from(LOGO, 'base64'));
  assert.deepEqual(readLogo(png), { mime: 'image/png', width: 96, height: 32 });
  // a JPEG with its frame header: SOI, APP0, SOF0 (precision 8, height 40, width 120)
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x28, 0x00, 0x78, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
  assert.deepEqual(readLogo(jpeg), { mime: 'image/jpeg', width: 120, height: 40 });
  assert.equal(readLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(readLogo(new Uint8Array(0)), null);
  const huge = new Uint8Array(300 * 1024 + 1);
  huge.set(png);
  assert.equal(readLogo(huge), null);
  // a PNG too small to be a logo
  const tiny = new Uint8Array(png);
  new DataView(tiny.buffer).setUint32(16, 8);
  assert.equal(readLogo(tiny), null);
});

test('progetti del vano salvati prima dei dati verticali: si leggono con i valori tipici', () => {
  const v1 = {
    W: 1600, D: 1750, Q: null, door: 'T2', doorWidth: 800, cw: 'rear', access: 'dm236_existing',
    landingDepth: 80, sillGap: 30, carDoorDepth: 80, carWall: 35, railZone: 165, cwCarGap: 60, cwDepth: 140, cwWallGap: 80, rearGap: 60,
  };
  const r = shaftInputsSchema.safeParse(v1);
  assert.ok(r.success);
  assert.equal(r.data.entrances, 'one');
  assert.equal(r.data.vertical.floors.length, 5);
  assert.equal(r.data.room, null);
  assert.equal(layout(r.data).A, 1200);
  // a main floor past the floors is refused
  assert.ok(!shaftInputsSchema.safeParse({ ...v1, vertical: { ...r.data.vertical, main: 9 } }).success);
});
