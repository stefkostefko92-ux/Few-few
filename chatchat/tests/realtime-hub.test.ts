import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RealtimeHub, SCHEMA_VERSION, sseFrame, type StreamSink } from '../src/realtime/hub.js';

/**
 * Хъбът за реално време (§13.3): получава само разрешеното от authorize В МОМЕНТА на
 * изпращане, монотонни `id:`, редът на публикуване се пази, изход/отнета сесия затваря потока.
 */

interface Fake extends StreamSink {
  frames: string[];
  ended: boolean;
}

function sink(userId: string, sessionId = `s-${userId}`, tenantId = 't1'): Fake {
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

const parse = (frame: string) => {
  const id = Number(/^id: (\d+)$/m.exec(frame)?.[1]);
  const event = /^event: (.+)$/m.exec(frame)?.[1];
  const data = JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] ?? 'null') as Record<string, unknown>;
  return { id, event, data };
};

const event = {
  type: 'message.created' as const,
  tenantId: 't1',
  conversationId: 'c1',
  actorId: 'u1',
};
const allow = (data: Record<string, unknown>) => async (ids: readonly string[]) =>
  new Map(ids.map((id) => [id, data]));

describe('RealtimeHub', () => {
  test('получава само този, когото authorize пусне — с неговите данни', async () => {
    const hub = new RealtimeHub();
    const a = sink('a');
    const b = sink('b');
    hub.attach(a);
    hub.attach(b);
    const written = await hub.publish(event, ['a', 'b'], async () => new Map([['a', { x: 1 }]]));
    assert.equal(written, 1);
    assert.equal(b.frames.length, 0);
    const { event: type, data } = parse(a.frames[0] ?? '');
    assert.equal(type, 'message.created');
    assert.equal(data.schema_version, SCHEMA_VERSION);
    assert.equal(data.tenant_id, 't1');
    assert.equal(data.conversation_id, 'c1');
    assert.equal(data.actor_id, 'u1');
    assert.equal(typeof data.timestamp, 'string');
    assert.deepEqual(data.data, { x: 1 });
  });

  test('authorize вижда само свързаните; офлайн получатели не струват заявка', async () => {
    const hub = new RealtimeHub();
    hub.attach(sink('a'));
    const seen: string[][] = [];
    await hub.publish(event, ['a', 'offline'], async (ids) => {
      seen.push([...ids]);
      return new Map();
    });
    assert.deepEqual(seen, [['a']]);
    const none = new RealtimeHub();
    let called = false;
    await none.publish(event, ['a'], async () => {
      called = true;
      return new Map();
    });
    assert.equal(called, false);
  });

  test('authorize не може да добави несвързан или чужд получател; поток на друг клиент — нищо', async () => {
    const hub = new RealtimeHub();
    const foreign = sink('f', 's-f', 't2');
    hub.attach(foreign);
    const a = sink('a');
    hub.attach(a);
    await hub.publish(event, ['a', 'f'], allow({ secret: true }));
    assert.equal(foreign.frames.length, 0);
    assert.equal(a.frames.length, 1);
    await hub.publish(event, ['a'], async () => new Map([['zzz', { leak: true }]]));
    assert.equal(a.frames.length, 1);
  });

  test('id е монотонен и редът е на публикуването, дори authorize да отговори в друг ред', async () => {
    const hub = new RealtimeHub();
    const a = sink('a');
    hub.attach(a);
    const slow = hub.publish(event, ['a'], async (ids) => {
      await new Promise((r) => setTimeout(r, 30));
      return new Map(ids.map((id) => [id, { n: 1 }]));
    });
    const fast = hub.publish(event, ['a'], allow({ n: 2 }));
    await Promise.all([slow, fast]);
    const parsed = a.frames.map(parse);
    assert.deepEqual(
      parsed.map((p) => (p.data.data as { n: number }).n),
      [1, 2],
    );
    assert.ok((parsed[0]?.id ?? 0) < (parsed[1]?.id ?? 0));
  });

  test('грешка в authorize не спира опашката', async () => {
    const hub = new RealtimeHub();
    const a = sink('a');
    hub.attach(a);
    await assert.rejects(
      hub.publish(event, ['a'], async () => {
        throw new Error('db');
      }),
    );
    assert.equal(await hub.publish(event, ['a'], allow({ ok: true })), 1);
  });

  test('disconnectUser/disconnectSession затварят само своите потоци', () => {
    const hub = new RealtimeHub();
    const a1 = sink('a', 's1');
    const a2 = sink('a', 's2');
    const b = sink('b', 's3');
    [a1, a2, b].forEach((s) => hub.attach(s));
    assert.equal(hub.disconnectSession('s1'), 1);
    assert.equal(a1.ended, true);
    assert.equal(a2.ended, false);
    assert.equal(hub.disconnectUser('a'), 1);
    assert.equal(a2.ended, true);
    assert.equal(b.ended, false);
    assert.equal(hub.size('a'), 0);
    assert.equal(hub.size(), 1);
    hub.closeAll();
    assert.equal(b.ended, true);
    assert.equal(hub.size(), 0);
  });

  test('таван на потоците на човек — най-старият се затваря', () => {
    const hub = new RealtimeHub({ maxStreamsPerUser: 2 });
    const s = [sink('a', 'x1'), sink('a', 'x2'), sink('a', 'x3')];
    s.forEach((x) => hub.attach(x));
    assert.deepEqual(
      s.map((x) => x.ended),
      [true, false, false],
    );
    assert.equal(hub.size('a'), 2);
  });

  test('рамката е валиден text/event-stream: нов ред в данните не чупи формата', () => {
    const frame = sseFrame(7, 'message.created', { body: 'a\nb\n\nid: 99' });
    assert.equal(frame.split('\n\n').length, 2);
    assert.equal(parse(frame).id, 7);
    assert.deepEqual(parse(frame).data, { body: 'a\nb\n\nid: 99' });
  });
});
