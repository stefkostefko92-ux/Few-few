// Тест на sanitizzaOggetto: маскира лични имена на società di persone,
// вградени в свободния текст на публичния ANAC `oggetto`, без да реже
// описателен текст или наименования на капиталови дружества.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizzaOggetto } from '../src/fetch-dettagli.js';

test('маскира „DITTA … DI <лично име> … S.A.S." (прав апостроф)', () => {
  const out = sanitizzaOggetto(
    "FORNITURA DI STENT CORONARICI DITTA PRESIFARM DI D'ARRIGO TOMMASO S.A.S."
  );
  assert.ok(!/D'ARRIGO|TOMMASO|PRESIFARM/.test(out), out);
  assert.ok(out.startsWith('FORNITURA DI STENT CORONARICI'), out);
  assert.match(out, /operatore non nominato/);
});

test('маскира и типографски апостроф „D’ARRIGO"', () => {
  const out = sanitizzaOggetto(
    'FORNITURA DI STENT CORONARICI DITTA PRESIFARM DI D’ARRIGO TOMMASO S.A.S.'
  );
  assert.ok(!/D’ARRIGO|TOMMASO/.test(out), out);
});

test('маскира „… DI <име> & C. S.A.S." без „DITTA"', () => {
  const out = sanitizzaOggetto('APPALTO PER GIFRA DI TARANTINO LAURA & C. S.A.S.');
  assert.ok(!/TARANTINO|LAURA/.test(out), out);
  assert.ok(out.startsWith('APPALTO PER GIFRA'), out);
});

test('маскира S.N.C. форма', () => {
  const out = sanitizzaOggetto('DITTA ROSSI S.N.C. FORNITURA GUANTI');
  assert.ok(!/ROSSI/.test(out), out);
  assert.match(out, /FORNITURA GUANTI$/);
});

test('НЕ пипа описателен текст с „DI" без правна форма', () => {
  for (const s of [
    'FORNITURA DI FARMACI VARI PER IL REPARTO DI CARDIOLOGIA',
    'ACQUISTO DEFIBRILLATORI DI ULTIMA GENERAZIONE',
    'SERVIZIO DI PULIZIA E DISINFEZIONE',
  ]) {
    assert.equal(sanitizzaOggetto(s), s);
  }
});

test('НЕ пипа капиталови форми (S.P.A./S.R.L.)', () => {
  for (const s of [
    'SERVIZIO DI PULIZIA AFFIDATO A GPI S.P.A.',
    'FORNITURA DI PROTESI DITTA MEDICAL DEVICE S.R.L.',
    'ADESIONE CONVENZIONE CONSIP FARMACI',
  ]) {
    assert.equal(sanitizzaOggetto(s), s);
  }
});

test('маскира именувани физ. лица с професионална титла (AVV./PROF.SSA/GEOM.)', () => {
  for (const [inp, forbidden] of [
    ['INCARICO LEGALE AVV. FRANCESCO ROSSI PER RICORSO', /ROSSI|FRANCESCO/],
    ['PATROCINIO AVV BIGONI ALESSANDRO', /BIGONI|ALESSANDRO/],
    ['CONSULENZA PROF.SSA IRENE BONACCORSI', /IRENE|BONACCORSI/],
    ['PERIZIA GEOM. LUIGI BIANCHI', /LUIGI|BIANCHI/],
  ]) {
    const out = sanitizzaOggetto(inp);
    assert.ok(!forbidden.test(out), `изтича име: ${out}`);
    assert.match(out, /nominativo omesso/);
  }
});

test('НЕ маскира дума, започваща като титла (PROFILO/SIGILLI)', () => {
  for (const s of [
    'FORNITURA DI PROFILATI IN ALLUMINIO',
    'ACQUISTO SIGILLI DI SICUREZZA',
    'SERVIZIO DI RISTORAZIONE OSPEDALIERA',
  ]) {
    assert.equal(sanitizzaOggetto(s), s);
  }
});

test('празен/невалиден вход', () => {
  assert.equal(sanitizzaOggetto(''), '');
  assert.equal(sanitizzaOggetto(null), '');
  assert.equal(sanitizzaOggetto(undefined), '');
});
