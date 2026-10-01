// Panev's supports of the counterweight rails in the design: chosen by default, checked against the catalogue's
// printed ranges and the room for the plate, drawn in the plan with their code; generic brackets on request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultInputs, layout, planEntities, type ShaftInputs } from '../index';

const base = defaultInputs(1600, 1750);
const staffa = (I: ShaftInputs) => layout(I).checks.find((c) => c.id === 'v_staffa');
const codes = (I: ShaftInputs) => planEntities(layout(I), 'main', I.vertical.main).flatMap((e) => (e.e === 'text' && e.text.includes('SG') ? [e.text] : []));

test('staffe Panev: la più corta il cui campo prende la guida, disegnata con il suo codice', () => {
  // the rail's axis 80 + 140 / 2 = 150 mm from the wall: SU 160 (45–155) with SG 150
  assert.equal(staffa(base)?.status, 'ok');
  assert.equal(staffa(base)?.value, 5);
  assert.deepEqual(codes(base), ['SU 220 160 + SG 80 150']);
  assert.deepEqual(codes({ ...base, cwWallGap: 100 }), ['SU 220 180 + SG 80 170']);
  // in a niche the distance is from its back, and the plate stays inside it
  assert.equal(staffa({ ...base, niches: [{ use: 'cw', wall: 'rear', at: 300, width: 1000, depth: 150 }] })?.status, 'ok');
});

test('nessuna staffa del catalogo: «Non conforme»; staffe generiche: nessuna verifica e nessun codice', () => {
  const far = { ...base, cwWallGap: 200 };
  assert.equal(staffa(far)?.status, 'fail');
  assert.equal(staffa(far)?.value, 215 - 270);
  assert.equal(staffa({ ...far, cwBrackets: 'generic' }), undefined);
  assert.deepEqual(codes({ ...base, cwBrackets: 'generic' }), []);
});
