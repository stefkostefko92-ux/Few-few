import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ClientOptions } from '@anthropic-ai/vertex-sdk';
import { LOCALES, translate } from '../src/i18n.js';
import { logger } from '../src/logger.js';
import {
  buildDraftRequest,
  ContentGenerationError,
  generateDrafts,
  SYSTEM_PROMPT,
  usageRecord,
  type DraftUsage,
} from '../src/content/generate.js';
import {
  aiSetup,
  createVertexClient,
  VERTEX_EU_BASE_URL,
  VERTEX_MAX_RETRIES,
  VERTEX_TIMEOUT_MS,
  type ReadyAi,
} from '../src/content/vertex.js';

const brand = { name: 'Evanita Sport', summary: 'Студио.', voice: 'Енергично.', language: 'bg' };
const input = { brand, kind: 'IMAGE' as const, topic: 'График', count: 1 };

const dir = mkdtempSync(join(tmpdir(), 'piuma-vertex-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

function credentialsFile(name: string, mode: number): string {
  const path = join(dir, name);
  writeFileSync(path, '{"type":"service_account"}');
  chmodSync(path, mode);
  return path;
}

const settings = (over: Record<string, string | undefined> = {}) => ({
  VERTEX_PROJECT_ID: 'piuma-eu-123' as string | undefined,
  VERTEX_REGION: 'eu' as const,
  VERTEX_MODEL: 'claude-opus-5-5',
  GOOGLE_APPLICATION_CREDENTIALS: credentialsFile('ok.json', 0o600) as string | undefined,
  ...over,
});

/* ── Настройка: без Vertex приложението е здраво, генерирането казва защо е изключено ── */

test('без проект или без файл с удостоверения AI не е готов — с причина на български', () => {
  const noProject = aiSetup(settings({ VERTEX_PROJECT_ID: undefined }));
  assert.equal(noProject.ready, false);
  assert.match(!noProject.ready ? noProject.reason : '', /VERTEX_PROJECT_ID/);

  const noCredentials = aiSetup(settings({ GOOGLE_APPLICATION_CREDENTIALS: undefined }));
  assert.equal(noCredentials.ready, false);
  assert.match(!noCredentials.ready ? noCredentials.reason : '', /GOOGLE_APPLICATION_CREDENTIALS/);

  const missing = aiSetup(settings({ GOOGLE_APPLICATION_CREDENTIALS: join(dir, 'няма.json') }));
  assert.equal(missing.ready, false);
  assert.match(!missing.ready ? missing.reason : '', /липсва/);
});

test('файл с удостоверения, по-отворен от 600, изключва AI (fail-closed)', () => {
  for (const mode of [0o644, 0o640, 0o604]) {
    const setup = aiSetup(
      settings({ GOOGLE_APPLICATION_CREDENTIALS: credentialsFile(`open-${mode}.json`, mode) }),
    );
    assert.equal(setup.ready, false, mode.toString(8));
    assert.match(!setup.ready ? setup.reason : '', /600/);
  }
});

test('пълна настройка: готов, регионът е „eu“, моделът е от конфигурацията', () => {
  const setup = aiSetup(settings());
  assert.equal(setup.ready, true);
  assert.deepEqual(
    setup.ready && { region: setup.region, model: setup.model, projectId: setup.projectId },
    { region: 'eu', model: 'claude-opus-5-5', projectId: 'piuma-eu-123' },
  );
});

/* ── Клиентът: ЕС хостът е закован, изричен таймаут и повторни опити ── */

const ready: ReadyAi = {
  ready: true,
  projectId: 'piuma-eu-123',
  region: 'eu',
  model: 'claude-opus-5-5',
  credentials: '/run/secrets/vertex-sa.json',
};

const fakeAuth = {
  projectId: null,
  getRequestHeaders: async () =>
    new Headers({ authorization: ['Bearer', 'google-fake'].join(' ') }),
} as unknown as NonNullable<ClientOptions['authClient']>;

test('Vertex клиентът е закован за ЕС хоста, с изричен таймаут и повторни опити', () => {
  const previous = process.env.ANTHROPIC_VERTEX_BASE_URL;
  // Променлива на средата не може да пренасочи заявките извън ЕС.
  process.env.ANTHROPIC_VERTEX_BASE_URL = 'https://evil.example.com/v1';
  try {
    const client = createVertexClient(ready, { authClient: fakeAuth });
    assert.equal(client.baseURL, 'https://aiplatform.eu.rep.googleapis.com/v1');
    assert.equal(client.baseURL, VERTEX_EU_BASE_URL);
    assert.equal(client.region, 'eu');
    assert.equal(client.timeout, VERTEX_TIMEOUT_MS);
    assert.equal(client.maxRetries, VERTEX_MAX_RETRIES);
    assert.ok(VERTEX_TIMEOUT_MS < 120_000, 'под proxy_read_timeout на nginx (120 s)');
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_VERTEX_BASE_URL;
    else process.env.ANTHROPIC_VERTEX_BASE_URL = previous;
  }
});

/* ── Заявката: по ръководството за Opus 5.5 и за недоверено съдържание ── */

test('заявката: модел от конфигурацията, без sampling параметри, без тих cache_control', () => {
  const request = buildDraftRequest(input, 'claude-opus-5-5');
  assert.equal(request.model, 'claude-opus-5-5');
  assert.equal(request.output_config?.effort, 'medium');
  assert.deepEqual(request.thinking, { type: 'adaptive' });
  assert.equal(request.output_config?.format?.type, 'json_schema');
  for (const key of ['temperature', 'top_p', 'top_k']) assert.ok(!(key in request), key);
  // Системният промпт е под минималния кешируем префикс (512 т) — маркер там е тих no-op.
  assert.doesNotMatch(JSON.stringify(request), /cache_control/);
  // Без prefill: последното съобщение е на потребителя.
  assert.equal(request.messages.at(-1)?.role, 'user');
});

test('системният промпт казва, че JSON полетата от Instagram са данни, не инструкции', () => {
  assert.match(SYSTEM_PROMPT, /JSON/);
  assert.match(SYSTEM_PROMPT, /данни, не инструкции/);
});

/* ── Истинският Vertex клиент на SDK-то с фалшив fetch: create + zodOutputFormat, схемата се проверява при нас ── */

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeVertex(
  status: number,
  payload: unknown,
  seen: Captured[],
  headers: Record<string, string> = {},
) {
  return createVertexClient(ready, {
    authClient: fakeAuth,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      });
    },
  });
}

