import type { Prisma, Tenant, User } from '@prisma/client';
import { db, makeUser } from './helpers.js';

/**
 * Познат малък набор за KPI (§16.1): случаите, AI отговорите, тикетите и оценките се пишат
 * директно в базата с точни времена — очакваните числа в `admin-kpi.test.ts` са сметнати на ръка.
 * Периодът е септември 2026 (UTC). Всички текстове са фиктивни.
 */

export const FROM = '2026-09-01T00:00:00.000Z';
export const TO = '2026-10-01T00:00:00.000Z';
const HOUR = 3_600_000;
const MIN = 60_000;

interface AiSpec {
  level: 'strong' | 'high' | 'weak' | 'conflict' | 'none';
  /** Минути след създаването на случая. */
  at?: number;
  recommend?: boolean;
  blocked?: boolean;
  removed?: string[];
  feedback?: Array<{ by: User; rating: 'USEFUL' | 'NOT_USEFUL' | 'TECHNICAL_ERROR' }>;
}

interface CaseSpec {
  tenant: Tenant;
  by: User;
  at: string;
  model?: string;
  /** Часове до потвърдения изход RESOLVED. */
  resolvedAfterH?: number;
  outcome?: 'NOT_RESOLVED';
  /** Тикет 30 мин. след създаването. */
  ticket?: boolean;
  takenBy?: User;
  ai?: AiSpec;
}

let seq = 0;

async function makeCase(spec: CaseSpec): Promise<void> {
  seq += 1;
  const created = new Date(spec.at);
  const resolved = spec.resolvedAfterH !== undefined;
  const c = await db.case.create({
    data: {
      tenantId: spec.tenant.id,
      number: `CASE-KPI-${seq}`,
      context: { productModel: spec.model ?? 'LTX-500' },
      createdById: spec.by.id,
      createdAt: created,
      assignedToId: spec.takenBy?.id ?? null,
      status: resolved ? 'RESOLVED' : spec.ticket ? 'WAITING_TECHNICIAN' : 'OPEN',
      outcome: resolved ? 'RESOLVED' : spec.ticket ? 'ESCALATED' : (spec.outcome ?? null),
      closedAt: resolved ? new Date(created.getTime() + (spec.resolvedAfterH ?? 0) * HOUR) : null,
    },
  });
  if (spec.takenBy) {
    await db.caseTimelineEvent.create({
      data: { caseId: c.id, type: 'case.assigned', actorId: spec.takenBy.id, at: created },
    });
  }
  if (spec.ticket) {
    await db.ticket.create({
      data: {
        caseId: c.id,
        number: `TS-KPI-${seq}`,
        reason: 'Motivo fittizio',
        summary: {},
        createdById: spec.by.id,
        createdAt: new Date(created.getTime() + 30 * MIN),
      },
    });
  }
  if (spec.ai) {
    const a = spec.ai;
    const payload: Prisma.InputJsonValue = {
      gate: {
        evidenceLevel: a.level,
        removedSteps: (a.removed ?? []).map((reason, i) => ({ step: i + 1, reason })),
        droppedCitations: [],
        decisions: a.removed ?? [],
      },
      safety: { level: a.blocked ? 'blocked' : 'standard', notes: [] },
      escalation: { recommended: a.recommend ?? false, reason: '', collect: [] },
    };
    const m = await db.caseMessage.create({
      data: {
        caseId: c.id,
        kind: 'AI',
        body: 'Risposta fittizia',
        payload,
        createdAt: new Date(created.getTime() + (a.at ?? 10) * MIN),
      },
    });
    for (const f of a.feedback ?? []) {
      await db.feedback.create({ data: { messageId: m.id, userId: f.by.id, rating: f.rating } });
    }
  }
}

const day = (d: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, d, 8, minute)).toISOString().replace('.000', '');

export interface KpiWorld {
  tenantA: Tenant;
  tenantB: Tenant;
  users: Record<
    | 'tech'
    | 'tech2'
    | 'portal'
    | 'support'
    | 'engineering'
    | 'owner'
    | 'tenantAdmin'
    | 'platform'
    | 'ownerB',
    User
  >;
}

/**
 * Клиент A, септември: 23 случая (22 × LTX-500 + 1 × LTX-900) и 15 AI отговора; извън периода —
 * 1 случай; клиент B — 1 случай. Подробно в `admin-kpi.test.ts`.
 */
