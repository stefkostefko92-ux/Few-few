// MCP конекторът (ChatGPT/Claude) — тестове на ПРОТОКОЛА и на границата на
// поверителността. Държат се отделно от smoke теста, защото проверяват договор с
// външни системи: сбърка ли се форматът, конекторът не тръгва при клиента, а
// локално всичко „изглежда наред“.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-mcp-'));
process.env.PRINT_API_SECRET = 'test-print-secret';
process.env.AUTH_RATE_LIMIT = '60';

const { default: app } = await import('../src/app.js');
const { default: db } = await import('../src/db.js');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✘ ${name}\n  ${err.message}`);
  }
}

// ── помощници ────────────────────────────────────────────────────────────────
const LEGACY = '2025-06-18';
const MODERN = '2026-07-28';

// Наследена ера: както я говорят живите клиенти днес.
function legacy(method, params = {}, id = 1) {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': LEGACY,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

// Модерна ера (2026-07-28): `_meta` в тялото + огледални хедъри.
function modern(method, params = {}, { id = 1, headers = {}, meta = {} } = {}) {
  const name = params?.name ?? params?.uri;
  const body = {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MODERN,
        'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
        ...meta,
      },
    },
  };
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MODERN,
      'mcp-method': method,
      ...(name ? { 'mcp-name': name } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const callSearch = async (query) => {
  const res = await legacy('tools/call', { name: 'search', arguments: { query } }, 7);
  return (await res.json()).result;
};

// ── протокол: наследена ера ──────────────────────────────────────────────────
await test('initialize преговаря версия и обявява инструментите', async () => {
  const res = await legacy('initialize', {
    protocolVersion: LEGACY,
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  });
  assert.equal(res.status, 200);
  const { result } = await res.json();
  assert.equal(result.protocolVersion, LEGACY, 'трябва да потвърди поисканата версия');
  assert.ok(result.capabilities.tools, 'трябва да обяви tools capability');
  assert.equal(result.serverInfo.name, 'vizitka');
  assert.match(result.instructions, /Vizitka/);
});

await test('initialize с непозната версия предлага наша', async () => {
  const res = await legacy('initialize', { protocolVersion: '1999-01-01', capabilities: {} });
  const { result } = await res.json();
  assert.ok(
    ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'].includes(result.protocolVersion)
  );
});

await test('известието initialized връща 202 без тяло', async () => {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': LEGACY },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert.equal(res.status, 202);
  assert.equal((await res.text()).length, 0);
});

await test('tools/list дава search и fetch с валидни схеми', async () => {
  const res = await legacy('tools/list');
  const { result } = await res.json();
  const names = result.tools.map((t) => t.name);
  assert.deepEqual(names, ['search', 'fetch'], 'ChatGPT иска точно тези две имена');
  for (const tool of result.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 40, `${tool.name}: описанието е твърде кратко`);
    assert.equal(tool.annotations.readOnlyHint, true, `${tool.name}: трябва да е само за четене`);
  }
  const search = result.tools[0];
  assert.deepEqual(search.inputSchema.required, ['query']);
  assert.deepEqual(result.tools[1].inputSchema.required, ['id']);
});

await test('непознат метод: 200 + -32601 (наследена), 404 + -32601 (модерна)', async () => {
  // Името на метода отива и в хедъра Mcp-Method, а хедърите са ASCII (RFC 9110) —
  // затова непознатият метод тук е латиница, не кирилица.
  const old = await legacy('tools/nonexistent');
  assert.equal(old.status, 200, 'наследеният клиент чете 404 като „грешен адрес“');
  assert.equal((await old.json()).error.code, -32601);
  const now = await modern('tools/nonexistent');
  assert.equal(now.status, 404);
  assert.equal((await now.json()).error.code, -32601);
});

await test('непознат инструмент е грешка на протокола (-32602)', async () => {
  const res = await legacy('tools/call', { name: 'drop_database', arguments: {} });
  const { error } = await res.json();
  assert.equal(error.code, -32602);
});

// ── протокол: модерна ера (2026-07-28) ───────────────────────────────────────
await test('модерна заявка минава и носи resultType „complete“', async () => {
  const res = await modern('tools/list');
  assert.equal(res.status, 200);
  const { result } = await res.json();
  assert.equal(result.resultType, 'complete');
  assert.equal(result._meta['io.modelcontextprotocol/serverInfo'].name, 'vizitka');
});

await test('огледалните хедъри се сверяват с тялото (-32020)', async () => {
  // Липсващ Mcp-Method.
  const noMethod = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': MODERN },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MODERN,
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  assert.equal(noMethod.status, 400);
  assert.equal((await noMethod.json()).error.code, -32020);

  // Mcp-Name сочи друг инструмент, отколкото тялото — точно случаят, заради който
  // спецификацията иска сверяване (посредник маршрутизира по хедъра).
  const wrongName = await modern(
    'tools/call',
    { name: 'search', arguments: { query: 'визитка' } },
    { headers: { 'mcp-name': 'fetch' } }
  );
  assert.equal(wrongName.status, 400);
  assert.equal((await wrongName.json()).error.code, -32020);

  // Версия в хедъра ≠ версия в тялото.
  const wrongVersion = await modern(
    'tools/list',
    {},
    {
      headers: { 'mcp-protocol-version': MODERN },
      meta: { 'io.modelcontextprotocol/protocolVersion': '2025-06-18' },
    }
  );
  assert.equal(wrongVersion.status, 400);
  assert.equal((await wrongVersion.json()).error.code, -32020);
});

await test('Mcp-Name с кирилица минава през base64 обвивката', async () => {
  const { decodeHeaderValue } = await import('../src/mcp/protocol.js');
  const encoded = `=?base64?${Buffer.from('Иван Тестов', 'utf8').toString('base64')}?=`;
  assert.equal(decodeHeaderValue(encoded), 'Иван Тестов');
  assert.equal(decodeHeaderValue('search'), 'search');
});

await test('липсващи задължителни _meta полета се отказват', async () => {
  const noCaps = await modern(
    'tools/list',
    {},
    { meta: { 'io.modelcontextprotocol/clientCapabilities': undefined } }
  );
  const body = await noCaps.json();
  assert.equal(noCaps.status, 400);
  assert.equal(body.error.code, -32021);
  assert.deepEqual(body.error.data.requiredCapabilities, [
    'io.modelcontextprotocol/clientCapabilities',
  ]);
});

await test('неподдържана версия връща -32022 със списък на нашите', async () => {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2030-01-01' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.equal(error.code, -32022);
  assert.ok(error.data.supported.includes('2026-07-28'));
});

// ── транспорт ────────────────────────────────────────────────────────────────
await test('GET и DELETE на крайната точка дават 405 с Allow: POST', async () => {
  for (const method of ['GET', 'DELETE']) {
    const res = await fetch(`${base}/mcp`, { method });
    assert.equal(res.status, 405, `${method} трябва да е 405`);
    assert.equal(res.headers.get('allow'), 'POST');
  }
});

await test('чужд Origin се отказва с 403 (DNS rebinding)', async () => {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
      'mcp-protocol-version': LEGACY,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  assert.equal(res.status, 403);
});

await test('счупен JSON връща -32700, а не HTML', async () => {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': LEGACY },
    body: '{ това не е JSON',
  });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
  assert.equal((await res.json()).error.code, -32700);
});

await test('пакетни заявки се отказват ясно', async () => {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': LEGACY },
    body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, -32600);
});

// ── съдържание ───────────────────────────────────────────────────────────────
await test('search намира наръчника и връща двойния формат на ChatGPT', async () => {
  const result = await callSearch('визитка с QR код');
  const { results } = result.structuredContent;
  assert.ok(results.length > 0, 'нула резултата за основната ни тема');
  for (const r of results) {
    assert.ok(r.id && r.title && r.url, 'ChatGPT иска id, title и url на всеки резултат');
    assert.match(r.url, /^http/);
  }
  assert.ok(
    results.some((r) => r.id === 'guide:qr-vizitka'),
    'страницата за QR визитка трябва да е сред резултатите'
  );
  // Същото съдържание и като текст — клиент, който чете само `content`.
  const asText = JSON.parse(result.content[0].text);
  assert.deepEqual(asText, result.structuredContent);
  assert.equal(result.isError, false);
});

await test('search понася словоформи (визитки → визитка)', async () => {
  const { structuredContent } = await callSearch('електронни визитки безплатно');
  assert.ok(structuredContent.results.length > 0);
});

await test('fetch връща пълния текст по id от search', async () => {
  const res = await legacy('tools/call', {
    name: 'fetch',
    arguments: { id: 'guide:vcard-vcf' },
  });
  const { result } = await res.json();
  const doc = result.structuredContent;
  assert.equal(doc.id, 'guide:vcard-vcf');
  assert.match(doc.url, /\/vcard-vcf$/);
  assert.match(doc.text, /vCard/);
  assert.equal(doc.metadata.type, 'guide');
  assert.ok(doc.text.length > 400, 'текстът трябва да е пълен, не откъс');
});

await test('fetch с невалидно id е грешка на ИЗПЪЛНЕНИЕТО, не на протокола', async () => {
  const res = await legacy('tools/call', { name: 'fetch', arguments: { id: 'card:няма-такъв' } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(
    !body.error,
    'моделът трябва да може да се поправи сам, не да получи протоколна грешка'
  );
  assert.equal(body.result.isError, true);
  assert.match(body.result.structuredContent.message, /search/);
});

// ── границата на поверителността ─────────────────────────────────────────────
const form = (data) => new URLSearchParams(data).toString();

await test('подготовка: публична визитка БЕЗ съгласие за AI', async () => {
  const res = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    redirect: 'manual',
    body: form({
      name: 'Мария Иванова',
      email: 'maria@example.com',
      password: 'tainaparola1',
      type: 'personal',
    }),
  });
  assert.equal(res.status, 302);
  db.prepare(
    "UPDATE profiles SET is_public = 1, headline = 'Фризьор в Дупница', phone = '+359888111222' WHERE slug = 'mariya-ivanova'"
  ).run();
  const row = db
    .prepare("SELECT ai_discoverable FROM profiles WHERE slug = 'mariya-ivanova'")
    .get();
  assert.equal(row.ai_discoverable, 0, 'по подразбиране НЕ се подава към AI (чл. 25(2) ОРЗД)');
});

await test('визитка без съгласие НЕ се вижда от конектора', async () => {
  const { structuredContent } = await callSearch('Мария Иванова фризьор');
  assert.ok(
    !structuredContent.results.some((r) => r.id === 'card:mariya-ivanova'),
    'публичността на визитката НЕ е съгласие за подаване към ChatGPT/Claude'
  );
  // И директното извличане не заобикаля границата.
  const res = await legacy('tools/call', {
    name: 'fetch',
    arguments: { id: 'card:mariya-ivanova' },
  });
  assert.equal((await res.json()).result.isError, true);
});

await test('със съгласие визитката се намира и чете', async () => {
  db.prepare("UPDATE profiles SET ai_discoverable = 1 WHERE slug = 'mariya-ivanova'").run();
  const { structuredContent } = await callSearch('Мария Иванова фризьор');
  const hit = structuredContent.results.find((r) => r.id === 'card:mariya-ivanova');
  assert.ok(hit, 'при изрично съгласие визитката трябва да се намира');
  assert.match(hit.url, /\/p\/mariya-ivanova$/);
  const res = await legacy('tools/call', {
    name: 'fetch',
    arguments: { id: 'card:mariya-ivanova' },
  });
  const doc = (await res.json()).result.structuredContent;
  assert.match(doc.text, /Фризьор в Дупница/);
  assert.equal(doc.metadata.type, 'card');
});

await test('оттеглено съгласие и скриване махат визитката веднага', async () => {
  db.prepare("UPDATE profiles SET ai_discoverable = 0 WHERE slug = 'mariya-ivanova'").run();
  let { structuredContent } = await callSearch('Мария Иванова');
  assert.ok(!structuredContent.results.some((r) => r.id === 'card:mariya-ivanova'));

  // Със съгласие, но скрита от админ (модерация) — пак невидима.
  db.prepare(
    "UPDATE profiles SET ai_discoverable = 1, hidden_by_admin = 1 WHERE slug = 'mariya-ivanova'"
  ).run();
  ({ structuredContent } = await callSearch('Мария Иванова'));
  assert.ok(!structuredContent.results.some((r) => r.id === 'card:mariya-ivanova'));

  // И скрита от самия собственик — също.
  db.prepare(
    "UPDATE profiles SET hidden_by_admin = 0, is_public = 0 WHERE slug = 'mariya-ivanova'"
  ).run();
  ({ structuredContent } = await callSearch('Мария Иванова'));
  assert.ok(!structuredContent.results.some((r) => r.id === 'card:mariya-ivanova'));
});

await test('robots.txt не кани обхождачи в крайната точка', async () => {
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/mcp/);
});

server.close();
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nВсички MCP тестове минаха.');