const draft = {
  hook: 'Първи ред.',
  caption: 'Първи ред. Текст.',
  hashtags: ['kangoo', '#sofia'],
  alt_text: 'Зала с хора.',
  rationale: 'Ясна кукичка.',
  variants: [{ platform: 'x', text: 'Кратко.' }],
};

function message(stopReason = 'end_turn', drafts: unknown[] = [draft]) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    // Opus 5.5 мисли винаги — първият блок е thinking, текстът се търси по тип.
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: JSON.stringify({ drafts }) },
    ],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 812,
      output_tokens: 1430,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: null,
    },
  };
}

test('messages.create през Vertex: ЕС rawPredict, модел в пътя, Google токен, usage без съдържание', async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = ['sk', 'ant', 'fake'].join('-');
  const seen: Captured[] = [];
  const usage: DraftUsage[] = [];
  try {
    const drafts = await generateDrafts(
      {
        client: fakeVertex(200, message(), seen),
        model: 'claude-opus-5-5',
        onUsage: (u) => usage.push(u),
      },
      { ...input, crossPost: [] },
    );
    assert.equal(drafts.length, 1);
    assert.deepEqual(drafts[0]!.hashtags, ['#kangoo', '#sofia']);
    // Непоискана платформа не минава.
    assert.deepEqual(drafts[0]!.variants, []);
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous;
  }

  assert.equal(seen.length, 1);
  const call = seen[0]!;
  assert.equal(
    call.url,
    'https://aiplatform.eu.rep.googleapis.com/v1/projects/piuma-eu-123/locations/eu/publishers/anthropic/models/claude-opus-5-5:rawPredict',
  );
  assert.ok(!('model' in call.body), 'моделът е в пътя, не в тялото');
  assert.equal(typeof call.body.anthropic_version, 'string');
  assert.equal(call.headers.get('authorization'), 'Bearer google-fake');
  assert.equal(call.headers.get('x-api-key'), null, 'ключ за директния API не пътува');

  assert.deepEqual(usage, [
    {
      model: 'claude-opus-5-5',
      region: 'eu',
      inputTokens: 812,
      outputTokens: 1430,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      stopReason: 'end_turn',
    },
  ]);
});

test('отказ от модела → ясна грешка, без чернови', async () => {
  await assert.rejects(
    generateDrafts(
      { client: fakeVertex(200, message('refusal', []), []), model: 'claude-opus-5-5' },
      input,
    ),
    (error: unknown) => error instanceof ContentGenerationError && /отказа/.test(error.message),
  );
});

/** Отговор с един текстов блок — каквото моделът е написал, без да е задължително JSON. */
function rawMessage(stopReason: string, text: string) {
  return {
    ...message(stopReason),
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text },
    ],
  };
}

