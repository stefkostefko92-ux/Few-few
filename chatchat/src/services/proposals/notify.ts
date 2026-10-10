import type { ProposalSource } from '@prisma/client';
import { notify } from '../collab/notify.js';
import type { CollabDeps } from '../collab/publish.js';

/**
 * Известие „ново предложение за знанието“ (FR-10, §11.3 „flag per owner della knowledge“) към
 * активните отговорници за знанието на клиента. Без съдържание: само id и източника — текстът се
 * чете в опашката (kb:manage). Авторът не известява сам себе си. Вторично е: грешка тук не
 * отменя предложението (`notify` я записва в лога).
 */
export async function notifyKnowledgeOwners(
  deps: CollabDeps,
  args: { tenantId: string; proposalId: string; source: ProposalSource; actorId: string | null },
): Promise<void> {
  const now = new Date();
  const owners = await deps.db.user.findMany({
    where: {
      tenantId: args.tenantId,
      role: 'KNOWLEDGE_OWNER',
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
    take: 100,
  });
  await notify(
    deps,
    owners
      .filter((o) => o.id !== args.actorId)
      .map((o) => ({
        tenantId: args.tenantId,
        userId: o.id,
        eventType: 'proposal.created' as const,
        objectType: 'proposal' as const,
        objectId: args.proposalId,
        payload: { proposalId: args.proposalId, source: args.source },
      })),
    args.actorId,
  );
}
