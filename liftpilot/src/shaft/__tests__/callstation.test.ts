// The landing call stations: beside every landing door on the side seen from its landing, at the distance and height
// set; drawn on the landing face of the wall in the plans and in section A-A, with dimensions that change them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KV, callStationAt, defaultInputs, layout, planDims, planEntities, sectionDims, section, type DoorLayout } from '../index';

const door = (wall: DoorLayout['wall']): DoorLayout => ({ side: 'A', wall, kind: 'T2', width: 800, height: 2000, u0: 400, u1: 1200, l0: 400, l1: 1200, frame0: 345, frame1: 1655, stack: 'high', op0: 375, op1: 1625 });

test('lato visto dal pianerottolo: a destra sulla parete davanti è verso x crescenti, sulle altre pareti secondo chi guarda', () => {
  const cs = (side: 'left' | 'right') => ({ side, offset: 150, height: 1100 });
  const hi = 1200 + KV.doorPortal + 150, lo = 400 - KV.doorPortal - 150;
  assert.equal(callStationAt(door('front'), cs('right'), KV.doorPortal).u, hi);
  assert.equal(callStationAt(door('front'), cs('left'), KV.doorPortal).u, lo);
  assert.equal(callStationAt(door('rear'), cs('right'), KV.doorPortal).u, lo);
  assert.equal(callStationAt(door('left'), cs('right'), KV.doorPortal).u, lo);
  assert.equal(callStationAt(door('right'), cs('right'), KV.doorPortal).u, hi);
  assert.equal(callStationAt(door('front'), cs('right'), KV.doorPortal).from, 1200 + KV.doorPortal);
});

test('bottoniera in pianta e in sezione, con le sue quote', () => {
  const I = { ...defaultInputs(1600, 1750), callStation: { side: 'left', offset: 200, height: 1000 } } as const, L = layout(I), f = I.vertical.main;
  const [w, , t] = KV.callPanel, d = L.doors[0], u = d.u0 - KV.doorPortal - 200;
  assert.ok(planEntities(L, 'main', f).some((e) => e.e === 'path' && e.fill === 'steel' && e.pts.some(([x, y]) => x === u - w / 2 && y === -I.wall - t)), 'pulsantiera sul pianerottolo');
  const plan = planDims(L, 'main', f, { level: 'x' }).flatMap((e) => (e.e === 'chain' ? [e.c] : []));
  assert.ok(plan.some((c) => c.edit?.[0]?.key === 'cs.offset' && Math.abs(c.pts[1] - c.pts[0]) === 200), 'distanza dal vano della porta');
  const sec = sectionDims(L, section(L), 'floor', f, null).flatMap((e) => (e.e === 'chain' ? [e.c] : []));
  assert.ok(sec.some((c) => c.edit?.[0]?.key === 'cs.height' && Math.abs(c.pts[1] - c.pts[0]) === 1000), 'altezza dei pulsanti');
});
