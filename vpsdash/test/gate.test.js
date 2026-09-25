// Гейтът е ЕДНО място — и това се пази, не се помни.
//
// Проверките бяха пръснати между package.json, CI-я и главата на човека. Такова
// дублиране дрейфва в една посока: CI-ят тихо става по-слаб от това, което
// пускаш локално, и никой не забелязва, докато не мине счупена промяна.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const gate = fs.readFileSync(path.join(ROOT, 'scripts/gate.mjs'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ciPath = path.join(ROOT, '..', '.github/workflows/vpsdash.yml');

test('гейт: всяка проверка сочи към СЪЩЕСТВУВАЩ скрипт', () => {
  const scripts = [...gate.matchAll(/'(scripts\/[\w-]+\.mjs)'/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 5, `очакват се поне 5 проверки, намерени ${scripts.length}`);
  for (const s of scripts) {
    assert.ok(fs.existsSync(path.join(ROOT, s)), `${s} го няма — гейтът вика мъртъв скрипт`);
  }
});

test('гейт: CI-ят го ВИКА, вместо да преписва проверките', () => {
  const ci = fs.readFileSync(ciPath, 'utf8');
  assert.match(ci, /npm run gate/, 'CI-ят трябва да вика гейта');
  // Ако CI-ят почне пак да изброява проверки сам, дрейфът се връща.
  const inlined = ['syntax-check.mjs', 'ui-sweep.mjs', 'degraded-audit.mjs', 'a11y-audit.mjs', 'corrupt-audit.mjs']
    .filter((s) => ci.includes(s));
  assert.deepEqual(inlined, [], `CI-ят преписва проверки вместо да вика гейта: ${inlined.join(', ')}`);
});

test('гейт: всяка проверка има и свой npm script (за пускане поотделно)', () => {
  const ids = [...gate.matchAll(/id: '([\w-]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 6, `очакват се поне 6 проверки, намерени ${ids.length}`);
  for (const id of ids) {
    assert.ok(pkg.scripts[id], `липсва "npm run ${id}" — проверката не може да се пусне сама`);
  }
});

test('гейт: браузърните са ОТБЕЛЯЗАНИ като такива', () => {
  // Иначе човек чака мълчаливо пропусната проверка и я мисли за минала.
  for (const id of ['sweep', 'a11y']) {
    const line = gate.split('\n').find((l) => l.includes(`id: '${id}'`));
    assert.match(line, /browser: true/, `${id} иска браузър, а не е отбелязана`);
  }
});
