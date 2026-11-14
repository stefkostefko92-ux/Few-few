import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { setting } from '../admin/settings.js';
import { errorMessage, logger } from '../logger.js';
import { MINUTE } from '../time.js';
import { lockOrganization } from './transfer-core.js';
import { IncomingRegisterError, registerIncoming } from '../incoming/register.js';

/**
 * Изтриването след прекратяване (SPEC 67; договорът за обработване т. 11): след `purgeAfter` всичко на
 * фирмата се трие. Остава надгробието (наименованието и `deletedAt`) и редовете в KEPT_AFTER_PURGE —
 * тестът минава през всеки модел в схемата и проверява, че нищо друго не сочи към фирмата.
 */
export const KEPT_AFTER_PURGE = [
  // Одитът и приетите условия — доказателство (срокът им е отделен).
  'AuditLog.organizationId',
  'LegalAcceptance.organizationId',
  // Абонаментите и плащанията на плановете — нашето счетоводство (ЗСч).
  'Subscription.organizationId',
  'Payment.organizationId',
  // Документите на клиентите, издадени от прекратена кантора, остават при клиентите — с името ѝ и
  // пълномощното, по което са издадени (PDF-ът ги печата).
  'Document.firmId',
  'Proforma.firmId',
  'RecurringInvoice.viaFirmId',
  'ClientMandate.firmId',
  'Organization.createdByFirmId',
] as const;

const PURGE_TIMEOUT_MS = 2 * MINUTE;

/**
 * Документите, доставени в шкафчето на други фирми, стават техни входящи (XML-ът, както е издаден) —
 * получателят ги пази по закон, нашето изтриване не бива да ги вземе. Повторен проход — дубликат, не грешка.
 */
async function archiveDelivered(organizationId: string): Promise<number> {
  const entries = await prisma.inboxEntry.findMany({
    where: {
      senderOrgId: organizationId,
      recipientOrgId: { not: organizationId },
      recipientOrg: { deletedAt: null },
    },
    select: {
      recipientOrgId: true,
      document: { select: { number: true, ublXml: true } },
    },
  });
  let archived = 0;
  for (const entry of entries) {
    const xml = entry.document.ublXml;
    if (!xml) continue;
    try {
      await registerIncoming({
        organizationId: entry.recipientOrgId,
        actorId: null,
        fileName: `${entry.document.number ?? 'document'}.xml`,
        buffer: Buffer.from(xml, 'utf8'),
        source: 'INBOX',
      });
      archived += 1;
    } catch (error) {
      if (error instanceof IncomingRegisterError && error.code === 'duplicate') continue;
      throw error;
    }
  }
  return archived;
}

/** Изтрива една фирма в транзакция под заключването ѝ; false — междувременно е отменено. */
async function purgeOrganization(organizationId: string, now: Date): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      await lockOrganization(tx, organizationId);
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { legalName: true, terminatedAt: true, purgeAfter: true, deletedAt: true },
      });
      if (
        org.deletedAt ||
        !org.terminatedAt ||
        !org.purgeAfter ||
        org.purgeAfter.getTime() > now.getTime()
      ) {
        return false;
      }
      const owners = await tx.membership.findMany({
        where: { organizationId, role: 'OWNER', user: { disabledAt: null } },
        select: { user: { select: { email: true } } },
      });
      const byOrg = { organizationId };
      const ofDocs = { document: { organizationId } };
      await tx.bankLine.deleteMany({ where: byOrg });
      await tx.bankStatement.deleteMany({ where: byOrg });
      await tx.apiIdempotency.deleteMany({ where: ofDocs });
      await tx.nraReport.deleteMany({ where: { OR: [byOrg, ofDocs] } });
      await tx.documentPayment.deleteMany({ where: ofDocs });
      await tx.inboxEntry.deleteMany({
        where: { OR: [{ senderOrgId: organizationId }, { recipientOrgId: organizationId }] },
      });
      await tx.proforma.deleteMany({ where: byOrg });
      await tx.peppolTransmission.deleteMany({ where: byOrg });
      await tx.issueSubmission.deleteMany({ where: byOrg });
      // Препратките между документите на фирмата (известие → фактура, анулиран → нов) са RESTRICT.
      await tx.document.updateMany({
        where: byOrg,
        data: { precedingId: null, replacedById: null },
      });
      await tx.recurringInvoice.deleteMany({ where: byOrg });
      await tx.document.deleteMany({ where: byOrg });
      await tx.documentSeries.deleteMany({ where: byOrg });
      await tx.party.deleteMany({ where: byOrg });
      await tx.item.deleteMany({ where: byOrg });
      await tx.pdfStyle.deleteMany({ where: byOrg });
      await tx.memberInvite.deleteMany({ where: byOrg });
      await tx.transferInvite.deleteMany({ where: byOrg });
      await tx.apiKey.deleteMany({ where: byOrg });
      await tx.incomingInvoice.deleteMany({ where: byOrg });
      await tx.peppolParticipant.deleteMany({ where: byOrg });
      await tx.notification.deleteMany({ where: byOrg });
      await tx.membership.deleteMany({ where: byOrg });
      await tx.clientMandate.deleteMany({ where: { clientId: organizationId } });
      // Кантората: пълномощните остават (документите на клиентите сочат към тях), но не действат.
      await tx.clientMandate.updateMany({
        where: { firmId: organizationId, status: { not: 'REVOKED' } },
        data: { status: 'REVOKED' },
      });
      await tx.subscription.updateMany({
        where: { ...byOrg, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED' },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          deletedAt: now,
          purgeAfter: null,
          eik: null,
          vatNumber: null,
          addressStreet: '',
          addressCity: '',
          postalCode: '',
          email: null,
          phone: null,
          iban: null,
          bic: null,
          bankName: null,
          eAddressScheme: null,
          eAddressValue: null,
          verifiedAt: null,
          ownerReviewPendingAt: null,
          ownershipLockedAt: null,
          remindersEnabled: false,
        },
      });
      if (owners.length > 0) {
        await tx.notification.createMany({
          data: owners.map((o) => ({
            kind: 'org.purged',
            toEmail: o.user.email,
            payload: { legalName: org.legalName },
          })),
        });
      }
      await audit(tx, {
        actorId: null,
        organizationId,
        action: 'org.purged',
        targetType: 'Organization',
        targetId: organizationId,
        details: { terminatedAt: org.terminatedAt.toISOString() },
      });
      return true;
    },
    { timeout: PURGE_TIMEOUT_MS },
  );
}

/** Работникът по сроковете (src/maintenance.ts): всяка фирма с изтекъл срок — поотделно. */
export async function purgeTerminated(
  now: Date = new Date(),
): Promise<{ purged: number; archived: number }> {
  const due = await prisma.organization.findMany({
    where: { deletedAt: null, terminatedAt: { not: null }, purgeAfter: { lte: now } },
    select: { id: true },
    orderBy: { purgeAfter: 'asc' },
  });
  const supplier = await setting('billing.supplierOrgId');
  let purged = 0;
  let archived = 0;
  for (const { id } of due) {
    // Фактурите за плановете сочат към документите на доставчика — той не се изтрива оттук.
    if (id === supplier) continue;
    try {
      archived += await archiveDelivered(id);
      if (await purgeOrganization(id, now)) purged += 1;
    } catch (error) {
      // Следващият проход опитва пак; една повредена фирма не спира другите.
      logger.error({ err: errorMessage(error), organizationId: id }, 'изтриването не мина');
    }
  }
  return { purged, archived };
}
