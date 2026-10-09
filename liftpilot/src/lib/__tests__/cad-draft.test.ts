// The CAD files of a draft — a saved project's, a replacement's machine room's (round 37): their views alone, without
// sheet 1 and the sheets without a view, so the sheets and values their views name ("Foglio n", "VALORI NEL FOGLIO 1")
// are the PDF draft's — the lines under the first view name that PDF by its file, every sheet named is a sheet of it
// (each view's that very view), and the lines fit before the next view. And the page of an issued set says what its
// CAD files carry: every sheet of the PDF (cad-set.test.ts proves the files do).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { textWidth } from '@/drawing';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';
import { GAP, laidOut, toDwg, toDxf, type CadView } from '../cad/export';
import { draftCaption, inputViews, surveyViews } from '../cad/project';
import { readCad } from '../cad/read';
import { sheetLayer } from '../cad/set-export';
import { defaultLift, deriveLift } from '../lift';
import { valueMarks } from '../lift/marks';
import { startSurvey } from '../room/survey';
import { buildTavole } from '../tavole/build';
import { storedInput } from '../tavole/compose';
import { buildSurveyTavole } from '../tavole/survey-build';

interface Placed { text: string; x: number; y: number }

/** The texts of a DXF with their insertion points (codes 1, 10 and 20 of each TEXT). */
function dxfTexts(dxf: string): Placed[] {
  const lines = dxf.split('\n').map((s) => s.trim()), out: Placed[] = [];
  let cur: { type: string; text?: string; x?: number; y?: number } | null = null;
  const flush = (): void => {
    if (cur?.type === 'TEXT' && cur.text !== undefined && cur.x !== undefined && cur.y !== undefined) out.push({ text: cur.text, x: cur.x, y: cur.y });
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i], v = lines[i + 1] ?? '';
    if (c === '0') {
      flush();
      cur = { type: v };
    } else if (cur && c === '1') cur.text = v;
    else if (cur && c === '10' && cur.x === undefined) cur.x = Number(v);
    else if (cur && c === '20' && cur.y === undefined) cur.y = Number(v);
  }
  flush();
  return out;
}

/** A draft's CAD file names its PDF under its first view, every sheet it names is a sheet of that PDF (a view's sheet
 *  that view's), it has no sheet of paper of its own, and the lines under its first view fit before the next one. */
function draftNamesItsPdf(views: readonly CadView[], sheets: readonly { title: string }[], what: string): void {
  const pdf = 'bozza-2026-10-08.pdf', caption = draftCaption(what, pdf), at = new Date('2026-10-08T10:00:00Z'), dxf = toDxf(views, caption, at), texts = dxfTexts(dxf);
  const first = views[0], second = views[1];
  assert.ok(first && second);
  assert.ok(caption.some((l) => l.includes(pdf) && l.startsWith('BOZZA')), 'la riga nomina il PDF della bozza');
  // under the first view, at its left edge, below its title, subtitle and sheet
  const e = laidOut(first).extent, S = first.scale, top = texts.find((t) => t.text === first.title);
  assert.ok(top, first.title);
  for (const line of caption) {
    const t = texts.find((q) => q.text === line);
    assert.ok(t, line);
    assert.ok(Math.abs(t.x - e.x0 * S) < 1e-6 && t.y < top.y, line);
    // clear of the next view: the room is the first view's width and the gap
    assert.ok(textWidth(line, { size: 2.5 }) * S < (e.x1 - e.x0) * S + GAP, `${line}: ${Math.round(textWidth(line, { size: 2.5 }) * S)} mm`);
  }
  // no sheet of paper in a draft's file: sheet 1 and its values are the PDF's
  assert.ok(!dxf.includes(`\n  8\n${sheetLayer(1)}\n`));
  const named = [...dxf.matchAll(/FOGLIO (\d+)|Foglio (\d+) · /g)].map((m) => Number(m[1] ?? m[2]));
  assert.ok(named.includes(1), 'i valori del foglio 1');
  for (const n of named) assert.ok(n >= 1 && n <= sheets.length, `FOGLIO ${n}`);
  views.forEach((v) => {
    assert.ok(v.sheet !== undefined, v.title);
    assert.equal(sheets[v.sheet - 1]?.title, v.title, `Foglio ${v.sheet}`);
  });
  // the DWG the same
  const a = readCad(new TextEncoder().encode(dxf), 'bozza.dxf'), b = readCad(toDwg(views, caption, at), 'bozza.dwg');
  assert.equal(b.count, a.count);
  assert.deepEqual(b.bounds, a.bounds);
}

test('progetto salvato in DXF/DWG (BOZZA): sotto la prima vista il PDF della bozza, ogni foglio citato è un foglio di quel PDF', () => {
  const L = defaultLift(), d = deriveLift(L), project = { name: 'Prova', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB 1', client: 'C' };
  const x = storedInput(d.values, d.layout, { number: 'BOZZA', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] }, null, valueMarks(L.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  draftNamesItsPdf(inputViews(x), buildTavole(x).sheets, 'Prova · progetto p1 · 2026-10-08');
});

test('locale macchina della sostituzione in DXF/DWG (BOZZA): sotto la pianta il PDF della bozza, i fogli 2 e 3 sono i suoi', () => {
  const x = {
    values: PRESETS.A, survey: startSurvey(600), collaudo: { norma: '10411-1' as const, parti: ['machine' as const] }, plant: {},
    project: { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: null, client: null },
    company: { name: 'S', logo: null }, set: { number: 'BOZZA', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'M.R.', revisions: [] },
  };
  const r = buildSurveyTavole(x);
  draftNamesItsPdf(surveyViews(r.derived, {}), r.sheets, 'R · locale macchina r1 · 2026-10-08');
});

test('la pagina della serie emessa descrive i file CAD come sono: tutti i fogli del PDF, con le verifiche, in IT/EN/BG', () => {
  const lead = { it: it.tavole.cadLead, en: en.tavole.cadLead, bg: bg.tavole.cadLead };
  assert.ok(lead.it.startsWith('Tutti i fogli del PDF') && lead.it.includes('verifiche') && lead.it.includes('legende'));
  assert.ok(lead.en.startsWith('Every sheet of the PDF') && lead.en.includes('checks') && lead.en.includes('legends'));
  assert.ok(lead.bg.startsWith('Всички листове на PDF') && lead.bg.includes('проверките') && lead.bg.includes('легендите'));
});
