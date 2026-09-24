// state.test.js — повреден state.json не отваря kill-switch-а (Наблюдателя, 2026-09-24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveState } from '../src/state.js';

const dir = () => mkdtempSync(join(tmpdir(), 'treydar-state-'));

test('липсващ файл → чисто състояние, kill-switch изключен', () => {
  const s = loadState(join(dir(), 'state.json'));
  assert.equal(s.killed, false);
  assert.equal(s.stateError, undefined);
});

test('повреден файл → kill-switch ВКЛ. и файлът се пази за разбор', () => {
  const d = dir(); const f = join(d, 'state.json');
  writeFileSync(f, '{"killed": true, "equityPea');
  const s = loadState(f);
  assert.equal(s.killed, true);
  assert.match(s.stateError, /повреден/);
  assert.equal(existsSync(f), false, 'повреденият файл е преместен, не презаписан');
  assert.ok(readdirSync(d).some((n) => n.startsWith('state.json.corrupt-')));
});

test('JSON, който не е обект → също fail closed', () => {
  const f = join(dir(), 'state.json');
  writeFileSync(f, '[]');
  assert.equal(loadState(f).killed, true);
});

test('saveState е атомарен и се чете обратно', () => {
  const d = dir(); const f = join(d, 'state.json');
  saveState({ killed: true, equityPeak: 1000 }, f);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { killed: true, equityPeak: 1000 });
  assert.deepEqual(readdirSync(d), ['state.json'], 'без остатъчен .tmp');
  assert.equal(loadState(f).killed, true);
});
