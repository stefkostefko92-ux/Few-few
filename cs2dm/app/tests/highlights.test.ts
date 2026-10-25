import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MULTI_KILL_GAP_MS,
  collections,
  formatOffset,
  killMeters,
  longestKill,
  multiKills,
  type KillEvent,
} from '../src/highlights.js';

const START = new Date('2026-10-25T18:00:00Z');
const A = '76561190000987001';
const B = '76561190000987002';
const C = '76561190000987003';

function kill(
  sec: number,
  attacker: string | null,
  victim: string,
  extra: Partial<KillEvent> = {},
) {
  return {
    at: new Date(START.getTime() + sec * 1000),
    attackerId: attacker,
    victimId: victim,
    weapon: 'ak47',
    headshot: false,
    wallbang: false,
    noscope: false,
    throughSmoke: false,
    attackerBlind: false,
    ax: 0,
    ay: 0,
    az: 0,
    vx: 100,
    vy: 0,
    vz: 0,
    ...extra,
  } satisfies KillEvent;
}

test('серия: до 10 s между убийствата → 3K; пауза над 10 s я затваря', () => {
  assert.equal(MULTI_KILL_GAP_MS, 10_000);
  const events = [
    kill(60, A, B),
    kill(65, A, C),
    kill(75, A, B, { weapon: 'deagle' }), // точно 10 s — още е серия
    kill(86, A, C), // 11 s — нова серия от 1
  ];
  assert.deepEqual(multiKills(events, START), [
    { steamId: A, kills: 3, offsetMs: 60_000, weapons: ['ak47', 'deagle'] },
  ]);
});

test('серия: смъртта на стрелеца я прекъсва; самоубийството не е убийство', () => {
  const events = [
    kill(10, A, B),
    kill(12, A, C),
    kill(13, B, A), // A умира — серията от 2 не се брои
    kill(15, A, B),
    kill(16, A, C),
    kill(17, A, A), // самоубийство: не добавя, но затваря
  ];
  assert.deepEqual(multiKills(events, START), []);
});

test('серия: 5K и 3K, по-дългите първи, редът на входа не е важен', () => {
  const five = [1, 2, 3, 4, 5].map((s, i) => kill(100 + s, A, i % 2 ? B : C));
  const three = [1, 2, 3].map((s) => kill(20 + s, B, C));
  const out = multiKills([...five, ...three].reverse(), START);
  assert.deepEqual(
    out.map((m) => [m.steamId, m.kills]),
    [
      [A, 5],
      [B, 3],
    ],
  );
  assert.equal(out[1]!.offsetMs, 21_000);
});

test('колекцията: брой по вид и кой най-често; равенство → по-ранният', () => {
  const events = [
    kill(5, B, A, { noscope: true }),
    kill(6, A, B, { noscope: true }),
    kill(7, A, C, { wallbang: true, throughSmoke: true }),
    kill(8, C, A, { throughSmoke: true }),
    kill(9, C, B, { throughSmoke: true }),
  ];
  assert.deepEqual(collections(events), [
    { kind: 'noscope', count: 2, leader: B, leaderCount: 1 },
    { kind: 'wallbang', count: 1, leader: A, leaderCount: 1 },
    { kind: 'smoke', count: 3, leader: C, leaderCount: 2 },
  ]);
  assert.deepEqual(collections([]), []);
});

test('разстояние: от позициите, 1 единица = 2,54 cm; най-далечното убийство', () => {
  assert.equal(killMeters({ ax: 0, ay: 0, az: 0, vx: 300, vy: 400, vz: 0 }), 500 * 0.0254);
  const events = [
    kill(30, A, B, { vx: 1000 }),
    kill(40, B, C, { vx: 2000, weapon: 'awp' }),
    kill(50, C, A, { vx: 2000 }),
  ];
  assert.deepEqual(longestKill(events, START), {
    steamId: B,
    weapon: 'awp',
    meters: 2000 * 0.0254,
    offsetMs: 40_000,
  });
  assert.equal(longestKill([], START), null);
});

test('отместването от началото: м:сс, над час — ч:мм:сс', () => {
  assert.equal(formatOffset(0), '0:00');
  assert.equal(formatOffset(425_000), '7:05');
  assert.equal(formatOffset(751_999), '12:31');
  assert.equal(formatOffset(3_723_000), '1:02:03');
  assert.equal(formatOffset(-5), '0:00');
});
