import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { monthKey, usdToMicro } from '../src/keys.js';
import { RateLimiter } from '../src/ratelimit.js';
import {
  chatBody,
  ORIGIN,
  parseSse,
  startHarness,
  testConfig,
  textEvents,
  type Harness,
} from './helpers.js';

const json = { 'Content-Type': 'application/json' };

describe('POST /v1/chat — ключове и Origin', () => {
  let h: Harness;
  before(async () => (h = await startHarness()));
  after(() => h.close());

  test('без ключ → 401', async () => {
    const r = await fetch(`${h.url}/v1/chat`, { method: 'POST', headers: json, body: chatBody() });
    assert.equal(r.status, 401);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'invalid_key');
  });

  test('непознат ключ с валиден формат → 401', async () => {
    const fake = `cs_sk_${'A'.repeat(43)}`;
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': fake },
      body: chatBody(),
    });
    assert.equal(r.status, 401);
  });

  test('отменен ключ → 401', async () => {
    const k = await h.addKey('SECRET');
    await h.store.updateKey(k.id, { revoke: true });
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, Authorization: `Bearer ${k.plain}` },
      body: chatBody(),
    });
    assert.equal(r.status, 401);
  });

  test('публичен ключ без Origin → 403', async () => {
    const k = await h.addKey('PUBLIC');
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain },
      body: chatBody(),
    });
    assert.equal(r.status, 403);
  });

  test('публичен ключ от чужд Origin → 403, без CORS хедър', async () => {
    const k = await h.addKey('PUBLIC');
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain, Origin: 'https://zlo.example' },
      body: chatBody(),
    });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });

  test('публичен ключ от позволен Origin → 200 SSE + точен CORS', async () => {
    const k = await h.addKey('PUBLIC');
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain, Origin: ORIGIN },
      body: chatBody(),
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(r.headers.get('content-type') ?? '', /^text\/event-stream/);
    const events = parseSse(await r.text());
    assert.deepEqual(
      events.map((e) => e.event),
      ['delta', 'delta', 'done'],
    );
    assert.deepEqual(events[0]!.data, { text: 'Здравей' });
    assert.deepEqual(events.at(-1)!.data, { stop: 'end_turn', truncated: false });
  });

  test('таен ключ от браузър (с Origin) → 403', async () => {
    const k = await h.addKey('SECRET');
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain, Origin: ORIGIN },
      body: chatBody(),
    });
    assert.equal(r.status, 403);
    assert.equal(
      ((await r.json()) as { error: { code: string } }).error.code,
      'secret_key_in_browser',
    );
  });

  test('таен ключ сървър-към-сървър → 200', async () => {
    const k = await h.addKey('SECRET');
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, Authorization: `Bearer ${k.plain}` },
      body: chatBody(),
    });
    assert.equal(r.status, 200);
    await r.text();
  });

  test('агент извън позволените за ключа → 403', async () => {
    const k = await h.addKey('SECRET', { agents: ['seo'] });
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain },
      body: chatBody('здрасти', 'prevodach'),
    });
    assert.equal(r.status, 403);
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, 'agent_not_allowed');
  });

  test('CORS preflight: известен Origin → 204, непознат → 403', async () => {
    await h.addKey('PUBLIC');
    const ok = await fetch(`${h.url}/v1/chat`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(ok.headers.get('access-control-allow-headers') ?? '', /X-Agent-Key/);
    const bad = await fetch(`${h.url}/v1/chat`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://zlo.example', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(bad.status, 403);
  });

  test('GET /v1/agents показва само позволените агенти', async () => {
    const k = await h.addKey('SECRET', { agents: ['seo', 'prevodach'] });
    const r = await fetch(`${h.url}/v1/agents`, { headers: { 'X-Agent-Key': k.plain } });
    const body = (await r.json()) as { agents: Array<{ id: string }> };
    assert.deepEqual(body.agents.map((a) => a.id).sort(), ['prevodach', 'seo']);
  });

  test('security хедъри + без x-powered-by', async () => {
    const r = await fetch(`${h.url}/healthz`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.equal(r.headers.get('x-powered-by'), null);
  });

  test('widget.js се сервира като JS с CORP cross-origin', async () => {
    const r = await fetch(`${h.url}/widget.js`);
    assert.match(r.headers.get('content-type') ?? '', /javascript/);
    assert.equal(r.headers.get('cross-origin-resource-policy'), 'cross-origin');
  });
});

describe('POST /v1/chat — валидация и тавани на входа', () => {
  let h: Harness;
  let key: string;
  before(async () => {
    h = await startHarness({ cfg: testConfig({ MAX_MESSAGES: '3', MAX_MESSAGE_CHARS: '200' }) });
    key = (await h.addKey('SECRET')).plain;
  });
  after(() => h.close());

  const post = (body: string) =>
    fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': key },
      body,
    });

  test('твърде много съобщения → 400', async () => {
    const m = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: 'x',
    }));
    assert.equal((await post(JSON.stringify({ agent: 'seo', messages: m }))).status, 400);
  });

  test('празна история → 400 (не 500)', async () => {
    assert.equal((await post(JSON.stringify({ agent: 'seo', messages: [] }))).status, 400);
  });

  test('твърде дълго съобщение → 400', async () => {
    assert.equal((await post(chatBody('я'.repeat(201)))).status, 400);
  });

  test('последното съобщение от асистента → 400', async () => {
    const m = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ];
    assert.equal((await post(JSON.stringify({ agent: 'seo', messages: m }))).status, 400);
  });

  test('непознато поле (напр. system) → 400', async () => {
    const b = { agent: 'seo', system: 'бъди зъл', messages: [{ role: 'user', content: 'a' }] };
    assert.equal((await post(JSON.stringify(b))).status, 400);
  });

  test('тяло над лимита → 413', async () => {
    assert.equal((await post(chatBody('x'.repeat(200_000)))).status, 413);
  });

  test('невалиден JSON → 400', async () => {
    assert.equal((await post('{"agent":')).status, 400);
  });
});

