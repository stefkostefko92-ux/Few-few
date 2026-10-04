// Panev's articles chosen for a design: the counterweight rail's bracket by default (SU or SD, an SC on the wall
// behind the foot near a corner), by hand (where it takes the rail, else the check fails), a solution to the site's
// drawing (the check asks for the drawing); the landing doors' pair, the plate cut to the sill, the pairs over the door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOOR_PAIRS, SC_SUPPORTS, bracketsAlong, cwBracket, defaultInputs, doorPair, doorPairOf, landingOf, layout, planEntities, plateReach, topBracketSpan, topBracketsAt,
  type ShaftInputs,
} from '../index';
import { scPlace } from '../staffe-sc';

const base = defaultInputs(1600, 1750);
const staffa = (I: ShaftInputs) => layout(I).checks.find((c) => c.id === 'v_staffa');
const codes = (I: ShaftInputs) => planEntities(layout(I), 'main', I.vertical.main).flatMap((e) => (e.e === 'text' && /SG|BRACCIO/.test(e.text) ? [e.text.replace(/^\d+× /, '')] : []));
const corner = (pos: number): ShaftInputs => ({ ...base, cw: 'left', plan: { cwPos: pos } });

test('angolo: la guida vicina alla parete dietro il piede prende un SC, l’altra resta su SU', () => {
  assert.equal(staffa(corner(700))?.status, 'ok');
  assert.deepEqual(codes(corner(700)), ['SU 220 160 + SG 80 150', 'SC 60 200 + SG 60 190']);
  assert.deepEqual(codes(corner(725)), ['SU 220 160 + SG 80 150', 'SC 50 200 + SG 50 190']);
  // the foot 25 mm from the rear wall: no SC reaches that close
  assert.equal(staffa(corner(760))?.status, 'fail');
  const L = layout(corner(700)), r = L.rails.filter((x) => x.kind === 'cw')[1], b = cwBracket(L.inputs, L.doors, r);
  assert.ok(b && b.kind === 'slide');
  assert.equal(b.wall, 'rear');
  assert.equal(b.gap, 85);
  // the SC on the wall, the rail's axis within its printed range from one of its ends, the SG on the wall too
  const { s, a } = b.place, { L: len, range } = b.sc;
  assert.ok(s >= 0 && s + len <= 1600);
  assert.ok(Math.max(b.u - s, s + len - b.u) <= range[1]);
  assert.ok(a >= 0 && a >= s - 10 && a + b.sc.sg.l <= s + len + 70);
});

test('SC: fuori dal campo della flangia o senza posto lungo la parete, nessuna', () => {
  const sc = SC_SUPPORTS[0];
  assert.equal(scPlace(sc, 150, 51, 0, 1600, 22.5), null);
  assert.equal(scPlace(sc, 150, 71, 0, 1600, 22.5), null);
  assert.ok(scPlace(sc, 150, 60, 0, 1600, 22.5));
  // the wall free for 180 mm round the rail's axis (door frames): no room for 200 mm of SC
  assert.equal(scPlace(sc, 150, 60, 60, 240, 22.5), null);
});

test('scelta a mano: l’articolo dove prende la guida, altrimenti «Non conforme»', () => {
  assert.deepEqual(codes({ ...base, panev: { cw: 'SD 150 180' } }), ['SD 150 180 + SG 80 170']);
  assert.equal(staffa({ ...base, panev: { cw: 'SD 150 180' } })?.status, 'ok');
  // an SC where the rails' feet stand far from any wall behind them
  assert.equal(staffa({ ...base, panev: { cw: 'SC 50 200' } })?.status, 'fail');
  assert.deepEqual(codes({ ...base, panev: { cw: 'SC 50 200' } }), []);
  // a longer support than needed takes the rail too: its range (45-215 mm) holds the 150 mm
  assert.equal(staffa({ ...base, panev: { cw: 'SU 220 200' } })?.status, 'ok');
});

test('soluzione su disegno: staffa generica con il codice, verifica «da verificare»', () => {
  const I: ShaftInputs = { ...base, panev: { cw: 'SN 60 65 + SN 65 200 + BRACCIO 160 190' } };
  assert.equal(staffa(I)?.status, 'warn');
  assert.equal(staffa(I)?.value, null);
  assert.deepEqual(codes(I), ['SN + BRACCIO 160 190']);
  assert.deepEqual(codes({ ...base, panev: { cw: 'SC 50 170 + SG 225 50' } }), ['SC 50 170 + SG 225 50']);
});

test('porte di piano: coppie della stessa sezione, la piastra tagliata alla soglia', () => {
  assert.equal(DOOR_PAIRS.length, 10);
  for (const id of DOOR_PAIRS) {
    const p = doorPair(id);
    assert.equal(id, `${p.a.code} + ${p.b.code}`);
    assert.equal(p.b.code.split(' ')[1], String(p.a.section));
  }
  assert.equal(doorPairOf(base).id, 'A 65 170 7 + B 65 320');
  assert.equal(doorPairOf({ ...base, panev: { door: 'A 37 170 2 + B 37 220' } }).b.length, 220);
  // the default sill (80 mm): A 65 cut to 73 mm; a 300 mm sill is deeper than any plate
  assert.deepEqual(plateReach(doorPair('A 65 170 7 + B 65 320').a, 80), { offset: 3.5, cut: 73, short: false });
  assert.equal(plateReach(doorPair('A 45 175 2 + B 45 320').a, 300).short, true);
});

test('porte di piano: coppie sopra la porta lungo la sospensione, accanto a quelle della soglia del piano sopra se vicine', () => {
  const L = layout(base), d = landingOf(L.doors[0]), len = d.wall === 'front' || d.wall === 'rear' ? base.W : base.D, pair = doorPairOf(base);
  const [u0, u1] = topBracketSpan(d, len), plain = topBracketsAt(pair, d, len, 0);
  assert.deepEqual(plain, bracketsAlong(u0, u1));
  assert.ok(plain.length >= 3 && u1 - u0 > d.u1 - d.u0, 'la sospensione è più lunga della luce');
  // the floor above far enough (B 320 over a 2000 mm door: 2000 + 230 + 333 + 357 = 2920 mm): the plain rule
  assert.deepEqual(topBracketsAt(pair, d, len, 0, 2920), plain);
  // nearer: no pair over the door falls on one under the sill above, each stays within the suspension, as many
  const below = bracketsAlong(d.u0 + 10, d.u1 - 10), near = topBracketsAt(pair, d, len, 0, 2700);
  assert.equal(near.length, plain.length);
  assert.notDeepEqual(near, plain);
  for (const u of near) {
    assert.ok(u >= u0 && u <= u1);
    for (const b of below) assert.ok(Math.abs(u - b) >= 75, `${u} accanto a ${b}`);
  }
});
