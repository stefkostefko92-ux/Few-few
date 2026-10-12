import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { RedisTotpReplayGuard } from '../../src/auth/mfa.js';
import { RedisRateLimitStore } from '../../src/auth/rate-limit.js';
import { RealtimeCluster } from '../../src/realtime/cluster.js';
import { RealtimeHub, type StreamSink } from '../../src/realtime/hub.js';
import { RedisTransport } from '../../src/realtime/redis-transport.js';
import { db, PASSWORD, startApp, type Harness } from './helpers.js';
import {
  eventually,
  open,
  openStream,
  resetCollab,
  say,
  seedCollab,
  type CollabWorld,
  type SseEvent,
  type Stream,
} from './collab-world.js';
import { startRedis, type TestRedis } from './redis.js';

/**
 * Няколко инстанции на API-то върху ИСТИНСКИ Redis (NFR-06/11): хъбовете си говорят през pub/sub
 * (събитие от A стига до потока в B — само authorize-натото; отнета сесия в A затваря потока в B),
 * лимитите на заявките са общи (вход по IP: опитите в A и B се събират), пазачът срещу повторен
 * TOTP код е общ (същият код не минава и в другата инстанция).
 */

let redis: TestRedis;
before(async () => {
  redis = await startRedis();
});
after(async () => {
  await redis.stop();
  await db.$disconnect();
});

const channel = () => `${redis.prefix}:rt:${Math.random().toString(36).slice(2, 8)}`;

async function joinedHub(
  ch: string,
  heartbeatMs = 25_000,
): Promise<{ hub: RealtimeHub; cluster: RealtimeCluster }> {
  const hub = new RealtimeHub({ heartbeatMs });
  const cluster = new RealtimeCluster(
    new RedisTransport(redis.client('pub'), redis.client('sub', true), ch),
    { snapshotMs: heartbeatMs },
  );
  await hub.joinCluster(cluster);
  return { hub, cluster };
}

interface Fake extends StreamSink {
  frames: string[];
  ended: boolean;
}
const sink = (userId: string, tenantId = 't1'): Fake => {
  const s: Fake = {
    userId,
    sessionId: `s-${userId}`,
    tenantId,
    frames: [],
    ended: false,
    write: (chunk) => void s.frames.push(chunk),
    end: () => {
      s.ended = true;
    },
  };
  return s;
};

describe('хъбовете през Redis pub/sub', () => {
  test('събитие от A → потокът в B (само разрешеното); друг клиент — нищо; отнемане в A затваря в B', async () => {
    const ch = channel();
    const a = await joinedHub(ch);
    const b = await joinedHub(ch);
    const bob = sink('bob');
    const eve = sink('eve');
    const foreign = sink('bob', 't2');
    b.hub.attach(bob);
    b.hub.attach(eve);
    b.hub.attach(foreign);
    await eventually(() => a.hub.size('bob') === 1 && a.hub.size('eve') === 1);
    let asked: readonly string[] = [];
    await a.hub.publish(
      { type: 'message.created', tenantId: 't1', conversationId: 'c1', actorId: 'ann' },
      ['bob', 'eve'],
      async (ids) => {
        asked = ids;
        return new Map([['bob', { body: 'per bob' }]]);
      },
    );
    await eventually(() => bob.frames.length === 1);
    assert.deepEqual([...asked].sort(), ['bob', 'eve']);
    assert.match(bob.frames[0] ?? '', /"body":"per bob"/);
    assert.equal(eve.frames.length, 0);
    assert.equal(foreign.frames.length, 0);
    a.hub.revoke({ userIds: ['bob'] });
    await eventually(() => bob.ended);
    assert.equal(eve.ended, false);
    await a.cluster.stop();
    await b.cluster.stop();
  });
});

