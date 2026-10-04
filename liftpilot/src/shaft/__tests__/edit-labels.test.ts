// Every input a dimension of the drawings can change has a name in the three languages: the editor shows it on the
// button over the dimension and in the field that opens (a missing one is a console error and a raw key on screen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';
import { editKeys, editLabel } from '../index';

test('ogni chiave delle quote ha il suo nome in italiano, inglese e bulgaro', () => {
  const keys = editKeys();
  assert.ok(keys.includes('cs.offset') && keys.includes('n.0.depth') && keys.includes('room.panelAt'));
  for (const [lang, m] of [['it', it.shaft], ['en', en.shaft], ['bg', bg.shaft]] as const) {
    const names: Record<string, unknown> = m;
    for (const key of keys) for (const cant of [false, true]) {
      const label = editLabel(key, cant);
      assert.equal(typeof names[label], 'string', `${lang}: ${key} → shaft.${label}`);
    }
  }
  assert.equal(editLabel('plan.railY', true), 'pk_railY_cant');
  assert.equal(editLabel('n.2.width', false), 'nc_width');
  assert.equal(editLabel('cs.height', false), 'cs_height');
});
