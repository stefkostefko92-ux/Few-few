import type { Prisma, TicketEventSource } from '@prisma/client';
import { lockKey } from '../steps/locate.js';

/**
 * Закачката на outbox-а (transactional outbox): вика се от `recordTicketEvent` В СЪЩАТА
 * транзакция като промяната по тикета — няма промяна без доставка и доставка без промяна.
 * Без включен конектор на клиента — нищо не се записва. Промяна, дошла ОТ helpdesk-а
 * (`EXTERNAL`), не се връща обратно (без ехо). `seq` е пореден по тикет: заключването по тикета
 * (взето винаги СЛЕД глобалния ключ на одита в `recordTicketEvent` — без кръстосано чакане)
 * прави MAX+1 еднозначен и в реда на commit-а.
 */
export async function enqueueHelpdeskDelivery(
  tx: Prisma.TransactionClient,
  e: {
    tenantId: string;
    ticketId: string;
    eventId: string;
    type: string;
    source: TicketEventSource;
  },
): Promise<boolean> {
  if (e.source === 'EXTERNAL') return false;
  const integration = await tx.helpdeskIntegration.findFirst({
    where: { tenantId: e.tenantId, enabled: true },
    select: { id: true },
  });
  if (!integration) return false;
  await lockKey(tx, `helpdesk|${e.ticketId}`);
  const last = await tx.helpdeskDelivery.aggregate({
    where: { ticketId: e.ticketId },
    _max: { seq: true },
  });
  await tx.helpdeskDelivery.create({
    data: {
      tenantId: e.tenantId,
      integrationId: integration.id,
      ticketId: e.ticketId,
      eventId: e.eventId,
      eventType: e.type,
      seq: (last._max.seq ?? 0) + 1,
    },
  });
  return true;
}
