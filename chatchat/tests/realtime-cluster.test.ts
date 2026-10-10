import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MemoryBroker, RealtimeCluster } from '../src/realtime/cluster.js';
import { RealtimeHub, type StreamSink } from '../src/realtime/hub.js';

/**
 * Няколко инстанции (NFR-06/11): хъбовете през pub/sub (тук — брокер в паметта; върху Redis —
 * tests/integration/realtime-redis). authorize се вика ВЕДНЪЖ, в инстанцията-източник, за всички
 * свързани навсякъде; към другите инстанции отиват само разрешените данни по получател; потокът
 * на друг клиент не получава нищо; отнетите сесии затварят потоците във всички инстанции.
 */

interface Fake extends StreamSink {
  frames: string[];
  ended: boolean;
}

function sink(userId: string, tenantId = 't1', sessionId = `s-${userId}`): Fake {
  const s: Fake = {
    userId,
    sessionId,
    tenantId,
    frames: [],
    ended: false,
    write(chunk) {
      s.frames.push(chunk);
    },
    end() {
      s.ended = true;
    },
  };
  return s;
}

const data = (frame: string | undefined) =>
  JSON.parse(/^data: (.+)$/m.exec(frame ?? '')?.[1] ?? 'null') as Record<string, unknown>;

/** Микрозадачите на брокера (доставка) — изчакване, без таймери. */
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r));
};

async function cluster(n: number) {
  const broker = new MemoryBroker();
  const hubs: RealtimeHub[] = [];
  const clusters: RealtimeCluster[] = [];
  for (let i = 0; i < n; i += 1) {
    const hub = new RealtimeHub();
    const c = new RealtimeCluster(broker.transport(), { snapshotMs: 60_000 });
    await hub.joinCluster(c);
    hubs.push(hub);
    clusters.push(c);
  }
  await flush();
  return {
    broker,
    hubs,
    clusters,
    stop: () => Promise.all(clusters.map((c) => c.stop())),
  };
}

const event = {
  type: 'message.created' as const,
  tenantId: 't1',
  conversationId: 'c1',
  actorId: 'u0',
};

describe('RealtimeHub между инстанции', () => {
  test('събитие от A стига до потока на човека в B — само с authorize-натите за него данни', async () => {
    const { hubs, stop } = await cluster(2);
    const [a, b] = hubs as [RealtimeHub, RealtimeHub];
    const bob = sink('bob');
    const eve = sink('eve');
    b.attach(bob);
    b.attach(eve);
    await flush();
    assert.equal(a.size('bob'), 1, 'A знае, че bob е свързан другаде');
    assert.equal(a.localSize(), 0);
    let asked: readonly string[] = [];
    const written = await a.publish(event, ['bob', 'eve', 'offline'], async (ids) => {
      asked = ids;
      return new Map([['bob', { text: 'per bob' }]]);
    });
    await flush();
    assert.deepEqual(
      [...asked].sort(),
      ['bob', 'eve'],
      'authorize вижда свързаните навсякъде, не офлайн',
    );
    assert.equal(written, 1);
    assert.equal(bob.frames.length, 1);
    assert.deepEqual(data(bob.frames[0]).data, { text: 'per bob' });
    assert.equal(eve.frames.length, 0, 'eve не е разрешена — нищо');
    await stop();
  });

  test('поток на друг клиент в B не получава събитието, каквото и да дойде по канала', async () => {
    const { hubs, stop } = await cluster(2);
    const [a, b] = hubs as [RealtimeHub, RealtimeHub];
    const foreign = sink('bob', 't2');
    b.attach(foreign);
    await flush();
    await a.publish(event, ['bob'], async () => new Map([['bob', { x: 1 }]]));
    await flush();
    assert.equal(foreign.frames.length, 0);
    await stop();
  });

  test('отнета сесия в A затваря потоците на човека в B (и само неговите)', async () => {
    const { hubs, stop } = await cluster(2);
    const [a, b] = hubs as [RealtimeHub, RealtimeHub];
    const bob = sink('bob');
    const ann = sink('ann');
    b.attach(bob);
    b.attach(ann);
    a.revoke({ userIds: ['bob'] });
    await flush();
    assert.equal(bob.ended, true);
    assert.equal(ann.ended, false);
    const session = sink('ann', 't1', 's-other');
    b.attach(session);
    a.revoke({ sessionId: 's-other', userIds: ['ann'] });
    await flush();
    assert.deepEqual(
      [session.ended, ann.ended],
      [true, false],
      'изход от едно устройство — само то',
    );
    await stop();
  });

  test('затворен поток в B → A вече не го брои; нова инстанция научава свързаните от снимка', async () => {
    const { broker, hubs, clusters, stop } = await cluster(2);
    const [a, b] = hubs as [RealtimeHub, RealtimeHub];
    const detach = b.attach(sink('bob'));
    await flush();
    assert.equal(a.size('bob'), 1);
    detach();
    await flush();
    assert.equal(a.size('bob'), 0);
    b.attach(sink('carl'));
    // Трета инстанция се включва по-късно: „hello“ → другите пращат снимка на свързаните.
    const late = new RealtimeHub();
    const c = new RealtimeCluster(broker.transport(), { snapshotMs: 60_000 });
    clusters.push(c);
    await late.joinCluster(c);
    await flush();
    assert.equal(late.size('carl'), 1);
    assert.equal(late.size('bob'), 0);
    // Спряна инстанция („bye“) — хората ѝ вече не са свързани.
    await clusters[1]?.stop();
    await flush();
    assert.equal(late.size('carl'), 0);
    await stop();
  });

  test('невалидно съобщение по канала се игнорира', async () => {
    const broker = new MemoryBroker();
    const seen: string[] = [];
    const hub = new RealtimeHub();
    const c = new RealtimeCluster(broker.transport(), {
      onMessage: (dir, kind) => seen.push(`${dir}:${kind}`),
    });
    await hub.joinCluster(c);
    const raw = broker.transport();
    await raw.publish('{"v":1,"t":"event","i":"x"}');
    await raw.publish('не е json');
    await flush();
    assert.ok(seen.filter((s) => s === 'in:invalid').length >= 2);
    await c.stop();
  });
});