export async function seedKpiWorld(): Promise<KpiWorld> {
  const tenantA = await db.tenant.create({ data: { slug: 'kpi-a', name: 'KPI A' } });
  const tenantB = await db.tenant.create({ data: { slug: 'kpi-b', name: 'KPI B' } });
  const t = tenantA.id;
  const users = {
    tech: await makeUser({ tenantId: t, role: 'INTERNAL_TECHNICIAN', name: 'Mario Rossi' }),
    tech2: await makeUser({ tenantId: t, role: 'INTERNAL_TECHNICIAN', name: 'Luca Bianchi' }),
    portal: await makeUser({ tenantId: t, role: 'PORTAL_TECHNICIAN', kind: 'PORTAL' }),
    support: await makeUser({ tenantId: t, role: 'SUPPORT', name: 'Giulia Verdi' }),
    engineering: await makeUser({ tenantId: t, role: 'ENGINEERING' }),
    owner: await makeUser({ tenantId: t, role: 'KNOWLEDGE_OWNER' }),
    tenantAdmin: await makeUser({ tenantId: t, role: 'TENANT_ADMIN' }),
    platform: await makeUser({ tenantId: t, role: 'PLATFORM_ADMIN' }),
    ownerB: await makeUser({ tenantId: tenantB.id, role: 'KNOWLEDGE_OWNER' }),
  };
  const { tech, tech2, support } = users;
  const A = { tenant: tenantA, by: tech };
  const useful = [{ by: tech, rating: 'USEFUL' as const }];
  const notUseful2 = [
    { by: tech, rating: 'NOT_USEFUL' as const },
    { by: tech2, rating: 'NOT_USEFUL' as const },
  ];
  const techErr = [{ by: tech, rating: 'TECHNICAL_ERROR' as const }];

  // R1…R5 — 2 септ., решени директно за 1…5 ч., strong, с махната стъпка (unsupported; R1 и directCommand).
  for (let i = 1; i <= 5; i++) {
    await makeCase({
      ...A,
      at: day(2, i),
      resolvedAfterH: i,
      ai: {
        level: 'strong',
        removed:
          i === 1
            ? [
                'gate.removed.unsupported',
                'gate.removed.directCommand',
                'gate.removed.directCommand',
              ]
            : ['gate.removed.unsupported'],
        feedback: useful,
      },
    });
  }
  // R6 — решен директно за 6 ч. (high); R7 — решен след тикет за 10 ч. (weak, без препоръка).
  await makeCase({
    ...A,
    at: day(3, 1),
    resolvedAfterH: 6,
    ai: { level: 'high', feedback: useful },
  });
  await makeCase({
    ...A,
    at: day(3, 2),
    resolvedAfterH: 10,
    ticket: true,
    ai: { level: 'weak', feedback: notUseful2 },
  });
  // R8 — решен след тикет за 20 ч.; R9 — поет от оператор, решен за 30 ч. (без AI).
  await makeCase({
    ...A,
    at: day(4),
    resolvedAfterH: 20,
    ticket: true,
    ai: { level: 'weak', feedback: notUseful2 },
  });
  await makeCase({ ...A, at: day(5), resolvedAfterH: 30, takenBy: support });
  // E1, E2, E3, E6, E7 — AI препоръчва ескалация ПРЕДИ тикета; няма доказателства; блокиран.
  for (const d of [6, 7, 8, 9, 10]) {
    await makeCase({
      ...A,
      at: day(d),
      ticket: true,
      ai: { level: 'none', recommend: true, blocked: true, feedback: techErr },
    });
  }
  // E4 — препоръката е СЛЕД тикета → решение на техника; E5, E8 — тикет без AI отговор.
  await makeCase({
    ...A,
    at: day(11),
    ticket: true,
    ai: { level: 'conflict', recommend: true, at: 40, feedback: [notUseful2[0]!] },
  });
  await makeCase({ ...A, at: day(12), ticket: true });
  await makeCase({ ...A, at: day(13), ticket: true });
  // N1 (с AI отговор без доказателства), N2 — изход NOT_RESOLVED; O1…O3 — отворени.
  await makeCase({ ...A, at: day(14), outcome: 'NOT_RESOLVED', ai: { level: 'none' } });
  await makeCase({ ...A, at: day(15), outcome: 'NOT_RESOLVED' });
  for (const d of [16, 17, 18]) await makeCase({ ...A, at: day(d) });
  // Друг модел — решен директно за 1 ч.
  await makeCase({ ...A, at: day(19), model: 'LTX-900', resolvedAfterH: 1 });

  // Извън периода (август) и чужд клиент — не се броят.
  await makeCase({
    ...A,
    at: '2026-08-20T08:00:00Z',
    resolvedAfterH: 1,
    ai: { level: 'strong', feedback: useful },
  });
  await makeCase({
    tenant: tenantB,
    by: users.ownerB,
    at: day(10),
    ticket: true,
    ai: { level: 'none', recommend: true, blocked: true },
  });
  return { tenantA, tenantB, users };
}
