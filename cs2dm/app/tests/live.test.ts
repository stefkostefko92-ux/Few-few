import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  A2S_KEY,
  LIVE_KEY,
  RedisLiveSource,
  parseA2s,
  parseLive,
  parseLivePlayers,
  pickStatus,
} from '../src/live.js';

const NOW = 1_792_828_391_000;

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: NOW - 3000,
    map: 'de_dust2',
    mode: 'Only Headshot',
    maxPlayers: 20,
    players: [
      {
        steamId: '76561198000000001',
        name: 'A',
        kills: 3,
        deaths: 1,
        ping: 30,
        alive: true,
        isBot: false,
        vip: false,
        role: 'PLAYER',
      },
      {
        steamId: '0',
        name: 'BOT Ted',
        kills: 0,
        deaths: 4,
        ping: 0,
        alive: true,
        isBot: true,
        vip: false,
        role: 'PLAYER',
      },
      {
        steamId: '76561198000000002',
        name: 'B',
        kills: 1,
        deaths: 2,
        ping: 55,
        alive: false,
        isBot: false,
        vip: true,
        role: 'VIP',
      },
    ],
    ...overrides,
  });
}

test('ключовете са от договора (§5, §9)', () => {
  assert.equal(LIVE_KEY, 'cs2dm:live');
  assert.equal(A2S_KEY, 'cs2dm:a2s');
});

test('валидният запис дава хора, ботове, режим и карта', () => {
  assert.deepEqual(parseLive(payload(), NOW), {
    known: true,
    online: true,
    source: 'plugin',
    map: 'de_dust2',
    mode: 'Only Headshot',
    humans: 2,
    bots: 1,
    maxPlayers: 20,
    updatedAt: new Date(NOW - 3000),
  });
});

test('липсващ, повреден, непълен или остарял запис → статусът е неизвестен', () => {
  assert.deepEqual(parseLive(null, NOW), { known: false });
  assert.deepEqual(parseLive('', NOW), { known: false });
  assert.deepEqual(parseLive('{не е json', NOW), { known: false });
  assert.deepEqual(parseLive(payload({ map: undefined }), NOW), { known: false });
  assert.deepEqual(parseLive(payload({ maxPlayers: -1 }), NOW), { known: false });
  assert.deepEqual(parseLive(payload({ players: 'x' }), NOW), { known: false });
  assert.deepEqual(parseLive(payload({ ts: NOW - 120_000 }), NOW), { known: false });
  assert.deepEqual(parseLive(payload({ ts: NOW + 120_000 }), NOW), { known: false });
  assert.deepEqual(parseLive('x'.repeat(300_000), NOW), { known: false });
});

test('Redis грешка или бавен Redis → неизвестен, без хвърляне', async () => {
  const failing = new RedisLiveSource({
    mget: async () => Promise.reject(new Error('ECONNREFUSED')),
  });
  assert.deepEqual(await failing.get(), { known: false });
  const hanging = new RedisLiveSource({ mget: () => new Promise<(string | null)[]>(() => {}) }, 50);
  assert.deepEqual(await hanging.get(), { known: false });
  assert.deepEqual(await hanging.snapshot(), { status: { known: false }, players: null });
  const missing = new RedisLiveSource({ mget: async () => [null, null] });
  assert.deepEqual(await missing.get(), { known: false });
});

function a2s(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: NOW - 4000,
    online: true,
    name: 'CarbonStealth.eu | Dust2 DM',
    map: 'de_dust2',
    players: 5,
    bots: 2,
    maxPlayers: 20,
    ...overrides,
  });
}

test('A2S от агента: хората са players − bots, режимът е непознат', () => {
  assert.deepEqual(parseA2s(a2s(), NOW), {
    known: true,
    online: true,
    source: 'a2s',
    map: 'de_dust2',
    mode: '',
    humans: 3,
    bots: 2,
    maxPlayers: 20,
    updatedAt: new Date(NOW - 4000),
  });
  assert.deepEqual(parseA2s(a2s({ online: false, map: null }), NOW), {
    known: true,
    online: false,
    source: 'a2s',
    updatedAt: new Date(NOW - 4000),
  });
});

test('A2S: по-стар от 30 s, повреден или онлайн без карта → неизвестен', () => {
  assert.deepEqual(parseA2s(a2s({ ts: NOW - 31_000 }), NOW), { known: false });
  assert.deepEqual(parseA2s(a2s({ online: 'yes' }), NOW), { known: false });
  assert.deepEqual(parseA2s(a2s({ map: null }), NOW), { known: false });
  assert.deepEqual(parseA2s('{', NOW), { known: false });
  assert.deepEqual(parseA2s(null, NOW), { known: false });
});

test('редът: пресен плъгин → A2S → неизвестен', () => {
  const fromPlugin = pickStatus(payload(), a2s(), NOW);
  assert.ok(fromPlugin.known && fromPlugin.source === 'plugin', 'пресният плъгин печели');
  const fromA2s = pickStatus(payload({ ts: NOW - 61_000 }), a2s(), NOW);
  assert.ok(fromA2s.known && fromA2s.source === 'a2s', 'стар запис на плъгина → агентът');
  assert.deepEqual(pickStatus(null, a2s({ ts: NOW - 40_000 }), NOW), { known: false });
  assert.deepEqual(pickStatus(null, null, NOW), { known: false });
});

test('RedisLiveSource чете двата ключа с едно MGET', async () => {
  const asked: string[][] = [];
  const now = Date.now();
  const source = new RedisLiveSource({
    mget: async (...keys: string[]) => {
      asked.push(keys);
      return [null, JSON.stringify({ ts: now, online: false })];
    },
  } as never);
  const status = await source.get();
  assert.deepEqual(asked, [[LIVE_KEY, A2S_KEY]]);
  assert.equal(status.known && !status.online, true);
});

test('играчите за панела: ботът е без SteamID, повреден ред се пропуска', () => {
  const players = parseLivePlayers(
    payload({
      players: [
        {
          steamId: '76561198000000001',
          name: 'A',
          kills: 3,
          deaths: 1,
          ping: 30,
          alive: true,
          isBot: false,
          vip: false,
          role: 'PLAYER',
          level: 4,
        },
        {
          steamId: '0',
          name: 'BOT Ted',
          kills: 0,
          deaths: 4,
          ping: 0,
          alive: true,
          isBot: true,
          vip: false,
          role: 'PLAYER',
          level: null,
        },
        { steamId: '76561198000000002', name: 'B', isBot: false },
      ],
    }),
    NOW,
  );
  assert.ok(players);
  assert.equal(players.length, 2);
  assert.equal(players[0]?.steamId, '76561198000000001');
  assert.equal(players[1]?.steamId, null);
  assert.equal(parseLivePlayers(payload({ ts: NOW - 120_000 }), NOW), null);
});
