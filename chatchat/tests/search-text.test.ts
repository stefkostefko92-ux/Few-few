import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  fold,
  MAX_TERMS,
  searchTerms,
  snippetOf,
  toTsQuery,
} from '../src/services/collab/search-text.js';

/** Търсенето (FR-16) — чистите части: заявката не носи синтаксис от потребителя, откъсът е текст. */

const marked = (parts: Array<{ text: string; match: boolean }>) =>
  parts.filter((p) => p.match).map((p) => p.text);
const joined = (parts: Array<{ text: string }>) => parts.map((p) => p.text).join('');

describe('заявката', () => {
  test('думите на всеки език; операторите и кавичките на tsquery не минават', () => {
    assert.deepEqual(searchTerms("E37 & !K1 | 'x' <-> (Città)"), ['E37', 'K1', 'x', 'Città']);
    assert.deepEqual(searchTerms('Бобов дол — табло'), ['Бобов', 'дол', 'табло']);
    assert.deepEqual(searchTerms('   !!! ... '), []);
    assert.equal(toTsQuery([]), null);
    assert.equal(toTsQuery(['E37', 'citta']), "'E37' & 'citta':*");
    for (const t of searchTerms("a'b:*c\\d")) assert.match(t, /^[\p{L}\p{N}]+$/u);
  });

  test('без повторения (по сгънатата форма), до 8 думи, всяка до 64 знака', () => {
    assert.deepEqual(searchTerms('Città citta CITTÀ'), ['Città']);
    const many = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    assert.equal(searchTerms(many).length, MAX_TERMS);
    assert.equal(searchTerms('x'.repeat(200))[0]?.length, 64);
  });

  test('сгъване: регистър и диакритика (it/bg)', () => {
    assert.equal(fold('Perché'), 'perche');
    assert.equal(fold('ЁЛКА'), 'елка');
    assert.equal(fold('İstanbul'), 'istanbul');
  });
});

describe('откъсът', () => {
  test('подчертава по началото на дума; последната дума — префикс (цялата дума)', () => {
    // „citta“ (не последна) — само цяла дума: „Città“ да, „cittadella“ не; „e37“ — префикс.
    const parts = snippetOf('Il quadro E370 è in Città, non in cittadella', ['citta', 'e37']);
    assert.deepEqual(marked(parts), ['E370', 'Città']);
    const prefix = snippetOf('La cittadella e la Città', ['e', 'citta']);
    assert.deepEqual(marked(prefix), ['cittadella', 'e', 'Città']);
    // „e“ не е префикс (не е последна) — „E370“ не се подчертава заради него.
    assert.deepEqual(marked(snippetOf('E370 e basta', ['e', 'basta'])), ['e', 'basta']);
  });

  test('кирилица и смесено писмо; текстът се пази дословно (без HTML)', () => {
    const body = 'Таблото <b>спря</b> на E37 — проверете клема K1';
    const parts = snippetOf(body, ['клема']);
    assert.deepEqual(marked(parts), ['клема']);
    assert.equal(joined(parts), body);
  });

  test('дълъг текст: около първото съвпадение, по граница на дума, с „…“', () => {
    const body = `${'parola '.repeat(60)}ALLARME finale ${'coda '.repeat(60)}`;
    const parts = snippetOf(body, ['allarme'], 20);
    const text = joined(parts);
    assert.ok(text.startsWith('…'));
    assert.ok(text.endsWith('…'));
    assert.ok(text.length < 80);
    assert.deepEqual(marked(parts), ['ALLARME']);
    assert.equal(/\bparol$|^…arola/.test(text), false);
  });

  test('без съвпадение — началото на текста, без подчертаване; празно — нищо', () => {
    const parts = snippetOf('Testo senza la parola cercata', ['zzz']);
    assert.deepEqual(marked(parts), []);
    assert.ok(joined(parts).startsWith('Testo'));
    assert.deepEqual(snippetOf('   ', ['x']), []);
  });

  test('емоджи и сурогатни двойки не се цепят', () => {
    const body = `${'🙂'.repeat(50)} errore E37 ${'🙂'.repeat(50)}`;
    const text = joined(snippetOf(body, ['e37'], 10));
    assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), false);
    assert.equal(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text), false);
  });
});
