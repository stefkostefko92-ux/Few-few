import { readFileSync } from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { buildParams, modelFor, type ChatModel } from './claude.js';
import type { Config } from './config.js';
import {
  AGENT_ID_RE,
  hashKey,
  isKeyFormat,
  kindOf,
  microToUsd,
  monthKey,
  type KeyRecord,
  type Store,
} from './keys.js';
import { log } from './logger.js';
import { redactPii } from './pii.js';
import { costMicroUsd, type TokenUsage } from './pricing.js';
import type { AgentProfile } from './profiles.js';
import { RateLimiter } from './ratelimit.js';

export interface AppDeps {
  cfg: Config;
  store: Store;
  /** null = липсват GCP данни → AI е изключен (fail-closed, 503). */
  model: ChatModel | null;
  profiles: Map<string, AgentProfile>;
  widgetJs: string;
  limiter?: RateLimiter;
}

type Authed = Request & { apiKey?: KeyRecord };

/** Съобщенията за грешка са към човек (собственик на сайта / посетител) — на български. */
function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}

export function createApp(deps: AppDeps) {
  const { cfg, store, profiles } = deps;
  const limiter = deps.limiter ?? new RateLimiter();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.use(securityHeaders);

  const ChatBody = z
    .object({
      agent: z.string().regex(AGENT_ID_RE),
      messages: z
        .array(
          z
            .object({
              role: z.enum(['user', 'assistant']),
              content: z.string().trim().min(1).max(cfg.MAX_MESSAGE_CHARS),
            })
            .strict(),
        )
        .min(1)
        .max(cfg.MAX_MESSAGES)
        .refine((m) => m[0]?.role === 'user' && m.at(-1)?.role === 'user', {
          message: 'Разговорът трябва да започва и да завършва със съобщение от потребителя',
        })
        .refine((m) => m.reduce((n, x) => n + x.content.length, 0) <= cfg.MAX_TOTAL_CHARS, {
          message: 'Историята е твърде дълга',
        }),
    })
    .strict();

  // Кеш на Origin-ите за CORS preflight (30 s) — не удряме базата на всеки OPTIONS.
  let originCache: { at: number; set: Set<string> } | null = null;
  async function knownOrigin(origin: string): Promise<boolean> {
    if (!originCache || Date.now() - originCache.at > 30_000) {
      originCache = { at: Date.now(), set: await store.activePublicOrigins() };
    }
    return originCache.set.has(origin);
  }

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, ai: deps.model !== null });
  });

  app.get('/widget.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Скриптът се вгражда в чужди сайтове — изрично разрешаваме зареждане от друг произход.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(deps.widgetJs);
  });

  app.options(['/v1/chat', '/v1/agents'], async (req, res) => {
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !(await knownOrigin(origin))) {
      res.status(403).end();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Key');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
  });

  /** Ключ → запис; Origin правила; лимит на ключ+IP. */
  async function authenticate(req: Authed, res: Response, next: NextFunction): Promise<void> {
    const ip = req.ip ?? 'unknown';
    const header = req.headers['x-agent-key'];
    const bearer = req.headers.authorization?.match(/^Bearer\s+(\S+)$/)?.[1];
    const raw = (typeof header === 'string' ? header : (bearer ?? '')).trim();

    const authFail = (msg: string) => {
      if (!limiter.take(`authfail:${ip}`, cfg.AUTH_FAIL_PER_MIN)) {
        res.setHeader('Retry-After', String(limiter.retryAfter(`authfail:${ip}`)));
        fail(res, 429, 'too_many_attempts', 'Твърде много неуспешни опити. Опитай по-късно.');
        return;
      }
      fail(res, 401, 'invalid_key', msg);
    };

    if (!raw || !isKeyFormat(raw)) return authFail('Липсва или е невалиден агентски ключ.');
    const key = await store.findKeyByHash(hashKey(raw, cfg.KEY_PEPPER));
    if (!key || !key.active || key.kind !== kindOf(raw)) {
      return authFail('Ключът не е валиден или е отменен.');
    }

    const origin = req.headers.origin;
    if (key.kind === 'PUBLIC') {
      if (typeof origin !== 'string' || !key.origins.includes(origin)) {
        fail(res, 403, 'origin_not_allowed', 'Този сайт не е позволен за ключа.');
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (origin !== undefined) {
      // Тайният ключ в браузър = изтекъл ключ. Отказваме, за да не „работи“ и да остане там.
      fail(res, 403, 'secret_key_in_browser', 'Тайният ключ (cs_sk_) не се ползва от браузър.');
      return;
    }

    const bucket = `key:${key.id}:${ip}`;
    if (!limiter.take(bucket, key.ratePerMin)) {
      res.setHeader('Retry-After', String(limiter.retryAfter(bucket)));
      fail(res, 429, 'rate_limited', 'Твърде много заявки. Изчакай малко и опитай пак.');
      return;
    }
    req.apiKey = key;
    next();
  }

  app.get('/v1/agents', authenticate, (req: Authed, res) => {
    const key = req.apiKey!;
    const agents = key.agents
      .map((id) => profiles.get(id))
      .filter((p): p is AgentProfile => p !== undefined)
      .map(({ id, name, title }) => ({ id, name, title }));
    res.json({ site: key.site, agents });
  });

  app.post(
    '/v1/chat',
    express.json({ limit: '128kb', type: 'application/json' }),
    authenticate,
    async (req: Authed, res) => {
      const key = req.apiKey!;
      const parsed = ChatBody.safeParse(req.body);
      if (!parsed.success) {
        fail(res, 400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Невалидна заявка.');
        return;
      }
      const { agent, messages } = parsed.data;
      if (!key.agents.includes(agent)) {
        fail(res, 403, 'agent_not_allowed', 'Този агент не е активиран за ключа.');
        return;
      }
      const profile = profiles.get(agent);
      if (!profile) {
        fail(res, 404, 'agent_unknown', 'Няма публичен профил за този агент.');
        return;
      }
      if (!deps.model) {
        fail(res, 503, 'ai_unavailable', 'AI асистентът временно не е наличен.');
        return;
      }
      const month = monthKey();
      const used = await store.monthUsage(key.id, month);
      if (used.costMicroUsd >= key.capMicroUsd) {
        fail(
          res,
          402,
          'monthly_cap_reached',
          `Месечният таван на ключа е достигнат (${microToUsd(key.capMicroUsd)} USD). Свържи се със собственика на сайта.`,
        );
        return;
      }

      const clean = messages.map((m) => ({ role: m.role, content: redactPii(m.content) }));
      const params = buildParams(profile, clean, cfg);
      const model = modelFor(profile, cfg);
      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) abort.abort();
      });

      let stream: AsyncIterable<
        import('@anthropic-ai/sdk/resources/messages/messages').RawMessageStreamEvent
      >;
      try {
        stream = await deps.model.open(params, abort.signal);
      } catch (err) {
        const status = (err as { status?: unknown }).status;
        log('warn', 'upstream_open_failed', { keyId: key.id, agent, status });
        if (status === 429)
          fail(res, 429, 'upstream_busy', 'AI услугата е натоварена. Опитай след малко.');
        else if (status === 401 || status === 403 || status === 404)
          fail(res, 503, 'ai_unavailable', 'AI асистентът временно не е наличен.');
        else fail(res, 502, 'upstream_error', 'AI услугата не отговори. Опитай пак.');
        return;
      }

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      const send = (event: string, data: unknown) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const usage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      let stop: string | null = null;
      try {
        for await (const ev of stream) {
          if (ev.type === 'message_start') {
            const u = ev.message.usage;
            usage.inputTokens = u.input_tokens;
            usage.outputTokens = u.output_tokens;
            usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
            usage.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
          } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            send('delta', { text: ev.delta.text });
          } else if (ev.type === 'message_delta') {
            stop = ev.delta.stop_reason ?? stop;
            // usage в message_delta е кумулативен.
            usage.outputTokens = Math.max(usage.outputTokens, ev.usage.output_tokens);
            if (ev.usage.input_tokens != null) usage.inputTokens = ev.usage.input_tokens;
            if (ev.usage.cache_read_input_tokens != null)
              usage.cacheReadTokens = ev.usage.cache_read_input_tokens;
            if (ev.usage.cache_creation_input_tokens != null)
              usage.cacheWriteTokens = ev.usage.cache_creation_input_tokens;
          }
        }
        if (stop === 'refusal') {
          send('refusal', { message: 'Асистентът не може да помогне с тази заявка.' });
        }
        send('done', { stop, truncated: stop === 'max_tokens' });
      } catch (err) {
        if (!abort.signal.aborted) {
          log('warn', 'upstream_stream_failed', { keyId: key.id, agent, err: String(err) });
          send('error', { code: 'upstream_error', message: 'Връзката с AI прекъсна. Опитай пак.' });
        }
      } finally {
        const cost = costMicroUsd(model, usage, cfg.PRICE_MULTIPLIER);
        try {
          await store.addUsage(key.id, month, { ...usage, costMicroUsd: cost });
        } catch (err) {
          log('error', 'usage_write_failed', { keyId: key.id, err: String(err) });
        }
        log('info', 'chat', {
          keyId: key.id,
          agent,
          model,
          stop,
          ...usage,
          costMicro: String(cost),
        });
        res.end();
      }
    },
  );

  app.use((_req, res) => fail(res, 404, 'not_found', 'Няма такъв адрес.'));

  // Грешки от body parser-а (твърде голямо тяло / невалиден JSON) и всичко неочаквано.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { type?: string; status?: number };
    if (res.headersSent) {
      res.end();
      return;
    }
    if (e.type === 'entity.too.large')
      return fail(res, 413, 'too_large', 'Заявката е твърде голяма.');
    if (e.type === 'entity.parse.failed') return fail(res, 400, 'invalid_json', 'Невалиден JSON.');
    log('error', 'unhandled', { err: String(err) });
    fail(res, 500, 'internal', 'Вътрешна грешка.');
  });

  return app;
}

export function readWidget(path: string): string {
  return readFileSync(path, 'utf8');
}
