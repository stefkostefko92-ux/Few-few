// What the two browser surveys of a drawing share (src/lib/cad/pick.ts: the shaft on /progetto, SurveyPanel; the machine
// room of a replacement, LocaleCad): a click measured with the walls' direction looked for within 3 m and the rays up to
// 30 m, in millimetres whatever the drawing's unit — the very measure both made before —, and a reading error as the
// key of its text, anything unknown «unreadable».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as acad from '@node-projects/acad-ts';
import { readCad, CadReadError } from '../cad/read';
import { castRays, dominantAngle } from '../cad/measure';
import { ANGLE_PROBE_MM, CAD_READ_ERRORS, RAY_MAX_MM, cadReadError, pickSurvey } from '../cad/pick';
import it from '../../../messages/it.json';

const A = (20 * Math.PI) / 180;
const rot = (x: number, y: number): [number, number] => [x * Math.cos(A) - y * Math.sin(A), x * Math.sin(A) + y * Math.cos(A)];

/** A shaft 1600 × 1750 in centimetres, turned by 20°. */
function plan(): Uint8Array {
  const doc = new acad.CadDocument();
  const { header, modelSpace } = doc;
  if (!header || !modelSpace) throw new Error('document');
  header.version = acad.ACadVersion.AC1027;
  header.insUnits = acad.UnitsType.Centimeters;
  const at = (x: number, y: number): acad.XY => new acad.XY(...rot(x, y));
  const p = new acad.LwPolyline([at(0, 0), at(160, 0), at(160, 175), at(0, 175)]);
  p.isClosed = true;
  modelSpace.entities.add(p);
  const out: string[] = [];
  new acad.DxfWriter({ write: (v: string) => { out.push(v); } }, doc).write();
  return new TextEncoder().encode(out.join(''));
}

test('clic sul disegno: la stessa misura di prima (direzione entro 3 m, raggi fino a 30 m, in mm qualunque sia l’unità)', () => {
  assert.deepEqual([ANGLE_PROBE_MM, RAY_MAX_MM], [3000, 30000]);
  const m = readCad(plan(), 'vano.dxf'), visible = (): boolean => true, k = 10, [x, y] = rot(80, 90);
  const s = pickSurvey(m, visible, x, y, k);
  assert.deepEqual(s, castRays(m, visible, x, y, dominantAngle(m, visible, x, y, 3000 / k), 30000 / k));
  assert.ok(s);
  assert.deepEqual([Math.round((s.left + s.right) * k), Math.round((s.up + s.down) * k)], [1600, 1750]);
  // far outside the shaft nothing closes it in within 30 m
  assert.equal(pickSurvey(m, visible, 5000, 5000, k), null);
});

test('errore di lettura: il codice del testo (shaft.err_*) e il dettaglio, ogni altro errore «unreadable»', () => {
  assert.deepEqual([...CAD_READ_ERRORS].sort(), ['dwgVersion', 'empty', 'tooLarge', 'unreadable']);
  assert.deepEqual(cadReadError(new CadReadError('dwgVersion', 'AC1014')), { code: 'dwgVersion', detail: 'AC1014' });
  assert.deepEqual(cadReadError(new CadReadError('tooLarge')), { code: 'tooLarge', detail: '' });
  assert.deepEqual(cadReadError(Object.assign(new Error('x'), { code: 'EACCES' })), { code: 'unreadable', detail: '' });
  assert.deepEqual(cadReadError(new TypeError('boom')), { code: 'unreadable', detail: '' });
  assert.deepEqual(cadReadError('not an error'), { code: 'unreadable', detail: '' });
  // every code has its text
  const shaft: Record<string, string> = it.shaft;
  for (const c of CAD_READ_ERRORS) assert.ok(shaft[`err_${c}`], c);
});
