import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampText, hexToRgba, initialsOf, ogSafeText } from '../og-text';

test('ogSafeText: латиница/кирилица/гръцки остават, емоджи и CJK се махат', () => {
  assert.equal(ogSafeText('Мария 🌸 Petrova Σοφία'), 'Мария Petrova Σοφία');
  assert.equal(ogSafeText('東京 Tokyo'), 'Tokyo');
  assert.equal(ogSafeText('„Цитат“ — 100%'), '„Цитат“ — 100%');
  assert.equal(ogSafeText('Žižek Ærø'), 'Žižek Ærø');
});

test('clampText: реже с многоточие по код-точки', () => {
  assert.equal(clampText('abcdef', 4), 'abc…');
  assert.equal(clampText('abc', 4), 'abc');
  assert.equal(clampText('  a   b  ', 10), 'a b');
});

test('initialsOf', () => {
  assert.equal(initialsOf('Мария Петрова'), 'МП');
  assert.equal(initialsOf('madonna'), 'M');
  assert.equal(initialsOf(''), '');
});

test('hexToRgba: валиден hex и резервен цвят', () => {
  assert.equal(hexToRgba('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)');
  assert.equal(hexToRgba('red', 1), 'rgba(59, 130, 196, 1)');
});
