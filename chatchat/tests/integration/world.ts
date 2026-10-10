import assert from 'node:assert/strict';
import type { Tenant, Company, User } from '@prisma/client';
import { Client, db, makeUser, signIn, type Harness } from './helpers.js';

/**
 * Фикстурите: клиент A (две фирми, портални и вътрешни роли) и клиент B. Знанието — продукти,
 * табла, документи, кодове за грешка — се създава през API-то на KNOWLEDGE_OWNER, не директно в
 * базата; потребителите — директно през Prisma (няма API за тях).
 */

export const MODEL = 'LTX-500';

/** Откъси, които тестовете цитират дословно. */
export const TEXT = {
  manualFw4: 'Il codice E37 indica che il cavo encoder non è collegato al morsetto X3.',
  manualFw5: "Il codice E37 indica sovratemperatura dell'inverter di trazione sul firmware cinque.",
  internal: 'Bollettino riservato: per E37 applicare la procedura interna ARCOBALENO.',
  procedure:
    'Procedura approvata: verificare il contatto porta di piano con il multimetro a impianto fermo.',
  otherProduct: 'Per il modello LTX-900 il codice E37 segnala il guasto ZEBRA del ventilatore.',
  draft: 'Documento in bozza con la parola FENICE che nessuno deve vedere.',
  tenantB: 'TENANT-B-SECRET: il codice E37 del cliente B indica un guasto riservato.',
} as const;

export interface DocSpec {
  code: string;
  revision?: string;
  type?: string;
  audience?: 'PORTAL' | 'INTERNAL' | 'ENGINEERING';
  safetyRelevant?: boolean;
  applicability?: Array<{
    productModel: string;
    hwRevision?: string;
    fwMin?: string;
    fwMax?: string;
  }>;
  pages: ReadonlyArray<{ page: number; text: string; section?: string }>;
  supersedesRevision?: string;
}

export function docBody(spec: DocSpec) {
  return {
    code: spec.code,
    title: `Documento ${spec.code}`,
    type: spec.type ?? 'MANUAL',
    language: 'it',
    revision: spec.revision ?? 'A',
    audience: spec.audience ?? 'PORTAL',
    safetyRelevant: spec.safetyRelevant ?? false,
    sourceFilename: `${spec.code}.pdf`,
    applicability: spec.applicability ?? [{ productModel: MODEL }],
    pages: spec.pages,
    ...(spec.supersedesRevision ? { supersedesRevision: spec.supersedesRevision } : {}),
  };
}

/** Качва документ, го праща за преглед и го публикува (с `approver`, ако е различен човек). */
export async function publishDoc(
  owner: Client,
  spec: DocSpec,
  approver: Client = owner,
): Promise<string> {
  const id = await uploadDoc(owner, spec);
  assert.equal((await owner.post(`/api/v1/admin/documents/${id}/submit`)).status, 204);
  const published = await approver.post(`/api/v1/admin/documents/${id}/publish`);
  assert.equal(published.status, 204, JSON.stringify(published.body));
  return id;
}

export async function uploadDoc(owner: Client, spec: DocSpec): Promise<string> {
  const res = await owner.post('/api/v1/admin/documents', docBody(spec));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.documentId as string;
}

export interface ErrorSpec {
  code: string;
  title: string;
  description: string;
  sourceDocumentId: string;
  sourcePage?: number;
  productModel?: string;
  fwMin?: string;
  fwMax?: string;
  hwRevision?: string;
  safetyRelevant?: boolean;
  relations?: Array<{
    kind: 'SYMPTOM' | 'CAUSE' | 'CHECK' | 'FIX';
    text: string;
    actionClass?: string;
  }>;
}

