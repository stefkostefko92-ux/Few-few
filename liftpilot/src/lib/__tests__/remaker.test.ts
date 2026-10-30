// Who makes a record again (rbac.ts remakerOf) as the notice above it says (src/components/StaleNotice.tsx): the sentence
// about «Aggiorna con il software attuale» only beside the button, for whoever may make the record again; whoever may
// not reads which colleague does; on an archived project nobody (rbac.ts remakerOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capsOf, remakerOf } from '../rbac';
import it from '../../../messages/it.json';

const BUTTON = '«Aggiorna con il software attuale»';

test('chi rifà il record: io (con il bottone), il collega che disegna il progetto o che fa i calcoli; nessuno se archiviato', () => {
  // the Tecnico makes the calculations, does not draw the project
  assert.equal(remakerOf('TECHNICIAN', 'calc', true), 'self');
  assert.equal(remakerOf('TECHNICIAN', 'lift', true), 'drawer');
  assert.equal(remakerOf('TECHNICIAN', 'room', true), 'drawer');
  // the Commerciale neither
  assert.equal(remakerOf('SALES', 'calc', true), 'calc');
  assert.equal(remakerOf('SALES', 'lift', true), 'drawer');
  for (const r of ['OWNER', 'CHIEF_TECHNICIAN', 'ENGINEER'] as const) for (const k of ['calc', 'lift', 'room'] as const) assert.equal(remakerOf(r, k, true), 'self', `${r} ${k}`);
  // read-only mode keeps making records again (terms art. 10)
  assert.equal(remakerOf({ role: 'ENGINEER', readOnly: true }, 'lift', true), 'self');
  // the company takes the calculations away from the Tecnico: a colleague makes the calculation again
  assert.equal(remakerOf({ role: 'TECHNICIAN', caps: capsOf('TECHNICIAN', [{ role: 'TECHNICIAN', capability: 'calc:create', granted: false }]) }, 'calc', true), 'calc');
  // archived: no button, no colleague
  for (const k of ['calc', 'lift', 'room'] as const) assert.equal(remakerOf('OWNER', k, false), null);
  assert.equal(remakerOf('TECHNICIAN', 'lift', false), null);
});

test('il testo dell’avviso nomina il bottone solo nella frase che lo accompagna', () => {
  const t = it.refresh;
  for (const k of ['design', 'calc', 'room', 'archive', 'byDrawer', 'byCalc'] as const) assert.ok(!t[k].includes(BUTTON), k);
  for (const k of ['design_button', 'calc_button', 'room_button'] as const) assert.ok(t[k].startsWith(BUTTON), k);
  assert.match(t.byDrawer, /collega che disegna il progetto/);
  assert.match(t.byCalc, /collega che fa i calcoli/);
});