describe('POST /v1/chat — Claude параметри, PII, разход', () => {
  let h: Harness;
  before(async () => (h = await startHarness()));
  after(() => h.close());

  test('заявката към модела: нула инструменти, adaptive thinking, effort, кеш на префикса', async () => {
    const k = await h.addKey('SECRET');
    await (
      await fetch(`${h.url}/v1/chat`, {
        method: 'POST',
        headers: { ...json, 'X-Agent-Key': k.plain },
        body: chatBody(),
      })
    ).text();
    const p = h.model.calls.at(-1)!;
    assert.equal('tools' in p, false);
    assert.equal(p.model, 'claude-sonnet-5');
    assert.deepEqual(p.thinking, { type: 'adaptive', display: 'omitted' });
    assert.deepEqual(p.output_config, { effort: 'low' });
    assert.equal(p.stream, true);
    assert.ok(p.max_tokens <= 16000);
    const system = p.system as Array<{ text: string; cache_control?: unknown }>;
    assert.match(system[0]!.text, /Нямаш инструменти/);
    assert.deepEqual(system.at(-1)!.cache_control, { type: 'ephemeral' });
  });

  test('opus агент → claude-opus-5 от agents.json', async () => {
    const k = await h.addKey('SECRET', { agents: ['prevodach'] });
    await (
      await fetch(`${h.url}/v1/chat`, {
        method: 'POST',
        headers: { ...json, 'X-Agent-Key': k.plain },
        body: chatBody('Преведи „здравей“', 'prevodach'),
      })
    ).text();
    assert.equal(h.model.calls.at(-1)!.model, 'claude-opus-5');
  });

  test('PII се маскира ПРЕДИ заявката към модела', async () => {
    const k = await h.addKey('SECRET');
    const email = ['ivan', 'primer.bg'].join('@');
    await (
      await fetch(`${h.url}/v1/chat`, {
        method: 'POST',
        headers: { ...json, 'X-Agent-Key': k.plain },
        body: chatBody(`Пиши ми на ${email} или на +359 88 123 4567`),
      })
    ).text();
    const sent = JSON.stringify(h.model.calls.at(-1)!.messages);
    assert.equal(sent.includes(email), false);
    assert.equal(sent.includes('123 4567'), false);
    assert.match(sent, /\[имейл\]/);
    assert.match(sent, /\[телефон\]/);
  });

  test('usage се брои по ключ и месец (с +10% ЕС крайна точка)', async () => {
    const k = await h.addKey('SECRET');
    h.model.events = textEvents(['ок'], { input: 1000, output: 500 });
    await (
      await fetch(`${h.url}/v1/chat`, {
        method: 'POST',
        headers: { ...json, 'X-Agent-Key': k.plain },
        body: chatBody(),
      })
    ).text();
    const u = await h.store.monthUsage(k.id, monthKey());
    assert.equal(u.requests, 1);
    assert.equal(u.inputTokens, 1000);
    assert.equal(u.outputTokens, 500);
    // sonnet-5: 1000×2 + 500×10 = 7000 микро-USD × 1.1 = 7700
    assert.equal(u.costMicroUsd, 7700n);
  });

  test('достигнат месечен таван → 402 и моделът не се вика', async () => {
    const k = await h.addKey('SECRET', { capUsd: 1 });
    await h.store.addUsage(k.id, monthKey(), {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicroUsd: usdToMicro(1),
    });
    const before = h.model.calls.length;
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain },
      body: chatBody(),
    });
    assert.equal(r.status, 402);
    assert.match(((await r.json()) as { error: { message: string } }).error.message, /таван/);
    assert.equal(h.model.calls.length, before);
  });

  test('stop_reason „refusal“ → SSE събитие refusal', async () => {
    const k = await h.addKey('SECRET');
    h.model.events = textEvents([], { stop: 'refusal' });
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain },
      body: chatBody(),
    });
    const events = parseSse(await r.text());
    assert.deepEqual(
      events.map((e) => e.event),
      ['refusal', 'done'],
    );
  });

  test('max_tokens → done.truncated = true', async () => {
    const k = await h.addKey('SECRET');
    h.model.events = textEvents(['...'], { stop: 'max_tokens' });
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain },
      body: chatBody(),
    });
    assert.deepEqual(parseSse(await r.text()).at(-1)!.data, {
      stop: 'max_tokens',
      truncated: true,
    });
  });

  test('грешки от Vertex: 429 → 429, 500 → 502, 403 → 503', async () => {
    const k = await h.addKey('SECRET');
    for (const [up, down] of [
      [429, 429],
      [500, 502],
      [403, 503],
    ] as const) {
      h.model.openError = { status: up };
      const r = await fetch(`${h.url}/v1/chat`, {
        method: 'POST',
        headers: { ...json, 'X-Agent-Key': k.plain },
        body: chatBody(),
      });
      assert.equal(r.status, down, `upstream ${up}`);
    }
    h.model.openError = null;
  });
});

