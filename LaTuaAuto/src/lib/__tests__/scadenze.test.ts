import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromIso, toIso, addYears, nextRevisione, nextTyreDeadline, patenteValidityYears,
  patenteExpiry, fineDeadlines, ageAt, daysUntil,
} from '../scadenze';

const d = fromIso;

test('addYears: 29.02 в невисокосна година пада на 28.02', () => {
  assert.equal(toIso(addYears(d('2024-02-29'), 1)), '2025-02-28');
});

test('revisione: първа на 4 г. до края на месеца, после на всеки 2', () => {
  assert.equal(toIso(nextRevisione(d('2022-03-10'), d('2024-01-01'))), '2026-03-31');
  // вече минала първата → следващата двугодишна
  assert.equal(toIso(nextRevisione(d('2018-03-10'), d('2024-06-01'))), '2026-03-31');
  // известна последна revisione → +2 г.
  assert.equal(toIso(nextRevisione(d('2015-01-01'), d('2024-06-01'), d('2023-07-20'))), '2025-07-31');
});

test('gomme: прозорците 15.10–15.11 и 15.04–15.05', () => {
  const w = nextTyreDeadline(d('2026-09-08'));
  assert.equal(w.kind, 'INVERNALI');
  assert.equal(toIso(w.canChangeFrom), '2026-10-15');
  assert.equal(toIso(w.deadline), '2026-11-15');
  const s = nextTyreDeadline(d('2026-02-01'));
  assert.equal(s.kind, 'ESTIVE');
  assert.equal(toIso(s.deadline), '2026-05-15');
  const late = nextTyreDeadline(d('2026-12-01'));
  assert.equal(toIso(late.deadline), '2027-05-15');
});

test('patente: валидност по възраст 10/5/3/2', () => {
  assert.equal(patenteValidityYears(30), 10);
  assert.equal(patenteValidityYears(50), 5);
  assert.equal(patenteValidityYears(70), 3);
  assert.equal(patenteValidityYears(80), 2);
});

test('ageAt и patenteExpiry падат на рождения ден', () => {
  assert.equal(ageAt(d('1990-06-15'), d('2026-06-14')), 35);
  assert.equal(ageAt(d('1990-06-15'), d('2026-06-15')), 36);
  // издадена на 36 г. → 10 г. → изтича на рождения ден 2036
  assert.equal(toIso(patenteExpiry(d('1990-06-15'), d('2026-09-01'))), '2037-06-15');
});

test('multa: −30% до 5 дни (следващ работен ден), 30 GdP, 60 Prefetto', () => {
  // понеделник 2026-09-07 → +5 = събота 12.09 → понеделник 14.09
  const f = fineDeadlines(d('2026-09-07'));
  assert.equal(toIso(f.scontoUntil), '2026-09-14');
  assert.equal(toIso(f.ricorsoGiudiceDiPaceUntil), '2026-10-07');
  assert.equal(toIso(f.ricorsoPrefettoUntil), '2026-11-06');
  // 5-ият ден на празник (25.12) → 28.12 (28-ми е понеделник 2026)
  assert.equal(toIso(fineDeadlines(d('2026-12-20')).scontoUntil), '2026-12-28');
});

test('daysUntil: отрицателно при просрочие', () => {
  assert.equal(daysUntil(d('2026-09-10'), d('2026-09-08')), 2);
  assert.equal(daysUntil(d('2026-09-01'), d('2026-09-08')), -7);
});