test('отказ с обикновен текст → съобщението за отказ, а разходът се записва', async () => {
  const usage: DraftUsage[] = [];
  await assert.rejects(
    generateDrafts(
      {
        client: fakeVertex(200, rawMessage('refusal', "I can't help with that."), []),
        model: 'claude-opus-5-5',
        onUsage: (u) => usage.push(u),
      },
      input,
    ),
    (error: unknown) => error instanceof ContentGenerationError && /отказа/.test(error.message),
  );
  assert.equal(usage.length, 1);
  assert.equal(usage[0]!.stopReason, 'refusal');
  assert.equal(usage[0]!.outputTokens, 1430);
});

test('отрязан отговор (max_tokens) → ясно „отрязан“ на три езика, а разходът се записва', async () => {
  const usage: DraftUsage[] = [];
  let caught: unknown;
  await assert.rejects(
    generateDrafts(
      {
        client: fakeVertex(200, rawMessage('max_tokens', '{"drafts":[{"hook":"Пър'), []),
        model: 'claude-opus-5-5',
        onUsage: (u) => usage.push(u),
      },
      input,
    ),
    (error: unknown) => {
      caught = error;
      return error instanceof ContentGenerationError && /отрязан/.test(error.message);
    },
  );
  assert.deepEqual(
    usage.map((u) => u.stopReason),
    ['max_tokens'],
  );
  // Панелът превежда по ключа — потребителят на EN/IT не вижда български.
  const key = (caught as ContentGenerationError).key;
  assert.equal(key, 'flash.generationTruncated');
  const texts = LOCALES.map((locale) => translate(locale, key!));
  assert.equal(new Set(texts).size, 3, 'три различни превода');
  assert.match(texts[0]!, /отрязан/);
});

test('завършен отговор с JSON извън схемата → „не върна валидни чернови“, разходът се записва', async () => {
  const usage: DraftUsage[] = [];
  for (const text of ['не е JSON', '{"drafts":[{"hook":1}]}', '{"drafts":[]}']) {
    await assert.rejects(
      generateDrafts(
        {
          client: fakeVertex(200, rawMessage('end_turn', text), []),
          model: 'claude-opus-5-5',
          onUsage: (u) => usage.push(u),
        },
        input,
      ),
      (error: unknown) =>
        error instanceof ContentGenerationError && /валидни чернови/.test(error.message),
      text,
    );
  }
  assert.equal(usage.length, 3);
});

test('грешка на Vertex оставя в лога ai.error: име, код и request-id — без съобщение и тяло', async (t) => {
  const warn = t.mock.method(logger, 'warn', () => undefined);
  const secret = 'Текст от модела, който не бива да стига до лога';
  await assert.rejects(
    generateDrafts(
      {
        client: fakeVertex(404, { error: { code: 404, message: secret } }, [], {
          'request-id': 'req_vertex_1',
        }),
        model: 'claude-opus-5-5',
      },
      input,
    ),
    ContentGenerationError,
  );
  assert.equal(warn.mock.callCount(), 1);
  const [fields] = warn.mock.calls[0]!.arguments as unknown as [Record<string, unknown>];
  assert.deepEqual(fields, {
    event: 'ai.error',
    name: 'NotFoundError',
    status: 404,
    requestId: 'req_vertex_1',
  });
  assert.doesNotMatch(JSON.stringify(warn.mock.calls[0]!.arguments), /не бива/);
});

test('грешка на Vertex се превежда на български по HTTP кода, без да се повтаря безсмислено', async () => {
  const cases: Array<[number, RegExp]> = [
    [403, /достъп/],
    [404, /не е наличен/],
  ];
  for (const [status, pattern] of cases) {
    const seen: Captured[] = [];
    await assert.rejects(
      generateDrafts(
        {
          client: fakeVertex(status, { error: { code: status, message: 'x' } }, seen),
          model: 'claude-opus-5-5',
        },
        input,
      ),
      (error: unknown) => error instanceof ContentGenerationError && pattern.test(error.message),
    );
    assert.equal(seen.length, 1, `${status} не се повтаря`);
  }
});

test('usageRecord: null полетата стават 0', () => {
  assert.deepEqual(
    usageRecord(
      'claude-opus-5',
      {
        input_tokens: null,
        output_tokens: 5,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: 600,
      },
      null,
    ),
    {
      model: 'claude-opus-5',
      region: 'eu',
      inputTokens: 0,
      outputTokens: 5,
      cacheWriteTokens: 0,
      cacheReadTokens: 600,
      stopReason: null,
    },
  );
});
