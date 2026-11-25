// Тестове за чистата логика на интерфейса (без DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, sameWord } from '../public/ui.js';

test('палет: точното съвпадение бие разпръснатото', () => {
  const exact = fuzzyScore('docker', 'Отиди: Docker');
  const fuzzy = fuzzyScore('dkr', 'Отиди: Docker');
  assert.ok(exact > fuzzy, 'подниз трябва да е по-силен от subsequence');
  assert.ok(fuzzy > 0, 'разпръснатото пак трябва да намира');
});

test('палет: несъвпадение връща нула', () => {
  assert.equal(fuzzyScore('zzz', 'Отиди: Docker'), 0);
  assert.equal(fuzzyScore('xq', 'Услуги'), 0);
});

test('палет: празна заявка пропуска всичко', () => {
  assert.ok(fuzzyScore('', 'каквото и да е') > 0);
  assert.ok(fuzzyScore('   ', 'каквото и да е') > 0);
});

test('палет: подрежда смислено между кандидати', () => {
  const cands = ['Отиди: Docker', 'Отиди: Бази', 'Рестартирай docker.service', 'Отиди: Деплой'];
  const ranked = cands
    .map((c) => ({ c, s: fuzzyScore('docker', c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
  assert.equal(ranked.length, 2);
  // „Отиди: Docker" има съвпадението по-рано в низа → отгоре.
  assert.equal(ranked[0], 'Отиди: Docker');
});

test('палет: кирилица работи', () => {
  assert.ok(fuzzyScore('услуги', 'Отиди: Услуги') > 0);
  assert.ok(fuzzyScore('аларм', 'Отиди: Аларми') > 0);
  assert.equal(fuzzyScore('аларм', 'Отиди: Docker'), 0);
});

// Телефонът пише първата буква главна и „поправя" думите. Сравнението беше
// буквално → на iPhone/Android нищо необратимо не можеше да се потвърди
// („Диск" не чистеше нищо). Регистърът не е част от съзнателното изписване.
test('потвърждение: „Изтрий" от телефона се приема, „изтри" — не', () => {
  assert.equal(sameWord('Изтрий', 'изтрий'), true);
  assert.equal(sameWord('  ИЗТРИЙ ', 'изтрий'), true);
  assert.equal(sameWord('Лаборатория', 'Лаборатория'), true);
  assert.equal(sameWord('V2202610440855542359', 'v2202610440855542359'), true, 'името на машината с главна буква');
  // й като „и" + кратка (NFD) — някои клавиатури го пращат така.
  assert.equal(sameWord('\u0438\u0437\u0442\u0440\u0438\u0438\u0306', 'изтрий'), true);
  assert.equal(sameWord('изтри', 'изтрий'), false);
  assert.equal(sameWord('', ''), false, 'празно никога не потвърждава');
  assert.equal(sameWord('delete', 'изтрий'), false);
});
