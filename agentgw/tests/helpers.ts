import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type {
  MessageCreateParamsStreaming,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { createApp } from '../src/app.js';
import type { ChatModel } from '../src/claude.js';
import { loadConfig, type Config } from '../src/config.js';
import { generateKey, hashKey, keyPrefix, usdToMicro, type KeyKind } from '../src/keys.js';
import { silenceLogs } from '../src/logger.js';
import { loadProfiles } from '../src/profiles.js';
import { RateLimiter } from '../src/ratelimit.js';
import { MemoryStore } from '../src/store/memory.js';

silenceLogs();

export const ROOT = join(import.meta.dirname, '..');
// Сглобява се в runtime — литерал би изглеждал като тайна за скенерите.
export const PEPPER = ['test', 'pepper', 'only', 'for', 'unit', 'tests', 'x'].join('-');
export const ORIGIN = 'https://primer.bg';

export function testConfig(over: Partial<Record<string, string>> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://unused',
    KEY_PEPPER: PEPPER,
    VERTEX_PROJECT_ID: 'test-project',
    TRUST_PROXY: '0',
    ...over,
  });
}

export function textEvents(
  parts: string[],
  opts: { stop?: string; input?: number; output?: number; cacheRead?: number } = {},
): RawMessageStreamEvent[] {
  return [
    {
      type: 'message_start',
      message: {
        usage: {
          input_tokens: opts.input ?? 100,
          output_tokens: 1,
          cache_read_input_tokens: opts.cacheRead ?? 0,
          cache_creation_input_tokens: 0,
        },
      },
    } as unknown as RawMessageStreamEvent,
    ...parts.map(
      (text) =>
        ({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text },
        }) as unknown as RawMessageStreamEvent,
    ),
    {
      type: 'message_delta',
      delta: { stop_reason: opts.stop ?? 'end_turn', stop_sequence: null },
      usage: { output_tokens: opts.output ?? 50 },
    } as unknown as RawMessageStreamEvent,
    { type: 'message_stop' } as unknown as RawMessageStreamEvent,
  ];
}

/** Фалшив Vertex: без мрежа; помни параметрите; може да хвърли HTTP грешка при отваряне. */
export class FakeModel implements ChatModel {
  calls: MessageCreateParamsStreaming[] = [];
  events: RawMessageStreamEvent[] = textEvents(['Здравей', ', свят!']);
  openError: { status: number } | null = null;

  async open(params: MessageCreateParamsStreaming): Promise<AsyncIterable<RawMessageStreamEvent>> {
    this.calls.push(params);
    if (this.openError) throw Object.assign(new Error('upstream'), this.openError);
    const events = this.events;
    return (async function* () {
      for (const e of events) yield e;
    })();
  }
}

export interface Harness {
  url: string;
  store: MemoryStore;
  model: FakeModel;
  close: () => Promise<void>;
  addKey: (
    kind: KeyKind,
    opts?: { agents?: string[]; origins?: string[]; capUsd?: number; rate?: number },
  ) => Promise<{ plain: string; id: string }>;
}

export async function startHarness(
  opts: { cfg?: Config; noModel?: boolean; limiter?: RateLimiter } = {},
): Promise<Harness> {
  const store = new MemoryStore();
  const model = new FakeModel();
  const cfg = opts.cfg ?? testConfig();
  const app = createApp({
    cfg,
    store,
    model: opts.noModel ? null : model,
    profiles: loadProfiles(join(ROOT, 'agents')),
    widgetJs: '/* widget */',
    ...(opts.limiter ? { limiter: opts.limiter } : {}),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    store,
    model,
    close: () => new Promise<void>((r) => server.close(() => r())),
    async addKey(kind, o = {}) {
      const plain = generateKey(kind);
      const rec = await store.createKey({
        kind,
        site: 'Пример',
        agents: o.agents ?? ['seo'],
        origins: kind === 'PUBLIC' ? (o.origins ?? [ORIGIN]) : [],
        capMicroUsd: usdToMicro(o.capUsd ?? 10),
        ratePerMin: o.rate ?? 100,
        hash: hashKey(plain, PEPPER),
        prefix: keyPrefix(plain),
      });
      return { plain, id: rec.id };
    },
  };
}

export function chatBody(content = 'Как да подобря SEO?', agent = 'seo') {
  return JSON.stringify({ agent, messages: [{ role: 'user', content }] });
}

/** Парсва SSE тяло до списък от {event, data}. */
export function parseSse(body: string): Array<{ event: string; data: unknown }> {
  return body
    .split('\n\n')
    .filter((b) => b.trim())
    .map((block) => {
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      return { event, data: JSON.parse(data) as unknown };
    });
}
