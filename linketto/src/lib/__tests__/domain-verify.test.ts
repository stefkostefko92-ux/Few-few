import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainChange, domainTxtName, domainTxtValue, txtMatches } from '../domain-verify';

// D: собственият домейн се сервира само след TXT проверка на собствеността —
// иначе всеки платен потребител може да „заеме“ чужд домейн (unique) преди собственика.

test('D1: име и стойност на TXT записа', () => {
  assert.equal(domainTxtName('links.example.eu'), '_linketto.links.example.eu');
  assert.equal(domainTxtValue('abc123'), 'linketto-verify=abc123');
});

test('D2: TXT записите съвпадат — вкл. разделени на части и с интервали', () => {
  assert.equal(txtMatches([['v=spf1 -all'], ['linketto-verify=abc123']], 'abc123'), true);
  assert.equal(txtMatches([['linketto-verify=', 'abc123']], 'abc123'), true);
  assert.equal(txtMatches([[' linketto-verify=abc123 ']], 'abc123'), true);
  assert.equal(txtMatches([['linketto-verify=abc1234']], 'abc123'), false);
  assert.equal(txtMatches([['linketto-verify=ABC123']], 'abc123'), false);
  assert.equal(txtMatches([], 'abc123'), false);
  assert.equal(txtMatches([['linketto-verify=']], ''), false);
});

test('D3: смяна на домейна нулира проверката; същият домейн я пази', () => {
  assert.deepEqual(domainChange({ current: null, next: null }), { kind: 'keep' });
  assert.deepEqual(domainChange({ current: 'a.eu', next: 'a.eu' }), { kind: 'keep' });
  assert.deepEqual(domainChange({ current: 'a.eu', next: null }), { kind: 'clear' });
  assert.equal(domainChange({ current: 'a.eu', next: 'b.eu' }).kind, 'reset');
  assert.equal(domainChange({ current: null, next: 'b.eu' }).kind, 'reset');
});
