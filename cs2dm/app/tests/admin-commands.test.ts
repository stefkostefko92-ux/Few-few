import './env.js';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  BRIDGE_CHANNELS,
  RedisCommandChannel,
  UNAVAILABLE,
  commandErrorKey,
} from '../src/admin/commands.js';
import { hmacHex } from '../src/admin/crypto.js';

const KEY = 'bridge-key-for-tests-only-0123456789';

/** Pub/sub в паметта: PUBLISH стига до „плъгина“ (handler), той отговаря в канала за ack. */
function bus(handler: ((message: string, ack: (json: unknown) => void) => void) | null) {
  const subscriber = new EventEmitter() as EventEmitter & {
    subscribe(channel: string): Promise<unknown>;
  };
  const subscribed: string[] = [];
  subscriber.subscribe = async (channel: string) => {
    subscribed.push(channel);
    return 1;
  };
  const published: Array<{ channel: string; message: string }> = [];
  const publisher = {
    publish: async (channel: string, message: string) => {
      published.push({ channel, message });
      if (!handler) return 0;
      queueMicrotask(() =>
        handler(message, (json) =>
          subscriber.emit('message', BRIDGE_CHANNELS.ack, JSON.stringify(json)),
        ),
      );
      return 1;
    },
  };
  return { subscriber, publisher, published, subscribed };
}

function open(message: string) {
  const envelope = JSON.parse(message) as { p: string; sig: string };
  return {
    envelope,
    payload: JSON.parse(envelope.p) as { id: string; action: string; args: unknown; actor: string },
  };
}

test('подписана команда → ack по id → резултат; абонаментът е преди PUBLISH', async () => {
  const fake = bus((message, ack) => {
    const { envelope, payload } = open(message);
    assert.equal(envelope.sig, hmacHex(KEY, envelope.p), 'подписът е върху низа p');
    ack({ id: 'чужд', ok: false, error: 'x' });
    ack({ id: payload.id, ok: true, data: { echoed: payload.args } });
  });
  const channel = new RedisCommandChannel({
    publisher: fake.publisher,
    subscriber: fake.subscriber,
    channels: BRIDGE_CHANNELS,
    key: KEY,
  });
  const result = await channel.send('kick', { steamId: '76561198000000001', reason: 'r' }, 'A');
  assert.deepEqual(result, {
    ok: true,
    data: { echoed: { steamId: '76561198000000001', reason: 'r' } },
  });
  assert.deepEqual(fake.subscribed, [BRIDGE_CHANNELS.ack]);
  assert.equal(fake.published[0]?.channel, BRIDGE_CHANNELS.cmd);
  assert.equal(open(fake.published[0]!.message).payload.actor, 'A');
  await channel.send('say', { text: 'x' }, 'A');
  assert.deepEqual(fake.subscribed, [BRIDGE_CHANNELS.ack], 'абонира се веднъж');
});

test('отказ от плъгина, мълчание (отхвърлен подпис), никой не слуша, паднал Redis', async () => {
  const refusing = bus((message, ack) =>
    ack({ id: open(message).payload.id, ok: false, error: 'not online' }),
  );
  const make = (fake: ReturnType<typeof bus>, timeoutMs = 50) =>
    new RedisCommandChannel({
      publisher: fake.publisher,
      subscriber: fake.subscriber,
      channels: BRIDGE_CHANNELS,
      key: KEY,
      timeoutMs,
    });
  assert.deepEqual(await make(refusing).send('slay', {}, 'A'), {
    ok: false,
    error: 'not online',
    data: undefined,
  });
  const silent = bus(() => {});
  assert.deepEqual(await make(silent).send('kick', {}, 'A'), { ok: false, error: 'timeout' });
  const started = Date.now();
  assert.deepEqual(await make(silent, 5000).send('kick', {}, 'A', { timeoutMs: 30 }), {
    ok: false,
    error: 'timeout',
  });
  assert.ok(Date.now() - started < 2000, 'таймаутът на командата надделява');
  const nobody = bus(null);
  assert.deepEqual(await make(nobody, 5000).send('kick', {}, 'A'), {
    ok: false,
    error: 'no-listener',
  });
  const broken = bus(null);
  broken.publisher.publish = async () => {
    throw new Error('ECONNREFUSED');
  };
  assert.deepEqual(await make(broken).send('kick', {}, 'A'), { ok: false, error: 'redis' });
});

test('ack от C# с null полета (System.Text.Json) се приема — null значи „няма“', async () => {
  const answers = [
    (id: string) => ({ id, ok: true, error: null }),
    (id: string) => ({ id, ok: false, error: 'busy', data: null }),
    (id: string) => ({ id, ok: false, error: null }),
  ];
  let next = 0;
  const fake = bus((message, ack) => ack(answers[next++]!(open(message).payload.id)));
  const channel = new RedisCommandChannel({
    publisher: fake.publisher,
    subscriber: fake.subscriber,
    channels: BRIDGE_CHANNELS,
    key: KEY,
    timeoutMs: 200,
  });
  assert.deepEqual(await channel.send('reload', {}, 'A'), { ok: true, data: undefined });
  assert.deepEqual(await channel.send('reload', {}, 'A'), {
    ok: false,
    error: 'busy',
    data: undefined,
  });
  assert.deepEqual(await channel.send('reload', {}, 'A'), {
    ok: false,
    error: 'failed',
    data: undefined,
  });
});

test('повреден или чужд ack се пренебрегва; изключен канал отказва без мрежа', async () => {
  const fake = bus((message, ack) => {
    ack('не е обект');
    ack({ id: open(message).payload.id, ok: 'yes' });
  });
  const channel = new RedisCommandChannel({
    publisher: fake.publisher,
    subscriber: fake.subscriber,
    channels: BRIDGE_CHANNELS,
    key: KEY,
    timeoutMs: 50,
  });
  fake.subscriber.emit('message', 'cs2dm:other', '{"id":"x","ok":true}');
  assert.deepEqual(await channel.send('kick', {}, 'A'), { ok: false, error: 'timeout' });
  assert.deepEqual(await UNAVAILABLE.send('kick', {}, 'A'), { ok: false, error: 'unavailable' });
});

test('грешките → ключове на речника', () => {
  assert.equal(commandErrorKey('not online'), 'notOnline');
  assert.equal(commandErrorKey('busy'), 'busy');
  assert.equal(commandErrorKey('no-listener'), 'noListener');
  assert.equal(commandErrorKey('bad args'), 'failed');
  assert.equal(commandErrorKey('нещо непознато'), 'failed');
});
