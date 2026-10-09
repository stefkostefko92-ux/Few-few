import type { AccountKind, CaseMessage, Prisma, PrismaClient, Role } from '@prisma/client';
import { AUDIENCE_WITHHELD, caseAudiences, coversAudiences } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';
import type { DiagnosticContext } from '../domain/context.js';
import { firmwareOutsideRevision, normalizeRevision } from '../domain/versions.js';
import { addTimeline } from './cases.js';

/** Изгледите на случая за API-то и проверките на контекста при запис (§10.1, FR-02). */

export function caseView(c: {
  id: string;
  number: string;
  status: string;
  outcome: string | null;
  context: Prisma.JsonValue;
  portal: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    outcome: c.outcome,
    context: c.context,
    portal: c.portal,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export interface MessageAuthor {
  id: string;
  name: string;
  role: Role;
  kind: AccountKind;
}

/**
 * Кой е писал, както го вижда читателят (правният одит, т. 12): порталният техник вижда РОЛЯТА на
 * служителя на производителя, не името му. `authorRole` е null за собствените съобщения и за AI.
 */
export function authorFor(
  reader: Pick<Principal['user'], 'id' | 'kind'>,
  author: MessageAuthor | undefined,
): { authorName: string | null; authorRole: Role | null } {
  if (!author) return { authorName: null, authorRole: null };
  if (author.id === reader.id) return { authorName: author.name, authorRole: null };
  if (reader.kind === 'PORTAL' && author.kind === 'INTERNAL') {
    return { authorName: null, authorRole: author.role };
  }
  return { authorName: author.name, authorRole: author.role };
}

/** Съобщенията на случая за читателя: автор по правилото горе, AI съдържание по аудитория. */
export async function messageViews(
  db: PrismaClient,
  p: Principal,
  c: { portal: boolean },
  messages: CaseMessage[],
) {
  const authorIds = [...new Set(messages.map((m) => m.authorId).filter(Boolean))] as string[];
  const authors = new Map(
    (
      await db.user.findMany({
        where: { id: { in: authorIds }, tenantId: p.user.tenantId },
        select: { id: true, name: true, role: true, kind: true },
      })
    ).map((u) => [u.id, u]),
  );
  const reader = caseAudiences(p.user.role, c.portal);
  return messages.map((m) => {
    const visible = m.kind !== 'AI' || coversAudiences(reader, m.audiences);
    return {
      id: m.id,
      kind: m.kind,
      ...authorFor(p.user, m.authorId ? authors.get(m.authorId) : undefined),
      body: visible ? m.body : AUDIENCE_WITHHELD,
      payload: visible ? m.payload : null,
      createdAt: m.createdAt,
    };
  });
}

export const FIRMWARE_WARNING = 'ctx.firmwareOutsideRevision';

/**
 * FR-13/§10.1: позната HW ревизия с фърмуер извън [fwMin, fwMax] → предупреждение в отговора и
 * събитие в хронологията (от системата). Търсенето НЕ се променя — приложимостта е по документите.
 */
export async function contextWarnings(
  db: PrismaClient,
  caseId: string,
  productId: string,
  ctx: Pick<DiagnosticContext, 'hardwareRevision' | 'firmware'>,
): Promise<string[]> {
  if (!ctx.hardwareRevision || !ctx.firmware) return [];
  const revision = await db.productRevision.findUnique({
    where: {
      productId_hwRevision: { productId, hwRevision: normalizeRevision(ctx.hardwareRevision) },
    },
  });
  if (!revision || !firmwareOutsideRevision(revision, ctx.firmware)) return [];
  await addTimeline(db, caseId, 'context.firmwareOutsideRevision', null, {
    hwRevision: revision.hwRevision,
    firmware: ctx.firmware,
    fwMin: revision.fwMin,
    fwMax: revision.fwMax,
  });
  return [FIRMWARE_WARNING];
}
