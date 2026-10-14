// Every input a dimension of the drawings can change has a name: the editor shows it on the
// button over the dimension and in the field that opens (a missing one is a console error and a raw key on screen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import it from '../../../messages/it.json';
import { editKeys, editLabel } from '../index';

test('ogni chiave delle quote ha il suo nome', () => {
  const keys = editKeys();
  assert.ok(keys.includes('cs.offset') && keys.includes('n.0.depth') && keys.includes('room.panelAt'));
  const names: Record<string, unknown> = it.shaft;
  for (const key of keys) for (const cant of [false, true]) {
    const label = editLabel(key, cant);
    assert.equal(typeof names[label], 'string', `${key} → shaft.${label}`);
  }
  assert.equal(editLabel('plan.railY', true), 'pk_railY_cant');
  assert.equal(editLabel('n.2.width', false), 'nc_width');
  assert.equal(editLabel('cs.height', false), 'cs_height');
});
