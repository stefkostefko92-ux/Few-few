// The brackets along a rail: one every 2 m plus the first and the last, evenly between their places at the ends, none
// on a joint's fishplate, never more than the pitch apart save where one steps off a fishplate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FISHPLATES, KV_VERT, RAIL_LENGTH, bracketCount, bracketHeights } from '../index';

test('numero: una ogni 2 m, più la prima e l’ultima', () => {
  assert.equal(KV_VERT.bracketPitch, 2000);
  assert.equal(bracketCount(15400), 9);
  assert.equal(bracketCount(14000), 9);
  assert.equal(bracketCount(13999), 8);
  assert.equal(bracketCount(1500), 2);
  assert.equal(bracketCount(15400, 2500), 8);
});

test('posizioni: dalla prima all’ultima a passo uguale, lontano dalle piastre di giunzione', () => {
  for (const [len, type] of [[15400, 'T70-1/A'], [21350, 'T89/B'], [9800, 'T45/A'], [30000, 'T125/B']] as const) {
    const z = bracketHeights(0, len, type), keep = FISHPLATES[type].l / 2 + 90;
    assert.equal(z.length, bracketCount(len));
    assert.ok(Math.abs(z[0] - KV_VERT.bracketFirst) < keep + 1 && Math.abs(len - KV_VERT.bracketLast - z[z.length - 1]) < keep + 1, `${len}: ends`);
    for (let i = 1; i < z.length; i++) assert.ok(z[i] > z[i - 1] && z[i] - z[i - 1] <= KV_VERT.bracketPitch + keep, `${len}: ${z[i - 1]} → ${z[i]}`);
    for (let j = RAIL_LENGTH; j < len; j += RAIL_LENGTH) for (const h of z) assert.ok(Math.abs(h + 75 - j) >= keep - 1e-9, `${len}: ${h} on ${j}`);
  }
});
