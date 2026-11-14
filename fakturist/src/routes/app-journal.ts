import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { requireOrg, type OrgAccess } from '../auth/guards.js';
import { DAY, HOUR, sofiaToday } from '../time.js';
import { salesJournal } from '../export/sales-journal.js';

/**
 * „Дневник за продажбите“ (SPEC 61): преглед за месец и файлът PRODAGBI.TXT за внос в програмата на НАП
 * или в счетоводната програма. Четене — `documents.read` (и счетоводителят по пълномощно). Подава го
 * фирмата; ние само го подготвяме. Без ДДС номер — фирмата не води дневник по ЗДДС.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

/** Месецът от адреса (ГГГГ-ММ) или предишният месец по софийско време — обичайният за подаване. */
export function journalPeriod(value: unknown, today = sofiaToday()): string {
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  const [year, month] = today.split('-').map(Number) as [number, number];
  const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  return previous;
}

async function build(req: Request, access: OrgAccess) {
  const period = journalPeriod(req.query['period']);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: access.organizationId },
    select: { id: true, legalName: true, vatNumber: true },
  });
  if (!org.vatNumber) return { org, period, result: null };
  const start = new Date(`${period}-01T00:00:00Z`);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  // Анулирането е момент (софийско време) — границите са с ден запас, точният месец решава salesJournal.
  const documents = await prisma.document.findMany({
    where: {
      organizationId: org.id,
      status: { in: ['ISSUED', 'CANCELLED'] },
      OR: [
        { issueDate: { gte: start, lt: next } },
        {
          cancelledAt: {
            gte: new Date(start.getTime() - DAY),
            lt: new Date(next.getTime() + DAY),
          },
        },
      ],
    },
    select: {
      number: true,
      typeCode: true,
      status: true,
      issueDate: true,
      cancelledAt: true,
      input: true,
    },
  });
  const result = salesJournal({
    vatNumber: org.vatNumber,
    period: period.replace('-', ''),
    documents,
  });
  return { org, period, result };
}

export function appJournalRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/dnevnik', limiter, async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const { org, period, result } = await build(req, access);
    res.render('app/journal', {
      org,
      period,
      result,
      maxPeriod: sofiaToday().slice(0, 7),
    });
  });

  router.get('/app/o/:orgId/dnevnik/PRODAGBI.TXT', limiter, async (req, res) => {
    const access = await requireOrg(req, 'documents.read');
    const { org, period, result } = await build(req, access);
    if (!result) return res.redirect(303, `/app/o/${org.id}/dnevnik`);
    await prisma.$transaction((tx) =>
      audit(tx, {
        actorId: req.principal!.user.id,
        organizationId: org.id,
        action: 'journal.exported',
        targetType: 'Organization',
        targetId: org.id,
        details: { period, records: result.records, manual: result.manual.length },
      }),
    );
    res
      .status(200)
      .set('Cache-Control', 'private, no-store')
      .type('text/plain; charset=windows-1251')
      .set('Content-Disposition', 'attachment; filename="PRODAGBI.TXT"')
      .send(result.file);
  });

  return router;
}
