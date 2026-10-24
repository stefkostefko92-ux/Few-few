/**
 * Общото за интеграционните тестове на панела: браузър с бисквитки, вход през двойник на Steam
 * (нула заявки към Steam), записване на TOTP и двойници на плъгина/агента, които проверяват
 * подписа точно като C# (HMAC върху низа p) и отговарят по id. Отказан подпис — без отговор.
 */
import { randomBytes } from 'node:crypto';
import type { PrismaClient, Role } from '@prisma/client';
import { Redis } from 'ioredis';
import { RedisCommandChannel, type CommandSender } from '../src/admin/commands.js';
import { hmacHex } from '../src/admin/crypto.js';
import type { FetchLike } from '../src/admin/steam-openid.js';
import { base32Decode, totpAt, totpStep } from '../src/admin/totp.js';
import type { AdminLiveSource, LivePlayer } from '../src/live.js';
import { decode, fakeRepo, sampleData, start, type Running } from './helpers.js';

export const enabled =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes('127.0.0.1:1/');
export const REDIS_TEST_URL = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379/15';

export const STEAM_VALID = 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n';
export const steamOk: FetchLike = async () => new Response(STEAM_VALID);

export interface Received {
  action: string;
  args: Record<string, unknown>;
  actor: string;
}
export type Answer = { ok: boolean; error?: string; data?: unknown } | null;

/** Двойник на C# плъгина или на cs2-agent върху истинския Redis pub/sub. */
export async function fakePeer(
  channels: { cmd: string; ack: string },
  key: string,
  answer: (command: Received) => Answer,
) {
  const sub = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: 1 });
  const pub = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: 1 });
  const received: Received[] = [];
  await sub.subscribe(channels.cmd);
  sub.on('message', (_channel: string, message: string) => {
    const envelope = JSON.parse(message) as { p: string; sig: string };
    if (hmacHex(key, envelope.p) !== envelope.sig) return; // чужд ключ (друг тестов файл) — мълчи
    const payload = JSON.parse(envelope.p) as Received & { id: string };
    received.push({ action: payload.action, args: payload.args, actor: payload.actor });
    const result = answer(payload);
    if (result) void pub.publish(channels.ack, JSON.stringify({ id: payload.id, ...result }));
  });
  return {
    received,
    close: () => {
      sub.disconnect();
      pub.disconnect();
    },
  };
}

/** Живото състояние в паметта — ключовете в Redis са общи за паралелните тестови файлове. */
export function memoryLive(players: LivePlayer[]): AdminLiveSource & { players: LivePlayer[] } {
  const live = {
    players,
    get: async () => ({ known: false }) as const,
    snapshot: async () => ({ status: { known: false } as const, players: live.players }),
  };
  return live;
}

export function livePlayer(steamId: string | null, name: string, role = 'PLAYER'): LivePlayer {
  return {
    steamId,
    name,
    kills: 1,
    deaths: 1,
    ping: 20,
    alive: true,
    isBot: steamId === null,
    vip: false,
    role,
    level: steamId ? 2 : null,
  };
}

/** Каналът към двойника — същият клас като в продукция, с ключа на теста. */
export function channel(channels: { cmd: string; ack: string }, key: string) {
  const publisher = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: 1 });
  const subscriber = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: 1 });
  const sender = new RedisCommandChannel({ publisher, subscriber, channels, key, timeoutMs: 3000 });
  return {
    sender,
    close: () => {
      publisher.disconnect();
      subscriber.disconnect();
    },
  };
}

export function testKey(): string {
  return randomBytes(24).toString('hex');
}

export function panelApp(input: {
  db: PrismaClient;
  live: AdminLiveSource;
  bridge: CommandSender;
  agent: CommandSender;
  steamFetch?: FetchLike;
}): Promise<Running> {
  return start({
    repo: fakeRepo(sampleData()),
    admin: {
      ...input,
      steamFetch: input.steamFetch ?? steamOk,
      limits: { login: 1000, mfa: 1000, post: 1000 },
    },
  });
}