export async function publishError(owner: Client, spec: ErrorSpec): Promise<string> {
  const created = await owner.post('/api/v1/admin/errors', {
    productModel: spec.productModel ?? MODEL,
    severity: 'FAULT',
    safetyRelevant: false,
    relations: [],
    ...spec,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.errorId as string;
  const published = await owner.post(`/api/v1/admin/errors/${id}/publish`);
  assert.equal(published.status, 204, JSON.stringify(published.body));
  return id;
}

export interface World {
  tenantA: Tenant;
  tenantB: Tenant;
  alfa: Company;
  beta: Company;
  users: Record<
    | 'ownerA1'
    | 'ownerA2'
    | 'support'
    | 'internal'
    | 'portalAlfa'
    | 'portalBeta'
    | 'tenantAdmin'
    | 'ownerB'
    | 'portalB',
    User
  >;
  ownerA1: Client;
  ownerA2: Client;
  support: Client;
  internal: Client;
  portalAlfa: Client;
  portalBeta: Client;
  tenantAdmin: Client;
  ownerB: Client;
  portalB: Client;
  docs: {
    errList: string;
    manFw4: string;
    manFw5: string;
    internal: string;
    procedure: string;
    otherProduct: string;
    draft: string;
    tenantB: string;
  };
  errors: { e37v1: string; e37v2: string; e38: string; e73: string };
}

export async function seedWorld(h: Harness): Promise<World> {
  const tenantA = await db.tenant.create({ data: { slug: 'alfa-spa', name: 'Alfa Ascensori' } });
  const tenantB = await db.tenant.create({ data: { slug: 'beta-spa', name: 'Beta Ascensori' } });
  const alfa = await db.company.create({ data: { tenantId: tenantA.id, name: 'Alfa Srl' } });
  const beta = await db.company.create({ data: { tenantId: tenantA.id, name: 'Beta Srl' } });

  const t = tenantA.id;
  const users = {
    ownerA1: await makeUser({ tenantId: t, role: 'KNOWLEDGE_OWNER', name: 'Owner Uno' }),
    ownerA2: await makeUser({ tenantId: t, role: 'KNOWLEDGE_OWNER', name: 'Owner Due' }),
    support: await makeUser({ tenantId: t, role: 'SUPPORT', name: 'Supporto' }),
    internal: await makeUser({ tenantId: t, role: 'INTERNAL_TECHNICIAN', name: 'Interno' }),
    portalAlfa: await makeUser({
      tenantId: t,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      companyId: alfa.id,
      name: 'Tecnico Alfa',
    }),
    portalBeta: await makeUser({
      tenantId: t,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      companyId: beta.id,
      name: 'Tecnico Beta',
    }),
    tenantAdmin: await makeUser({ tenantId: t, role: 'TENANT_ADMIN', name: 'Admin Alfa' }),
    ownerB: await makeUser({ tenantId: tenantB.id, role: 'KNOWLEDGE_OWNER', name: 'Owner B' }),
    portalB: await makeUser({
      tenantId: tenantB.id,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      name: 'Tecnico B',
    }),
  };
  const clients = {
    ownerA1: await signIn(h, users.ownerA1),
    ownerA2: await signIn(h, users.ownerA2),
    support: await signIn(h, users.support),
    internal: await signIn(h, users.internal),
    portalAlfa: await signIn(h, users.portalAlfa),
    portalBeta: await signIn(h, users.portalBeta),
    tenantAdmin: await signIn(h, users.tenantAdmin),
    ownerB: await signIn(h, users.ownerB),
    portalB: await signIn(h, users.portalB),
  };
  const { ownerA1, ownerB } = clients;

  // Анаграфика: LTX-500 (две ревизии), LTX-900 (друг продукт), ZZ-100 (без знание).
  const product = async (c: Client, model: string, revisions: object[]) => {
    const res = await c.post('/api/v1/admin/products', { family: 'LTX', model, revisions });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  };
  await product(ownerA1, MODEL, [
    { hwRevision: 'B', fwMin: '4.0', fwMax: '4.9' },
    { hwRevision: 'C', fwMin: '5.0' },
  ]);
  await product(ownerA1, 'LTX-900', [{ hwRevision: 'A', fwMin: '1.0' }]);
  await product(ownerA1, 'ZZ-100', [{ hwRevision: 'A', fwMin: '1.0' }]);
  await product(ownerB, MODEL, [{ hwRevision: 'B', fwMin: '4.0' }]);

  const device = async (
    c: Client,
    serial: string,
    hwRevision: string,
    firmware: string,
    companyName?: string,
    productModel = MODEL,
  ) => {
    const res = await c.post('/api/v1/admin/devices', {
      serial,
      productModel,
      hwRevision,
      firmware,
      ...(companyName ? { companyName } : {}),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  };
  await device(ownerA1, 'SN-ALFA-1', 'B', '4.2', 'Alfa Srl');
  await device(ownerA1, 'SN-ALFA-2', 'C', '5.1', 'Alfa Srl');
  await device(ownerA1, 'SN-BETA-1', 'B', '4.2', 'Beta Srl');
  await device(ownerA1, 'SN-INT-1', 'B', '4.2');
  await device(ownerA1, 'SN-ZZ-1', 'A', '1.0', 'Alfa Srl', 'ZZ-100');
  await device(ownerB, 'SN-B-1', 'B', '4.2');

  // Знание. Документите по безопасност се публикуват от втори човек (четири очи).
  const FW4 = [{ productModel: MODEL, fwMin: '4.0', fwMax: '4.9' }];
  const FW5 = [{ productModel: MODEL, fwMin: '5.0' }];
  const errList = await publishDoc(ownerA1, {
    code: 'ERR-LIST-500',
    type: 'ERROR_LIST',
    pages: [{ page: 1, text: 'Elenco dei codici errore del quadro LTX-500.' }],
  });
  const manFw4 = await publishDoc(ownerA1, {
    code: 'MAN-500',
    revision: 'A',
    applicability: FW4,
    pages: [
      { page: 4, text: TEXT.manualFw4 },
      { page: 5, text: 'La velocità nominale con il firmware quattro è 1,0 m/s.' },
    ],
  });
  const manFw5 = await publishDoc(ownerA1, {
    code: 'MAN-500',
    revision: 'B',
    applicability: FW5,
    pages: [{ page: 4, text: TEXT.manualFw5 }],
  });
  const internal = await publishDoc(ownerA1, {
    code: 'INT-BULL-001',
    type: 'BULLETIN',
    audience: 'INTERNAL',
    pages: [{ page: 1, text: TEXT.internal }],
  });
  const procedure = await publishDoc(
    ownerA1,
    {
      code: 'PROC-DOOR-001',
      type: 'PROCEDURE',
      safetyRelevant: true,
      pages: [{ page: 2, text: TEXT.procedure }],
    },
    clients.ownerA2,
  );
  const otherProduct = await publishDoc(ownerA1, {
    code: 'FAQ-900',
    type: 'FAQ',
    applicability: [{ productModel: 'LTX-900' }],
    pages: [{ page: 1, text: TEXT.otherProduct }],
  });
  const draft = await uploadDoc(ownerA1, {
    code: 'MAN-DRAFT',
    pages: [{ page: 1, text: TEXT.draft }],
  });
  const tenantBDoc = await publishDoc(ownerB, {
    code: 'MAN-500',
    pages: [{ page: 1, text: TEXT.tenantB }],
  });

  const e37v1 = await publishError(ownerA1, {
    code: 'E37',
    title: 'Guasto encoder',
    description: 'Cavo encoder scollegato dal morsetto X3 (E37 versione quattro).',
    fwMin: '4.0',
    fwMax: '4.9',
    sourceDocumentId: errList,
    sourcePage: 1,
    relations: [
      { kind: 'CAUSE', text: 'Cavo encoder scollegato' },
      {
        kind: 'CHECK',
        text: 'Verificare il cavo encoder al morsetto X3',
        actionClass: 'DIAGNOSTIC',
      },
    ],
  });
  const e37v2 = await publishError(ownerA1, {
    code: 'E37',
    title: 'Sovratemperatura inverter',
    description: 'Temperatura eccessiva del modulo inverter (E37 versione cinque).',
    fwMin: '5.0',
    sourceDocumentId: errList,
    sourcePage: 1,
  });
  const e38 = await publishError(ownerA1, {
    code: 'E38',
    title: 'Sovratemperatura motore',
    description: 'Il motore di trazione supera la temperatura ammessa (E38).',
    fwMin: '4.0',
    sourceDocumentId: errList,
  });
  const e73 = await publishError(ownerA1, {
    code: 'E73',
    title: 'Errore comunicazione cabina',
    description: 'Comunicazione seriale con la cabina interrotta (E73).',
    fwMin: '4.0',
    sourceDocumentId: errList,
  });

  return {
    tenantA,
    tenantB,
    alfa,
    beta,
    users,
    ...clients,
    docs: {
      errList,
      manFw4,
      manFw5,
      internal,
      procedure,
      otherProduct,
      draft,
      tenantB: tenantBDoc,
    },
    errors: { e37v1, e37v2, e38, e73 },
  };
}

// ── Помощници за случаи ──────────────────────────────────────────────────────────────────────

export const baseContext = {
  productModel: MODEL,
  hardwareRevision: 'B',
  firmware: '4.2',
  serial: null,
  errorCode: 'E37',
};

export async function newCase(
  c: Client,
  body: { deviceSerial?: string; context?: Partial<typeof baseContext> } = {},
): Promise<string> {
  const res = await c.post('/api/v1/sessions', {
    context: { ...baseContext, ...body.context },
    ...(body.deviceSerial ? { deviceSerial: body.deviceSerial } : {}),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.case.id as string;
}

export interface AskOpts {
  clientMessageId?: string;
  askAi?: boolean;
}

export function ask(c: Client, caseId: string, text: string, opts: AskOpts = {}) {
  return c.post('/api/v1/chat/messages', { caseId, text, ...opts });
}

/** Отговорът на AI от `POST /chat/messages` — payload е DiagnosticAnswer след Gate. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const answerOf = (res: { status?: number; body: any }) => {
  if (!res.body?.answer) throw new Error(`няма отговор: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.answer.payload;
};
