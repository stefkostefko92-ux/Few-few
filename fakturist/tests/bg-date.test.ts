import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bgDate } from '../src/time.js';

/** Датите за показ са по софийско време (прегледът от 16.11.2026: анулиране след полунощ беше вчера). */
test('момент след полунощ в София е новият ден; дата без час остава същата', () => {
  assert.equal(bgDate(new Date('2026-11-15T22:30:00Z')), '16.11.2026'); // 00:30 в София (UTC+2)
  assert.equal(bgDate(new Date('2026-07-31T21:15:00Z')), '01.08.2026'); // 00:15 лятно време (UTC+3)
  assert.equal(bgDate(new Date('2026-11-16T00:00:00Z')), '16.11.2026'); // дата на документ
  assert.equal(bgDate(new Date('2026-12-31T23:59:59Z')), '01.01.2027');
});
