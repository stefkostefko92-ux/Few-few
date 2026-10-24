import type { Redis } from 'ioredis';
import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Живото състояние на сървъра. Два източника, по ред (CONTRACT.md §5 и §9):
 * 1. `cs2dm:live` от C# плъгина (на 5 s, EX 15) — пресен, ако е по-млад от 60 s;
 * 2. `cs2dm:a2s` от cs2-agent на хоста (на 10 s, EX 30) — пресен, ако е по-млад от 30 s; казва и
 *    „изключен“, когато сървърът не отговаря на A2S (празният сървър спи и плъгинът мълчи);
 * 3. иначе статусът е НЕИЗВЕСТЕН. Сайтът никога не казва „онлайн“, без да го е прочел току-що.
 */
export const LIVE_KEY = 'cs2dm:live';
export const A2S_KEY = 'cs2dm:a2s';

/** По-стар запис на плъгина от това не се показва като „на живо“ (ключът и без това живее 15 s). */
export const LIVE_MAX_AGE_MS = 60_000;
/** По-стар запис на агента от това не се показва (ключът живее 30 s). */
export const A2S_MAX_AGE_MS = 30_000;

/** Таван на суровия низ преди JSON.parse — 128 слота по ~300 байта са далеч под него. */
const MAX_RAW_BYTES = 256 * 1024;

const livePlayerSchema = z.object({
  // Ботовете са с null (§5); всичко, което не е SteamID64, се третира като „без SteamID“.
  steamId: z
    .string()
    .max(32)
    .nullable()
    .transform((id) => (id !== null && /^7656119\d{10}$/.test(id) ? id : null)),
  name: z.string().max(128),
  kills: z.number().int(),
  deaths: z.number().int(),
  ping: z.number().int().min(0).max(10_000),
  alive: z.boolean(),
  isBot: z.boolean(),
  vip: z.boolean(),
  role: z.string().max(16),
  level: z.number().int().min(0).nullable(),
});

const liveSchema = z.object({
  ts: z.number().finite(),
  map: z.string().min(1).max(64),
  mode: z.string().max(64),
  maxPlayers: z.number().int().min(0).max(128),
  players: z.array(z.object({ isBot: z.boolean() })).max(128),
});

const a2sSchema = z.object({
  ts: z.number().finite(),
  online: z.boolean(),
  name: z.string().max(256).nullish(),
  map: z.string().min(1).max(64).nullish(),
  players: z.number().int().min(0).max(255).nullish(),
  bots: z.number().int().min(0).max(255).nullish(),
  maxPlayers: z.number().int().min(0).max(255).nullish(),
});

export type LivePlayer = z.infer<typeof livePlayerSchema>;

export type LiveStatus =
  | {
      known: true;
      online: true;
      source: 'plugin' | 'a2s';
      map: string;
      /** Режимът на DM — A2S не го знае (празен низ). */
      mode: string;
      humans: number;
      bots: number;
      maxPlayers: number;
      updatedAt: Date;
    }
  | { known: true; online: false; source: 'a2s'; updatedAt: Date }
  | { known: false };

export const UNKNOWN: LiveStatus = { known: false };

function readJson(raw: string | null): unknown {
  if (raw === null || raw.length === 0 || raw.length > MAX_RAW_BYTES) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function fresh(ts: number, now: number, maxAge: number): boolean {
  const age = now - ts;
  return age <= maxAge && age >= -maxAge;
}

/** Чиста функция: суров `cs2dm:live` → статус. Всичко съмнително → неизвестен. */
export function parseLive(raw: string | null, now: number): LiveStatus {
  const parsed = liveSchema.safeParse(readJson(raw));
  if (!parsed.success || !fresh(parsed.data.ts, now, LIVE_MAX_AGE_MS)) return UNKNOWN;
  const data = parsed.data;
  const humans = data.players.filter((player) => !player.isBot).length;
  return {
    known: true,
    online: true,
    source: 'plugin',
    map: data.map,
    mode: data.mode,
    humans,
    bots: data.players.length - humans,
    maxPlayers: data.maxPlayers,
    updatedAt: new Date(data.ts),
  };
}

/** Чиста функция: суров `cs2dm:a2s` → статус. `players` в A2S включва ботовете. */
export function parseA2s(raw: string | null, now: number): LiveStatus {
  const parsed = a2sSchema.safeParse(readJson(raw));
  if (!parsed.success || !fresh(parsed.data.ts, now, A2S_MAX_AGE_MS)) return UNKNOWN;
  const data = parsed.data;
  const updatedAt = new Date(data.ts);
  if (!data.online) return { known: true, online: false, source: 'a2s', updatedAt };
  if (!data.map || data.maxPlayers === null || data.maxPlayers === undefined) return UNKNOWN;
  const bots = data.bots ?? 0;
  return {
    known: true,
    online: true,
    source: 'a2s',
    map: data.map,
    mode: '',
    humans: Math.max(0, (data.players ?? 0) - bots),
    bots,
    maxPlayers: data.maxPlayers,
    updatedAt,
  };
}

/** Редът на източниците: пресният запис на плъгина, после агентът, после „неизвестен“. */
export function pickStatus(live: string | null, a2s: string | null, now: number): LiveStatus {
  const fromPlugin = parseLive(live, now);
  return fromPlugin.known ? fromPlugin : parseA2s(a2s, now);
}

/**
 * Играчите на живо — само за панела (публичният сайт не показва списъка). null = няма пресен
 * запис от плъгина; повреден ред се пропуска, вместо да скрие всички.
 */
export function parseLivePlayers(raw: string | null, now: number): LivePlayer[] | null {
  const json = readJson(raw);
  const head = liveSchema.safeParse(json);
  if (!head.success || !fresh(head.data.ts, now, LIVE_MAX_AGE_MS)) return null;
  const list = (json as { players: unknown[] }).players;
  return list.flatMap((item) => {
    const player = livePlayerSchema.safeParse(item);
    return player.success ? [player.data] : [];
  });
}

export interface LiveSource {
  get(): Promise<LiveStatus>;
}

export interface AdminLiveSource extends LiveSource {
  snapshot(): Promise<{ status: LiveStatus; players: LivePlayer[] | null }>;
}

/** Четене с таван на времето: бавен или паднал Redis прави статуса неизвестен, не страницата бавна. */
export class RedisLiveSource implements AdminLiveSource {
  constructor(
    private readonly redis: Pick<Redis, 'mget'>,
    private readonly timeoutMs = 800,
  ) {}

  private async read(): Promise<[string | null, string | null]> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const values = await Promise.race([
        this.redis.mget(LIVE_KEY, A2S_KEY),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), this.timeoutMs);
        }),
      ]);
      return [values[0] ?? null, values[1] ?? null];
    } catch (error) {
      logger.debug(
        { err: error instanceof Error ? error.message : String(error) },
        'живото състояние не се прочете от Redis',
      );
      return [null, null];
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async get(): Promise<LiveStatus> {
    const [live, a2s] = await this.read();
    return pickStatus(live, a2s, Date.now());
  }

  async snapshot(): Promise<{ status: LiveStatus; players: LivePlayer[] | null }> {
    const [live, a2s] = await this.read();
    const now = Date.now();
    return { status: pickStatus(live, a2s, now), players: parseLivePlayers(live, now) };
  }
}
