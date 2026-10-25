/**
 * Плъгините от панела (CONTRACT §14) без база: каталогът, отговорът на агента, проверката на конфига и
 * отпечатъкът за одита (размер + sha256, никога съдържанието).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  CORE_PLUGINS,
  MAX_CONFIG_CHARS,
  PLUGIN_CATALOG,
  PLUGIN_IDS,
} from '../src/admin/plugins-catalog.js';
import {
  catalogRows,
  configFingerprint,
  isJsonObject,
  parsePluginConfig,
  parsePluginList,
} from '../src/admin/plugins-data.js';

test('каталогът: таблицата от §14; ядрото не е в него', () => {
  assert.deepEqual(
    PLUGIN_CATALOG.map((entry) => [entry.id, entry.kind, entry.config, entry.hasDefault]),
    [
      ['serverlistplayersfix', 'metamod', null, false],
      ['quakesounds', 'css', 'QuakeSounds', true],
      ['cosmetics', 'css', 'Cosmetics', true],
      ['demorecorder', 'css', 'DemoRecorder', true],
      ['cheatertroll', 'css', 'CheaterTroll', false],
      ['metablock', 'css', 'MetaBlock', true],
    ],
  );
  for (const id of PLUGIN_IDS) {
    assert.match(id, /^[a-z0-9]{1,32}$/, 'id-то влиза в името на systemd инстанцията');
  }
  for (const core of CORE_PLUGINS) {
    assert.ok(!(PLUGIN_IDS as readonly string[]).includes(core), core);
  }
  assert.equal(MAX_CONFIG_CHARS, 32_768);
});

test('списъкът от агента: подреден по каталога, непознатото вън, липсващото — без състояние', () => {
  const list = parsePluginList({
    busy: true,
    mods: [
      { id: 'metablock', kind: 'css', version: '1.0.0', state: 'disabled' },
      { id: 'quakesounds', kind: 'css', version: '26.08.1', state: 'enabled' },
      { id: 'evil', kind: 'css', version: '6.6.6', state: 'enabled' },
    ],
  });
  assert.ok(list);
  assert.equal(list.busy, true);
  assert.deepEqual(
    list.rows.map((row) => row.id),
    PLUGIN_CATALOG.map((entry) => entry.id),
  );
  assert.equal(list.rows.find((row) => row.id === 'metablock')?.state, 'disabled');
  assert.equal(list.rows.find((row) => row.id === 'quakesounds')?.version, '26.08.1');
  assert.equal(list.rows.find((row) => row.id === 'cosmetics')?.state, null);
  assert.equal(parsePluginList({ busy: false, mods: [{ id: 'x', state: 'gone' }] }), null);
  assert.equal(parsePluginList({ mods: [] }), null);
  assert.ok(catalogRows().every((row) => row.state === null && row.version === null));
});

test('конфигът: само JSON обект; таванът; отпечатъкът е sha256 на текста', () => {
  assert.equal(isJsonObject('{"enabled": true}'), true);
  assert.equal(isJsonObject('[1, 2]'), false);
  assert.equal(isJsonObject('null'), false);
  assert.equal(isJsonObject('"text"'), false);
  assert.equal(isJsonObject('{"a": '), false);
  assert.deepEqual(parsePluginConfig({ text: '{}', edited: true, hasDefault: false }), {
    text: '{}',
    edited: true,
    hasDefault: false,
  });
  assert.equal(
    parsePluginConfig({ text: 'x'.repeat(MAX_CONFIG_CHARS + 1), edited: false, hasDefault: true }),
    null,
  );
  const text = '{"name": "Щит"}';
  assert.deepEqual(configFingerprint(text), {
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  });
});
