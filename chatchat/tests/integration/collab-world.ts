import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Company, Tenant, User } from '@prisma/client';
import { SESSION_COOKIE } from '../../src/auth/sessions.js';
import { Client, db, makeUser, resetDb, signIn, type Harness } from './helpers.js';
import { MODEL } from './world.js';

/**
 * Фикстури за работното пространство (§12.3): клиент A с две фирми (портални техници от Alfa и
 * Beta) и персонал, клиент B — за кръстосан достъп. Без база знания: разговорите не я ползват,
 * случаите искат само продукта. Плюс SSE клиент, който чете потока като браузъра.
 */

export async function resetCollab(): Promise<void> {
  await resetDb();
  // Бързите отговори нямат връзка към Tenant — каскадата не ги стига.
  await db.$executeRawUnsafe('TRUNCATE TABLE "QuickResponse" RESTART IDENTITY CASCADE');
}

type Name =
  | 'support'
  | 'engineering'
  | 'owner'
  | 'internal'
  | 'tenantAdmin'
  | 'portalAlfa'
  | 'portalAlfa2'
  | 'portalBeta'
  | 'supportB'
  | 'portalB';

export interface CollabWorld {
  tenantA: Tenant;
  tenantB: Tenant;
  alfa: Company;
  beta: Company;
  users: Record<Name, User>;
  c: Record<Name, Client>;
}

export async function seedCollab(h: Harness): Promise<CollabWorld> {
  const tenantA = await db.tenant.create({ data: { slug: 'alfa-spa', name: 'Alfa Ascensori' } });
  const tenantB = await db.tenant.create({ data: { slug: 'beta-spa', name: 'Beta Ascensori' } });
  const alfa = await db.company.create({ data: { tenantId: tenantA.id, name: 'Alfa Srl' } });
  const beta = await db.company.create({ data: { tenantId: tenantA.id, name: 'Beta Srl' } });
  await db.product.create({ data: { tenantId: tenantA.id, family: 'LTX', model: MODEL } });
  const t = tenantA.id;
  const portalUser = (companyId: string, name: string) =>
    makeUser({ tenantId: t, role: 'PORTAL_TECHNICIAN', kind: 'PORTAL', companyId, name });
  const users: Record<Name, User> = {
    support: await makeUser({ tenantId: t, role: 'SUPPORT', name: 'Sara Supporto' }),
    engineering: await makeUser({ tenantId: t, role: 'ENGINEERING', name: 'Enzo Ingegnere' }),
    owner: await makeUser({ tenantId: t, role: 'KNOWLEDGE_OWNER', name: 'Olga Owner' }),
    internal: await makeUser({ tenantId: t, role: 'INTERNAL_TECHNICIAN', name: 'Ivo Interno' }),
    tenantAdmin: await makeUser({ tenantId: t, role: 'TENANT_ADMIN', name: 'Ada Admin' }),
    portalAlfa: await portalUser(alfa.id, 'Paolo Alfa'),
    portalAlfa2: await portalUser(alfa.id, 'Piero Alfa'),
    portalBeta: await portalUser(beta.id, 'Bruno Beta'),
    supportB: await makeUser({ tenantId: tenantB.id, role: 'SUPPORT', name: 'Sara B' }),
    portalB: await makeUser({
      tenantId: tenantB.id,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      name: 'Tecnico B',
    }),
  };
  const c = {} as Record<Name, Client>;
  for (const [name, user] of Object.entries(users) as Array<[Name, User]>) {
    c[name] = await signIn(h, user);
  }
  return { tenantA, tenantB, alfa, beta, users, c };
}

export const del = (c: Client, path: string, body?: unknown) => c.req('DELETE', path, body);

/** Нов разговор; проверява кода и връща id. */
export async function open(
  c: Client,
  body: Record<string, unknown>,
  status: number | number[] = 201,
): Promise<string> {
  const res = await c.post('/api/v1/conversations', body);
  const ok = Array.isArray(status) ? status.includes(res.status) : res.status === status;
  assert.ok(ok, `${res.status} ${JSON.stringify(res.body)}`);
  return res.body.conversation.id as string;
}

/** Съобщение; проверява 201 и връща изгледа му. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function say(
  c: Client,
  conversationId: string,
  text: string,
  extra = {},
): Promise<any> {
  const res = await c.post(`/api/v1/conversations/${conversationId}/messages`, {
    text,
    clientMessageId: randomUUID(),
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.message;
}

// ── SSE клиент ───────────────────────────────────────────────────────────────────────────────

export interface SseEvent {
  id: number;
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export interface Stream {
  status: number;
  contentType: string | null;
  events: SseEvent[];
  /** Сървърът е затворил потока. */
  closed: Promise<void>;
  isClosed(): boolean;
  waitFor(pred: (e: SseEvent) => boolean, ms?: number): Promise<SseEvent>;
  close(): void;
}

export async function openStream(c: Client): Promise<Stream> {
  const controller = new AbortController();
  const headers: Record<string, string> = { accept: 'text/event-stream' };
  if (c.cookie) headers.cookie = `${SESSION_COOKIE}=${c.cookie}`;
  const res = await fetch(`${c.base}/api/v1/events`, { headers, signal: controller.signal });
  const events: SseEvent[] = [];
  const waiters = new Set<() => void>();
  let done = false;
  const wake = () => waiters.forEach((w) => w());
  const closed = (async () => {
    if (res.status !== 200 || !res.body) {
      done = true;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const id = /^id: (\d+)$/m.exec(frame)?.[1];
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (id && event && data) events.push({ id: Number(id), event, data: JSON.parse(data) });
        }
        wake();
      }
    } catch {
      // прекъснато от close()
    } finally {
      done = true;
      wake();
    }
  })();
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    events,
    closed,
    isClosed: () => done,
    close: () => controller.abort(),
    waitFor(pred, ms = 3000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const hit = events.find(pred);
          if (hit) {
            cleanup();
            resolve(hit);
          } else if (done) {
            cleanup();
            reject(new Error('потокът е затворен преди очакваното събитие'));
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(
            new Error(`няма събитие до ${ms} ms; има: ${events.map((e) => e.event).join(', ')}`),
          );
        }, ms);
        const cleanup = () => {
          clearTimeout(timer);
          waiters.delete(check);
        };
        waiters.add(check);
        check();
      });
    },
  };
}

/** Изчаква, докато условието стане вярно (за затваряне на потоци и т.н.). */
export async function eventually(cond: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > until) throw new Error('условието не се изпълни навреме');
    await new Promise((r) => setTimeout(r, 20));
  }
}
