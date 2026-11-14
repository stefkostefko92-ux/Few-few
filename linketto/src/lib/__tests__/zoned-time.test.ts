import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedLocalToUtc } from '../zoned-time';

// Насрочване: datetime-local е „стенен“ час в зоната на браузъра на създателя —
// не в зоната на сървъра.

test('София зимно (UTC+2) и лятно (UTC+3) време', () => {
  assert.equal(zonedLocalToUtc('2026-12-01T10:00', 'Europe/Sofia')?.toISOString(), '2026-12-01T08:00:00.000Z');
  assert.equal(zonedLocalToUtc('2026-07-01T10:00', 'Europe/Sofia')?.toISOString(), '2026-07-01T07:00:00.000Z');
});

test('други зони и UTC', () => {
  assert.equal(zonedLocalToUtc('2026-12-01T10:00', 'America/New_York')?.toISOString(), '2026-12-01T15:00:00.000Z');
  assert.equal(zonedLocalToUtc('2026-12-01T10:00', 'UTC')?.toISOString(), '2026-12-01T10:00:00.000Z');
  assert.equal(zonedLocalToUtc('2026-12-01T10:00:30', 'Asia/Kolkata')?.toISOString(), '2026-12-01T04:30:30.000Z');
});

test('несъществуващ час при смяна към лятно време се мести напред', () => {
  // 29.03.2026 в София: 03:00 → 04:00; 03:30 не съществува → 04:30 местно = 01:30Z
  assert.equal(zonedLocalToUtc('2026-03-29T03:30', 'Europe/Sofia')?.toISOString(), '2026-03-29T01:30:00.000Z');
});

test('невалидна зона → UTC; невалиден вход → null', () => {
  assert.equal(zonedLocalToUtc('2026-12-01T10:00', 'Mars/Olympus')?.toISOString(), '2026-12-01T10:00:00.000Z');
  assert.equal(zonedLocalToUtc('2026-12-01T10:00', '')?.toISOString(), '2026-12-01T10:00:00.000Z');
  assert.equal(zonedLocalToUtc('', 'Europe/Sofia'), null);
  assert.equal(zonedLocalToUtc('утре', 'Europe/Sofia'), null);
  assert.equal(zonedLocalToUtc('2026-13-40T99:00', 'Europe/Sofia'), null);
});
