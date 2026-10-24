import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_KEY, RedisLiveSource, parseLive } from '../src/live.js';

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

test('ключът е от договора', () => {
  assert.equal(LIVE_KEY, 'cs2dm:live');
});

test('валидният запис дава хора, ботове, режим и карта', () => {
  assert.deepEqual(parseLive(payload(), NOW), {
    known: true,
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
    get: async () => Promise.reject(new Error('ECONNREFUSED')),
  });
  assert.deepEqual(await failing.get(), { known: false });
  const hanging = new RedisLiveSource({ get: () => new Promise<string | null>(() => {}) }, 50);
  assert.deepEqual(await hanging.get(), { known: false });
  const missing = new RedisLiveSource({ get: async () => null });
  assert.deepEqual(await missing.get(), { known: false });
});
