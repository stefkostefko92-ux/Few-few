import assert from 'node:assert/strict';
import type { Tenant, User } from '@prisma/client';
import { processDeliveries } from '../../src/services/integrations/outbox.js';
import type { IntegrationDeps } from '../../src/services/integrations/deps.js';
import { SecretKeyring } from '../../src/services/integrations/secrets.js';
import { signChatChat } from '../../src/services/integrations/signature.js';
import type { NetPolicy } from '../../src/services/integrations/ssrf.js';
import type { FakeHelpdesk } from './helpdesk-fake.js';
import { db, makeUser, ORIGIN, signIn, type Client, type Harness } from './helpers.js';

/**
 * Светът на интеграцията с helpdesk: два клиента, администратор и поддръжка във всеки, техник с
 * лични данни в свободния текст (за проверката на минимизацията), помощници за тикет, конектор,
 * изпращача и входящо известие.
 */

export const KEK = Buffer.alloc(32, 9);
export const SIGNING = 'signing-secret-'.padEnd(48, 'x');
export const INBOUND = 'inbound-secret-'.padEnd(48, 'y');
export const ZD_TOKEN = 'zendesk-oauth-token-'.padEnd(40, 'z');
export const TECH_NAME = 'Mario Rossi Tecnico';
export const TECH_EMAIL = 'mario.rossi@cliente.example';
export const SECRET_PHONE = '3331234567';

const silent = { info: () => undefined, warn: () => undefined };

/** Отпуснатата мрежова политика (локален фалшив сървър) — само в тестовете, от код. */
export function localDeps(
  fake: FakeHelpdesk,
  over: Partial<IntegrationDeps> = {},
): IntegrationDeps {
  return {
    keyring: new SecretKeyring(KEK),
    net: { allowInsecureLocal: true, timeoutMs: 3000, maxResponseBytes: 256 * 1024 },
    baseUrl: ORIGIN,
    inboundToleranceSeconds: 300,
    maxAttempts: 3,
    logDays: 90,
    zendeskOrigin: () => fake.base,
    ...over,
  };
}

/** Продукцията: само https и публични адреси (DNS — по желание фалшив). */
export function strictDeps(net: Partial<NetPolicy> = {}): IntegrationDeps {
  return {
    keyring: new SecretKeyring(KEK),
    net: { allowInsecureLocal: false, timeoutMs: 2000, maxResponseBytes: 64 * 1024, ...net },
    baseUrl: ORIGIN,
    inboundToleranceSeconds: 300,
    maxAttempts: 3,
    logDays: 90,
  };
}

export interface HelpdeskWorld {
  tenantA: Tenant;
  tenantB: Tenant;
  techA: User;
  supportA: User;
  adminA: Client;
  adminB: Client;
  support: Client;
  tech: Client;
  techB: Client;
}

export async function seedHelpdeskWorld(h: Harness): Promise<HelpdeskWorld> {
  const tenantA = await db.tenant.create({ data: { slug: 'alfa-spa', name: 'Alfa Ascensori' } });
  const tenantB = await db.tenant.create({ data: { slug: 'beta-spa', name: 'Beta Ascensori' } });
  for (const t of [tenantA, tenantB]) {
    await db.product.create({ data: { tenantId: t.id, family: 'LTX', model: 'LTX-500' } });
  }
  const techA = await makeUser({
    tenantId: tenantA.id,
    role: 'INTERNAL_TECHNICIAN',
    name: TECH_NAME,
    email: TECH_EMAIL,
  });
  const supportA = await makeUser({ tenantId: tenantA.id, role: 'SUPPORT', name: 'Sara Supporto' });
  const adminA = await makeUser({ tenantId: tenantA.id, role: 'TENANT_ADMIN', name: 'Ada Admin' });
  const adminB = await makeUser({ tenantId: tenantB.id, role: 'TENANT_ADMIN', name: 'Bea Admin' });
  const techB = await makeUser({
    tenantId: tenantB.id,
    role: 'INTERNAL_TECHNICIAN',
    name: 'Tec B',
  });
  return {
    tenantA,
    tenantB,
    techA,
    supportA,
    adminA: await signIn(h, adminA),
    adminB: await signIn(h, adminB),
    support: await signIn(h, supportA),
    tech: await signIn(h, techA),
    techB: await signIn(h, techB),
  };
}

/** Случай + тикет от техника; в свободния текст — лични данни, които НЕ трябва да излязат навън. */
export async function openTicket(
  tech: Client,
): Promise<{ id: string; number: string; caseId: string }> {
  const created = await tech.post('/api/v1/sessions', {
    context: {
      productModel: 'LTX-500',
      hardwareRevision: 'B',
      firmware: '4.2',
      serial: 'SN-ALFA-77',
      errorCode: 'E37',
      phase: 'doors',
      symptoms: [`Porta bloccata, chiamare ${TECH_EMAIL}`],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const caseId = created.body.case.id as string;
  const ticket = await tech.post('/api/v1/tickets', {
    caseId,
    reason: `Serve un operatore, sono ${TECH_NAME} tel ${SECRET_PHONE}`,
  });
  assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
  return { id: ticket.body.ticket.id, number: ticket.body.ticket.number, caseId };
}

export async function claim(support: Client, ticketId: string): Promise<void> {
  const res = await support.post(`/api/v1/tickets/${ticketId}/claim`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

export async function closeTicket(support: Client, ticketId: string): Promise<void> {
  const res = await support.post(`/api/v1/tickets/${ticketId}/close`, {
    rootCause: 'Contatto porta ossidato',
    solution: 'Pulito il contatto',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

export async function configure(admin: Client, body: Record<string, unknown>) {
  return admin.req('PUT', '/api/v1/admin/integrations', body);
}

export async function configureWebhook(admin: Client, fake: FakeHelpdesk, inbound = true) {
  const res = await configure(admin, {
    kind: 'WEBHOOK',
    enabled: true,
    settings: { url: `${fake.base}/hook`, language: 'it' },
    secrets: { signingSecret: SIGNING, ...(inbound ? { inboundSecret: INBOUND } : {}) },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.integration as { inboundUrl: string };
}

/** Изпращачът до празно (порциите взимат само главата на всеки тикет). */
export async function drain(deps: IntegrationDeps, now = new Date()): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const r = await processDeliveries({ db, integrations: deps, logger: silent }, now);
    if (r.claimed === 0) return;
  }
}

export const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

/** Входящо известие по общия webhook, подписано с тайната. */
export async function sendInbound(
  base: string,
  inboundUrl: string,
  body: unknown,
  opts: { secret?: string; ts?: number; delivery?: string; raw?: string } = {},
) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const path = new URL(inboundUrl).pathname;
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chatchat-timestamp': String(ts),
      'x-chatchat-signature': signChatChat(opts.secret ?? INBOUND, ts, raw),
      ...(opts.delivery ? { 'x-chatchat-delivery': opts.delivery } : {}),
    },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}
