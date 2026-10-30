// Panev's supports of the counterweight rails in the design: chosen by default, checked against the catalogue's
// printed ranges and the room for the plate, drawn in the plan with their code and their count per rail (one every
// 2 m plus the first and the last); generic brackets on request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketCount, defaultInputs, layout, planEntities, railSpan, section, type ShaftInputs } from '../index';

const base = defaultInputs(1600, 1750);
const staffa = (I: ShaftInputs) => layout(I).checks.find((c) => c.id === 'v_staffa');
const codes = (I: ShaftInputs) => planEntities(layout(I), 'main', I.vertical.main).flatMap((e) => (e.e === 'text' && e.text.includes('SG') ? [e.text] : []));

test('staffe Panev: la più corta il cui campo prende la guida, disegnata con il suo codice e il numero per guida', () => {
  // the rail's axis 80 + 140 / 2 = 150 mm from the wall: SU 160 (45–155) with SG 150
  const [z0, z1] = railSpan(section(layout(base))), n = bracketCount(z1 - z0);
  assert.equal(n, Math.floor((z1 - z0) / 2000) + 2);
  assert.equal(staffa(base)?.status, 'ok');
  assert.equal(staffa(base)?.value, 5);
  assert.deepEqual(codes(base), [`${n}× SU 220 160 + SG 80 150`]);
  assert.deepEqual(codes({ ...base, cwWallGap: 100 }), [`${n}× SU 220 180 + SG 80 170`]);
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
