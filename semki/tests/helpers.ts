// Фалшиви зависимости за тестовете на дашборда: гилдия, OAuth, изпращач и тих логер.
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { pino } from 'pino';
import type { MemberFacts } from '../src/domain/access.js';
import type { GuildDirectory, GuildItem } from '../src/discord/guild.js';
import type { AlertSender } from '../src/services/notifier.js';
import { createWebApp } from '../src/web/app.js';
import type { WebDeps } from '../src/web/context.js';
import type { DiscordIdentity, OAuthClient } from '../src/web/oauth.js';

export const SECRET = 'a'.repeat(64);
export const BASE = 'http://127.0.0.1';
export const USER_ID = '100000000000000001';
export const CHANNEL: GuildItem = { id: '111111111111111111', name: '#семки', usable: true };
export const ROLE: GuildItem = { id: '222222222222222222', name: '@Фермери', usable: true };

export interface FakeGuild extends GuildDirectory {
  members: Map<string, MemberFacts>;
}

export function fakeGuild(): FakeGuild {
  const members = new Map<string, MemberFacts>();
  return {
    members,
    ready: () => true,
    channels: () => [CHANNEL],
    roles: () => [ROLE],
    memberFacts: async (id) => members.get(id) ?? null,
  };
}

export function fakeOAuth(identity: DiscordIdentity): OAuthClient {
  return {
    authorizeUrl: (state) => `https://discord.com/oauth2/authorize?state=${state}`,
    identify: async (code) => {
      if (code !== 'good-code') throw new Error('bad code');
      return identity;
    },
  };
}

export interface SentMessage {
  channelId: string;
  roleId: string;
  content: string;
  ping: boolean;
}

// fail: true — всяко изпращане пада; число N — първите N минават, следващите падат.
export function fakeSender(sent: SentMessage[] = [], fail: boolean | number = false): AlertSender {
  let calls = 0;
  return {
    async send(channelId, roleId, content, ping = true) {
      calls += 1;
      if (fail === true || (typeof fail === 'number' && calls > fail))
        throw new Error('Missing Access');
      sent.push({ channelId, roleId, content, ping });
    },
  };
}

export const silentLog = pino({ level: 'silent' });

// База, която гърми при всяко докосване — за маршрути, които не бива да стигат до нея.
export const noDb = new Proxy(
  {},
  {
    get() {
      throw new Error('тестът не очаква достъп до базата');
    },
  },
) as PrismaClient;

export async function startApp(over: Partial<WebDeps> = {}) {
  const deps: WebDeps = {
    db: noDb,
    guild: fakeGuild(),
    oauth: fakeOAuth({ id: USER_ID, name: 'Тестер', avatarUrl: null }),
    sender: fakeSender(),
    log: silentLog,
    publicBaseUrl: BASE,
    sessionSecret: SECRET,
    trustProxy: 'loopback',
    health: async () => ({ db: true, discord: 'ready' }),
    ...over,
  };
  const app = createWebApp(deps);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const url = `${BASE}:${port}`;
  return {
    url,
    deps,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Бисквитките от Set-Cookie → заглавие Cookie (само име=стойност).
export function cookieJar(res: Response, jar = new Map<string, string>()): Map<string, string> {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (!pair || eq < 0) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (value === '' || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
  return jar;
}

export function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

// Пълният вход: /auth/discord → state бисквитка → /auth/callback с добрия код.
export async function login(url: string): Promise<Map<string, string>> {
  const start = await fetch(`${url}/auth/discord`, { redirect: 'manual' });
  const jar = cookieJar(start);
  const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? '';
  const cb = await fetch(`${url}/auth/callback?code=good-code&state=${encodeURIComponent(state)}`, {
    redirect: 'manual',
    headers: { cookie: cookieHeader(jar) },
  });
  if (cb.status !== 302) throw new Error(`входът върна ${cb.status}`);
  return cookieJar(cb, jar);
}

export function csrfFrom(html: string): string {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!m?.[1]) throw new Error('няма CSRF токен в страницата');
  return m[1];
}
