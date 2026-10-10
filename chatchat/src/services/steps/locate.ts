import type { Audience, Prisma, PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import { caseAudiences, coversAudiences } from '../../auth/rbac.js';
import { sha256 } from '../../crypto.js';
import { ACTION_CLASSES } from '../../domain/response.js';

/**
 * Стъпка от AI отговор (§10.2 „Verifiche“), както я вижда човекът: само от AI съобщение на ТОЗИ
 * случай и само ако читателят има всички аудитории, с които е търсено (AC-18) — иначе „няма
 * такава“. Отговорът е записан след Safety Gate и не се променя; хешът е на текста на стъпката.
 */

const StepPayloadSchema = z.object({
  checks: z.array(
    z.object({
      step: z.number().int(),
      action: z.string(),
      expected: z.string(),
      actionClass: z.enum(ACTION_CLASSES),
      evidenceRefs: z.array(z.string()).default([]),
      requiresConfirmation: z.boolean().default(false),
    }),
  ),
  evidence: z
    .array(
      z.object({
        ref: z.string(),
        documentId: z.string(),
        documentCode: z.string(),
        revision: z.string(),
        page: z.number().int().nullable(),
        chunkId: z.string().nullable().default(null),
        errorId: z.string().nullable().default(null),
      }),
    )
    .default([]),
  promptVersion: z.string().default(''),
});
export type StepPayload = z.infer<typeof StepPayloadSchema>;
export type StepCheck = StepPayload['checks'][number];

/** Изходът е недоверен: стари/повредени payload-и просто нямат стъпки. */
export function parseStepPayload(payload: Prisma.JsonValue | null): StepPayload | null {
  const parsed = StepPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** SHA-256 на текста на стъпката — разрешението и изпълнението са вързани към ТОЗИ текст. */
export function stepHash(check: Pick<StepCheck, 'action' | 'expected'>): string {
  return sha256(`${check.action}\n${check.expected}`);
}

/** „prompt-…+gate-…“ → версията на Safety Gate, дал стъпката (AC-09). */
export function gateVersionOf(promptVersion: string): string {
  const tail = promptVersion.split('+').at(-1) ?? '';
  return tail.startsWith('gate-') ? tail : 'unknown';
}

export interface StepSource {
  ref: string;
  documentId: string;
  documentCode: string;
  revision: string;
  page: number | null;
  chunkId: string | null;
  errorId: string | null;
}

/** Източниците, които документират стъпката (цитатите ѝ от отговора) — без текста на откъса. */
export function sourcesOf(payload: StepPayload, check: StepCheck): StepSource[] {
  const refs = new Set(check.evidenceRefs);
  return payload.evidence
    .filter((e) => refs.has(e.ref))
    .map((e) => ({
      ref: e.ref,
      documentId: e.documentId,
      documentCode: e.documentCode,
      revision: e.revision,
      page: e.page,
      chunkId: e.chunkId,
      errorId: e.errorId,
    }));
}

export interface LocatedStep {
  messageId: string;
  audiences: Audience[];
  payload: StepPayload;
  check: StepCheck;
  hash: string;
  gateVersion: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function locateStep(
  db: Db,
  c: { id: string; portal: boolean },
  readerRole: Role,
  messageId: string,
  step: number,
): Promise<LocatedStep | null> {
  const message = await db.caseMessage.findFirst({
    where: { id: messageId, caseId: c.id, kind: 'AI' },
    select: { id: true, payload: true, audiences: true },
  });
  if (!message) return null;
  if (!coversAudiences(caseAudiences(readerRole, c.portal), message.audiences)) return null;
  const payload = parseStepPayload(message.payload);
  const check = payload?.checks.find((k) => k.step === step);
  if (!payload || !check) return null;
  return {
    messageId: message.id,
    audiences: message.audiences,
    payload,
    check,
    hash: stepHash(check),
    gateVersion: gateVersionOf(payload.promptVersion),
  };
}

/** Заключване за ред в транзакцията (паралелни заявки за една стъпка/тикет не се разминават). */
export async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 4330))`;
}
