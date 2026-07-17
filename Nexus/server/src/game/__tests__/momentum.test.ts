// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import { applyHuntMomentum, COMBO_WINDOW_MS, COMBO_CAP, COMBO_STEP, FIRST_WIN_MULT } from '../momentum';

let seq = 0;
function mkChar(): number {
  return getDb().prepare(
    `INSERT INTO characters (name, class, energy_updated_at, created_at) VALUES (?, 'warrior', 0, 0)`,
  ).run(`momo_${++seq}`).lastInsertRowid as number;
}

const DAY = 86_400_000;

test('комбото расте с +4%/стак и се капва на +40%', () => {
  const db = getDb();
  const id = mkChar();
  const t0 = 100 * DAY; // фиксиран „ден" — първата победа е в отделен тест
  let m = applyHuntMomentum(db, id, true, t0);
  assert.equal(m.combo, 1);
  assert.equal(m.comboBonusPct, 0, 'първата победа няма комбо бонус');
  for (let i = 2; i <= 15; i++) m = applyHuntMomentum(db, id, true, t0 + i * 1000);
  assert.equal(m.combo, 15);
  assert.equal(m.comboBonusPct, COMBO_CAP * COMBO_STEP * 100, 'капнато на +40%');
  assert.ok(Math.abs(m.mult - 1.4) < 1e-9, 'mult 1.4 (първата победа вече е взета)');
});

test('изтекъл 10-мин прозорец нулира комбото до 1', () => {
  const db = getDb();
  const id = mkChar();
  const t0 = 200 * DAY;
  applyHuntMomentum(db, id, true, t0);
  applyHuntMomentum(db, id, true, t0 + 1000);
  const late = applyHuntMomentum(db, id, true, t0 + 1000 + COMBO_WINDOW_MS + 1);
  assert.equal(late.combo, 1, 'извън прозореца → ново комбо');
});

test('загуба чупи комбото', () => {
  const db = getDb();
  const id = mkChar();
  const t0 = 300 * DAY;
  applyHuntMomentum(db, id, true, t0);
  applyHuntMomentum(db, id, true, t0 + 1000);
  const loss = applyHuntMomentum(db, id, false, t0 + 2000);
  assert.equal(loss.mult, 1);
  const next = applyHuntMomentum(db, id, true, t0 + 3000);
  assert.equal(next.combo, 1, 'след загуба се почва от 1');
});

test('първа победа за деня дава ×2, само веднъж на ден', () => {
  const db = getDb();
  const id = mkChar();
  const t0 = 400 * DAY;
  const first = applyHuntMomentum(db, id, true, t0);
  assert.equal(first.firstWin, true);
  assert.equal(first.mult, FIRST_WIN_MULT, 'първата победа: ×2 (без комбо бонус)');
  const second = applyHuntMomentum(db, id, true, t0 + 1000);
  assert.equal(second.firstWin, false, 'второто убийство същия ден не е първо');
  const nextDay = applyHuntMomentum(db, id, true, t0 + DAY);
  assert.equal(nextDay.firstWin, true, 'на следващия ден пак има първа победа');
});

test('максималният множител е ограничен: (1+0.40)×2 = 2.8', () => {
  const db = getDb();
  const id = mkChar();
  const t0 = 500 * DAY;
  // Натрупай пълно комбо в „ден 500", после първата победа на ден 501.
  for (let i = 0; i < 12; i++) applyHuntMomentum(db, id, true, t0 + i * 1000);
  const peak = applyHuntMomentum(db, id, true, t0 + 12_000 + DAY - (12_000 % DAY));
  assert.ok(peak.mult <= 2.8 + 1e-9, `mult ${peak.mult} ≤ 2.8`);
});

/* ===== Bestiary колекции (claim路 логика през БД) ===== */

test('bestiary region claim: PRIMARY KEY блокира двоен claim', () => {
  const db = getDb();
  const id = mkChar();
  db.prepare('INSERT INTO bestiary_region_claims (character_id, region, claimed_at) VALUES (?, ?, ?)')
    .run(id, 'whispering_woods', Date.now());
  assert.throws(() => {
    db.prepare('INSERT INTO bestiary_region_claims (character_id, region, claimed_at) VALUES (?, ?, ?)')
      .run(id, 'whispering_woods', Date.now());
  }, /UNIQUE|PRIMARY/i);
});
