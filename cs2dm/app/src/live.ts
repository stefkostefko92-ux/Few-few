import type { Redis } from 'ioredis';
import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Живото състояние на сървъра (CONTRACT.md §5): плъгинът пише `cs2dm:live` на всеки 5 s с EX 15.
 * Липсващ, повреден или остарял ключ = статусът е НЕИЗВЕСТЕН. Сайтът никога не казва „онлайн“,
 * без да го е прочел току-що от плъгина.
 */
export const LIVE_KEY = 'cs2dm:live';

/** По-стар запис от това не се показва като „на живо“ (ключът и без това живее 15 s). */
export const LIVE_MAX_AGE_MS = 60_000;

/** Таван на суровия низ преди JSON.parse — 128 слота по ~300 байта са далеч под него. */
const MAX_RAW_BYTES = 256 * 1024;

const liveSchema = z.object({
  ts: z.number().finite(),
  map: z.string().min(1).max(64),
  mode: z.string().max(64),
  maxPlayers: z.number().int().min(0).max(128),
  players: z.array(z.object({ isBot: z.boolean() })).max(128),
});

export type LiveStatus =
  | {
      known: true;
      map: string;
      mode: string;
      humans: number;
      bots: number;
      maxPlayers: number;
      updatedAt: Date;
    }
  | { known: false };

export const UNKNOWN: LiveStatus = { known: false };

/** Чиста функция: суров низ от Redis → статус. Всичко съмнително → неизвестен. */
export function parseLive(raw: string | null, now: number): LiveStatus {
  if (raw === null || raw.length === 0 || raw.length > MAX_RAW_BYTES) return UNKNOWN;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return UNKNOWN;
  }
  const parsed = liveSchema.safeParse(json);
  if (!parsed.success) return UNKNOWN;
  const data = parsed.data;
  const age = now - data.ts;
  if (age > LIVE_MAX_AGE_MS || age < -LIVE_MAX_AGE_MS) return UNKNOWN;
  const humans = data.players.filter((player) => !player.isBot).length;
  return {
    known: true,
    map: data.map,
    mode: data.mode,
    humans,
    bots: data.players.length - humans,
    maxPlayers: data.maxPlayers,
    updatedAt: new Date(data.ts),
  };
}

export interface LiveSource {
  get(): Promise<LiveStatus>;
}

/** Четене с таван на времето: бавен или паднал Redis прави статуса неизвестен, не страницата бавна. */
export class RedisLiveSource implements LiveSource {
  constructor(
    private readonly redis: Pick<Redis, 'get'>,
    private readonly timeoutMs = 800,
  ) {}

  async get(): Promise<LiveStatus> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const raw = await Promise.race([
        this.redis.get(LIVE_KEY),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), this.timeoutMs);
        }),
      ]);
      return parseLive(raw, Date.now());
    } catch (error) {
      logger.debug(
        { err: error instanceof Error ? error.message : String(error) },
        'живото състояние не се прочете от Redis',
      );
      return UNKNOWN;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
