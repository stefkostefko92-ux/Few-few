import { z } from 'zod';
import { logger } from '../logger.js';
import { envelope, newPayload } from './signing.js';

/**
 * Командите към C# плъгина (мостът, §5) и към cs2-agent (§9): подписан PUBLISH и чакане на
 * отговор по `id` в канала за потвърждения. Правата се проверяват ПРЕДИ `send` (маршрутите) —
 * отсрещната страна вярва само на подписа.
 */
export const BRIDGE_CHANNELS = { cmd: 'cs2dm:cmd', ack: 'cs2dm:ack' } as const;
export const AGENT_CHANNELS = { cmd: 'cs2dm:agent:cmd', ack: 'cs2dm:agent:ack' } as const;

export const ACK_TIMEOUT_MS = 5000;
/** Таван на суров отговор (200 реда лог × ~1 KB са далеч под него). */
const MAX_ACK_BYTES = 512 * 1024;

/** C# (System.Text.Json) пише `"error": null` / `"data": null` — null значи „няма“, не повреден ack. */
const ackSchema = z.object({
  id: z.string().min(1).max(64),
  ok: z.boolean(),
  error: z.string().max(500).nullish(),
  data: z.unknown().optional(),
});

/** Резултатът: `error` е кратък код — наш (`timeout`, `no-listener`, `redis`) или от отсрещната страна. */
export type CommandResult =
  { ok: true; data?: unknown } | { ok: false; error: string; data?: unknown };

export interface SendOptions {
  /** Таванът на чакането за тази команда (рестартът на агента чака systemd до 120 s). */
  timeoutMs?: number;
}

export interface CommandSender {
  send(
    action: string,
    args: Record<string, string | number>,
    actor: string,
    options?: SendOptions,
  ): Promise<CommandResult>;
}

/** Каквото ни трябва от ioredis — тестовете подават двойник в паметта. */
export interface Publisher {
  publish(channel: string, message: string): Promise<number>;
}
export interface Subscriber {
  subscribe(channel: string): Promise<unknown>;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
}

interface Pending {
  resolve: (result: CommandResult) => void;
  timer: NodeJS.Timeout;
}

export class RedisCommandChannel implements CommandSender {
  private readonly pending = new Map<string, Pending>();
  private subscribed: Promise<unknown> | null = null;

  constructor(
    private readonly options: {
      publisher: Publisher;
      subscriber: Subscriber;
      channels: { cmd: string; ack: string };
      key: string;
      timeoutMs?: number;
      now?: () => number;
    },
  ) {
    options.subscriber.on('message', (channel, message) => {
      if (channel === options.channels.ack) this.onAck(message);
    });
  }

  private onAck(message: string): void {
    if (message.length > MAX_ACK_BYTES) return;
    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      return;
    }
    const parsed = ackSchema.safeParse(json);
    if (!parsed.success) return;
    const waiting = this.pending.get(parsed.data.id);
    if (!waiting) return;
    this.pending.delete(parsed.data.id);
    clearTimeout(waiting.timer);
    const { ok, error } = parsed.data;
    const data = parsed.data.data ?? undefined;
    waiting.resolve(ok ? { ok: true, data } : { ok: false, error: error ?? 'failed', data });
  }

  /** Абонаментът е преди първия PUBLISH — иначе бърз отговор може да дойде преди слушателя. */
  private async ensureSubscribed(): Promise<void> {
    this.subscribed ??= this.options.subscriber.subscribe(this.options.channels.ack);
    try {
      await this.subscribed;
    } catch (error) {
      this.subscribed = null;
      throw error;
    }
  }

  async send(
    action: string,
    args: Record<string, string | number>,
    actor: string,
    options: SendOptions = {},
  ): Promise<CommandResult> {
    const now = this.options.now ?? Date.now;
    const payload = newPayload(action, args, actor, now());
    // Отказана команда (подпис, срок, повторен id) остава БЕЗ отговор — таймаутът е наш.
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? ACK_TIMEOUT_MS;
    try {
      await withTimeout(this.ensureSubscribed(), timeoutMs);
    } catch (error) {
      logger.warn({ err: errorText(error), action }, 'команда: абонаментът за отговор не стана');
      return { ok: false, error: 'redis' };
    }
    const answer = new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(payload.id);
        resolve({ ok: false, error: 'timeout' });
      }, timeoutMs);
      this.pending.set(payload.id, { resolve, timer });
    });
    try {
      const receivers = await this.options.publisher.publish(
        this.options.channels.cmd,
        envelope(this.options.key, payload),
      );
      // Никой не слуша (плъгинът/агентът не тича) — няма смисъл да чакаме 5 секунди.
      if (receivers === 0) this.settle(payload.id, { ok: false, error: 'no-listener' });
    } catch (error) {
      logger.warn({ err: errorText(error), action }, 'команда: PUBLISH не мина');
      this.settle(payload.id, { ok: false, error: 'redis' });
    }
    return answer;
  }

  private settle(id: string, result: CommandResult): void {
    const waiting = this.pending.get(id);
    if (!waiting) return;
    this.pending.delete(id);
    clearTimeout(waiting.timer);
    waiting.resolve(result);
  }
}

/** Изключен канал (няма ключ): всяка команда е отказана без мрежа — fail closed. */
export const UNAVAILABLE: CommandSender = {
  send: async () => ({ ok: false, error: 'unavailable' }),
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Известните откази → ключ на речника (`admin.cmd.*`); непознатото е общо „отказано“. */
const KNOWN_ERRORS: Record<string, string> = {
  timeout: 'timeout',
  'no-listener': 'noListener',
  redis: 'redis',
  unavailable: 'unavailable',
  busy: 'busy',
  'not online': 'notOnline',
  'not active': 'notActive',
  'unknown mode': 'unknownMode',
  'deathmatch api unavailable': 'unknownMode',
  // Плъгините (CONTRACT §14).
  restart: 'restart',
  'no default': 'noDefault',
  'not installed': 'notInstalled',
  'invalid json': 'invalidJson',
  'bad args': 'failed',
  failed: 'failed',
};

export function commandErrorKey(error: string): string {
  return KNOWN_ERRORS[error] ?? 'failed';
}