/** Браузър: пази бисквитките, не следва пренасочванията. */
export class Browser {
  readonly cookies = new Map<string, string>();
  constructor(readonly base: string) {}

  private store(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attrs] = header.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    }
    const response = await fetch(`${this.base}${path}`, { ...init, headers, redirect: 'manual' });
    this.store(response);
    return response;
  }

  get(path: string): Promise<Response> {
    return this.request(path);
  }

  post(path: string, body: Record<string, string>, headers: Record<string, string> = {}) {
    return this.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(body).toString(),
    });
  }

  /** CSRF токенът от последната отворена страница на панела. */
  async csrf(path = '/admin/account'): Promise<string> {
    const html = await (await this.get(path)).text();
    const found = /name="_csrf" value="([^"]+)"/.exec(html);
    if (!found?.[1]) throw new Error(`няма CSRF токен на ${path}`);
    return found[1];
  }

  /** POST с токена на сесията (взет от `from`). */
  async send(path: string, body: Record<string, string> = {}, from = '/admin/account') {
    return this.post(path, { _csrf: await this.csrf(from), ...body });
  }
}

/** Входът със Steam докрай: към Steam → „отговорът“ на Steam → сесия (TOTP още не е минат). */
export async function steamLogin(browser: Browser, steamId: string): Promise<Response> {
  const go = await browser.get('/admin/login/steam');
  const returnTo = new URL(go.headers.get('location') ?? '').searchParams.get('openid.return_to');
  if (!returnTo) throw new Error('няма return_to');
  const claimed = `https://steamcommunity.com/openid/id/${steamId}`;
  const query = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': claimed,
    'openid.identity': claimed,
    'openid.return_to': returnTo,
    'openid.response_nonce': `${new Date().toISOString().slice(0, 19)}Z${randomBytes(4).toString('hex')}`,
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': randomBytes(20).toString('base64'),
  });
  const nonce = new URL(returnTo).searchParams.get('n') ?? '';
  return browser.get(`/admin/login/return?n=${nonce}&${query.toString()}`);
}

export function codeFor(secret: string, offsetSteps = 0): string {
  return codeAt(secret, totpStep(Date.now() / 1000) + offsetSteps);
}

export function codeAt(secret: string, step: number): string {
  return totpAt(base32Decode(secret), step);
}

/** Пълно записване на TOTP: вход → QR/ключ → код → резервни кодове. */
export async function enrol(browser: Browser, steamId: string) {
  const login = await steamLogin(browser, steamId);
  if (login.headers.get('location') !== '/admin/2fa/setup') {
    throw new Error(`входът на ${steamId}: ${login.status} ${login.headers.get('location')}`);
  }
  const html = await (await browser.get('/admin/2fa/setup')).text();
  const secret = (/class="a-secret"><code>([A-Z2-7 ]+)<\/code>/.exec(html)?.[1] ?? '').replace(
    / /g,
    '',
  );
  const csrf = /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
  const done = await browser.post('/admin/2fa/setup', { _csrf: csrf, code: codeFor(secret) });
  const codes = [
    ...decode(await done.text()).matchAll(/<code>([a-z0-9]{5}-[a-z0-9]{5})<\/code>/g),
  ].map((m) => m[1]!);
  if (codes.length !== 10) throw new Error(`записването на ${steamId} не мина (${done.status})`);
  return { secret, codes };
}

export async function makePlayers(
  db: PrismaClient,
  rows: Array<{ steamId: string; name: string; role: Role }>,
): Promise<void> {
  await db.player.createMany({ data: rows });
}

/** Чистене: каскадата трие сесии, наказания (и обжалванията им), VIP, TOTP кодове. Одитът остава. */
export async function cleanup(db: PrismaClient, ids: string[]): Promise<void> {
  await db.report.deleteMany({ where: { targetSteamId: { in: ids } } });
  await db.vipGrant.deleteMany({ where: { steamId: { in: ids } } });
  await db.player.deleteMany({ where: { steamId: { in: ids } } });
}