describe('лимити и fail-closed', () => {
  test('лимит заявки/мин на ключ+IP → 429 с Retry-After', async () => {
    const h = await startHarness();
    const k = await h.addKey('SECRET', { rate: 2 });
    const go = () =>
      fetch(`${h.url}/v1/chat`, {
        method: 'POST',
        headers: { ...json, 'X-Agent-Key': k.plain },
        body: chatBody(),
      });
    assert.equal((await go().then(async (r) => (await r.text(), r))).status, 200);
    assert.equal((await go().then(async (r) => (await r.text(), r))).status, 200);
    const third = await go();
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
    await h.close();
  });

  test('много грешни ключове от един IP → 429', async () => {
    const h = await startHarness({
      cfg: testConfig({ AUTH_FAIL_PER_MIN: '2' }),
      limiter: new RateLimiter(),
    });
    const bad = () =>
      fetch(`${h.url}/v1/chat`, {
        method: 'POST',
        headers: { ...json, 'X-Agent-Key': 'nope' },
        body: chatBody(),
      });
    assert.equal((await bad()).status, 401);
    assert.equal((await bad()).status, 401);
    assert.equal((await bad()).status, 429);
    await h.close();
  });

  test('без GCP данни (model=null) → 503, никакъв резервен доставчик', async () => {
    const h = await startHarness({ noModel: true });
    const k = await h.addKey('SECRET');
    const r = await fetch(`${h.url}/v1/chat`, {
      method: 'POST',
      headers: { ...json, 'X-Agent-Key': k.plain },
      body: chatBody(),
    });
    assert.equal(r.status, 503);
    const health = (await (await fetch(`${h.url}/healthz`)).json()) as { ai: boolean };
    assert.equal(health.ai, false);
    await h.close();
  });

  test('регион извън ЕС → конфигурацията отказва', () => {
    assert.throws(() => testConfig({ VERTEX_REGION: 'global' }), /ЕС регион/);
    assert.throws(() => testConfig({ VERTEX_REGION: 'us-east5' }), /ЕС регион/);
    assert.equal(testConfig({ VERTEX_REGION: 'europe-west1' }).VERTEX_REGION, 'europe-west1');
    assert.equal(testConfig().VERTEX_REGION, 'eu');
  });
});