describe('две инстанции на приложението', () => {
  let ha: Harness;
  let hb: Harness;
  let w: CollabWorld;
  const streams: Stream[] = [];
  let clusters: RealtimeCluster[] = [];

  before(async () => {
    const ch = channel();
    const a = await joinedHub(ch, 150);
    const b = await joinedHub(ch, 150);
    clusters = [a.cluster, b.cluster];
    const shared = {
      diagnose: 'none' as const,
      rateLimitStore: (name: string) =>
        new RedisRateLimitStore(redis.client('rl'), `${redis.prefix}-${name}`),
    };
    ha = await startApp({ ...shared, hub: a.hub });
    hb = await startApp({ ...shared, hub: b.hub });
  });
  after(async () => {
    streams.splice(0).forEach((s) => s.close());
    await Promise.all(clusters.map((c) => c.stop()));
    await ha.close();
    await hb.close();
  });
  beforeEach(async () => {
    streams.splice(0).forEach((s) => s.close());
    await resetCollab();
    w = await seedCollab(ha);
  });

  test('съобщение, изпратено през A, стига до SSE потока на члена в B; нечленът в B — нищо', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'GROUP', userIds: [users.engineering.id] });
    const barrier = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.internal.id],
    });
    const sEng = await openStream(c.engineering.withBase(hb.base));
    const sInt = await openStream(c.internal.withBase(hb.base));
    streams.push(sEng, sInt);
    await eventually(
      () => ha.hub.size(users.engineering.id) === 1 && ha.hub.size(users.internal.id) === 1,
    );
    const created = (body: string) => (e: SseEvent) =>
      e.event === 'message.created' && e.data.data.message.body === body;
    await say(c.support, id, 'solo per il gruppo');
    const got = await sEng.waitFor(created('solo per il gruppo'));
    assert.equal(got.data.tenant_id, w.tenantA.id);
    await say(c.support, barrier, 'barriera');
    await sInt.waitFor(created('barriera'));
    assert.equal(sInt.events.some(created('solo per il gruppo')), false, 'нечленът не получава');
  });

  test('общ лимит на входа по IP: опитите в A и B се събират (10 за 15 мин.)', async () => {
    const body = { email: w.users.support.email, password: `${PASSWORD}-грешна` };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const base = i % 2 === 0 ? ha.base : hb.base;
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://chatchat.test' },
        body: JSON.stringify(body),
      });
      statuses.push(res.status);
    }
    assert.equal(statuses.slice(0, 10).includes(429), false, JSON.stringify(statuses));
    assert.equal(statuses[10], 429, 'единадесетият опит — в която и да е инстанция — е отказан');
  });
});

describe('общи лимити и TOTP в Redis', () => {
  test('RedisRateLimitStore: два екземпляра с едно име броят заедно; ключът е хеш (без IP в Redis)', async () => {
    const name = `${redis.prefix}-rl-unit`;
    const a = new RedisRateLimitStore(redis.client(), name);
    const b = new RedisRateLimitStore(redis.client(), name);
    const opts = { windowMs: 60_000 } as Parameters<typeof a.init>[0];
    a.init(opts);
    b.init(opts);
    assert.equal((await a.increment('10.0.0.1')).totalHits, 1);
    const second = await b.increment('10.0.0.1');
    assert.equal(second.totalHits, 2);
    assert.ok((second.resetTime?.getTime() ?? 0) > Date.now());
    await a.decrement('10.0.0.1');
    assert.equal((await b.get('10.0.0.1'))?.totalHits, 1);
    await b.resetKey('10.0.0.1');
    assert.equal(await a.get('10.0.0.1'), undefined);
    const keys = await redis.client().keys(`chatchat:rl:${name}:*`);
    assert.equal(
      keys.some((k) => k.includes('10.0.0.1')),
      false,
    );
  });

  test('RedisRateLimitStore: Redis недостъпен → броячът в паметта (не отказ)', async () => {
    const dead = new RedisRateLimitStore(
      redis.client('dead').on('ready', function (this: { disconnect(): void }) {
        this.disconnect();
      }),
      'x',
    );
    dead.init({ windowMs: 60_000 } as Parameters<typeof dead.init>[0]);
    // Изключена връзка → резервният брояч в паметта.
    const res = await dead.increment('k');
    assert.equal(res.totalHits >= 1, true);
  });

  test('TOTP: стъпка, приета в една инстанция, не минава в друга; паралелни опити — един', async () => {
    const a = new RedisTotpReplayGuard(redis.client());
    const b = new RedisTotpReplayGuard(redis.client());
    const user = `${redis.prefix}-u1`;
    assert.equal(await a.accept(user, 1000), true);
    assert.equal(await b.accept(user, 1000), false);
    assert.equal(await b.lastStep(user), 1000);
    assert.equal(await b.accept(user, 1001), true);
    const race = `${redis.prefix}-u2`;
    const results = await Promise.all([a.accept(race, 5), b.accept(race, 5), a.accept(race, 5)]);
    assert.deepEqual(results.filter(Boolean).length, 1);
    a.forget(user);
    await eventually(async () => (await b.lastStep(user)) === null);
  });
});
