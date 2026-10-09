import type { Conversation } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { addTimeline, isUniqueOn } from '../cases.js';
import type { Viewer } from './access.js';
import type { CollabDeps } from './publish.js';

/**
 * Вътрешната дискусия на персонала по случай (FR-24): CASE, portal=false, един на случай.
 * Повторно извикване връща същия разговор и вписва питащия като член.
 */
export async function openCaseConversation(
  deps: CollabDeps,
  viewer: Viewer,
  c: { id: string; number: string },
): Promise<{ conversation: Conversation; created: boolean }> {
  let conversation = await deps.db.conversation.findUnique({ where: { caseId: c.id } });
  let created = false;
  if (!conversation) {
    try {
      conversation = await deps.db.$transaction(async (tx) => {
        const row = await tx.conversation.create({
          data: {
            tenantId: viewer.tenantId,
            type: 'CASE',
            name: c.number,
            visibility: 'PRIVATE',
            portal: false,
            caseId: c.id,
            createdById: viewer.id,
            members: { create: [{ userId: viewer.id, role: 'OWNER' }] },
          },
        });
        await addTimeline(tx, c.id, 'internal.discussion_opened', viewer.id, {
          conversationId: row.id,
        });
        await appendAudit(tx, {
          tenantId: viewer.tenantId,
          actorId: viewer.id,
          action: 'conversation.create',
          objectType: 'conversation',
          objectId: row.id,
          detail: { type: 'CASE', caseId: c.id },
        });
        return row;
      });
      created = true;
    } catch (err) {
      // Паралелна заявка за същия случай го създаде — ползваме нейния.
      if (!isUniqueOn(err, 'caseId')) throw err;
      conversation = await deps.db.conversation.findUniqueOrThrow({ where: { caseId: c.id } });
    }
  }
  if (!created) {
    await deps.db.conversationMember.createMany({
      data: [{ conversationId: conversation.id, userId: viewer.id }],
      skipDuplicates: true,
    });
  }
  return { conversation, created };
}
