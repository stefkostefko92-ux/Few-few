import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catProc } from '../src/fetch-appalti.js';

// Golden: класификацията на процедурите определя дела „senza gara“ — заключваме я.
test('catProc — пряко възлагане = diretto', () => {
  assert.equal(catProc('AFFIDAMENTO DIRETTO'), 'diretto');
});

test('catProc — пряко в рамково споразумение НЕ е diretto (вече състезано)', () => {
  assert.equal(catProc('AFFIDAMENTO DIRETTO IN ADESIONE AD ACCORDO QUADRO/CONVENZIONE'), 'quadro');
});

test('catProc — договаряне без публикация = negoziataSenza', () => {
  assert.equal(catProc('PROCEDURA NEGOZIATA SENZA PREVIA PUBBLICAZIONE'), 'negoziataSenza');
});

test('catProc — открита/ограничена = competitiva', () => {
  assert.equal(catProc('PROCEDURA APERTA'), 'competitiva');
  assert.equal(catProc('PROCEDURA RISTRETTA'), 'competitiva');
  assert.equal(catProc('DIALOGO COMPETITIVO'), 'competitiva');
});

test('catProc — конвенция (Consip/централи) = quadro, не senza gara', () => {
  assert.equal(catProc('CONFRONTO COMPETITIVO IN ADESIONE AD ACCORDO QUADRO/CONVENZIONE'), 'quadro');
});

test('catProc — непознато = altro', () => {
  assert.equal(catProc('ND P1_20'), 'altro');
});
