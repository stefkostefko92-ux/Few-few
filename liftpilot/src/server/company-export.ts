import 'server-only';
// All the data a company entered, as one JSON document (terms of use, article «exit»; GDPR art. 20; Data Act art. 25):
// the company, its users (never their password hashes or tokens), the rights it set for its colleagues' roles (only where
// they differ from the default matrix, as stored: CompanyRolePermission, round 42), the projects with every calculation, shaft design,
// lift design and drawing set and the drafts of their forms, the logos, the price list, the survey sheets (Rilievi, the
// trashed ones too, with their measurements per stop and the suppliers' modules as filled in), the reports its users sent
// to LiftPilot («Segnala un problema», format 10), the activity log and — format 12, round 49 — each installation's registry
// for the relazione tecnica di modifica (anagrafica), the reports issued with their files as listed at issue, and the
// files uploaded for the installations with their bytes (attachments). The software's own data (catalogues, the
// standards register, the engines) are not the company's and stay out. Its format is described in public
// (src/lib/export-format.ts, the page /<locale>/data).
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { TERMS_VERSION } from '@/lib/legal';
import { EXPORT_DATA, EXPORT_ENVELOPE, EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportKey } from '@/lib/export-format';

/** The lists written one page at a time, oldest first: they grow with the company's work (an installation with its
 *  records is up to some hundred KiB of JSON, the activity log thousands of rows), so the server never holds them whole. */
export const EXPORT_PAGES = { logos: 10, projects: 5, schede: 50, auditLog: 500 } as const;
type Paged = keyof typeof EXPORT_PAGES;

/** Where a row stands in its list: the lists are ordered by createdAt, then id (createdAt alone can tie). */
type Cursor = { createdAt: Date; id: string };

/** What companyExport reads at once — every key but the paged lists and the uploaded files, all small and bounded — and
 *  the last row each paged list will write: rows added after (such as the audit entry of this very export) stay out. */
export type CompanyExport = {
  data: Record<Exclude<ExportKey, Paged | 'attachments'>, unknown>;
  ends: Record<Paged, Cursor | null>;
};

const image = (l: { id: string; mime: string; sha256: string; width: number; height: number; createdAt: Date; data: Uint8Array }) => ({
  id: l.id, mime: l.mime, sha256: l.sha256, width: l.width, height: l.height, createdAt: l.createdAt, base64: Buffer.from(l.data).toString('base64'),
});

const RECORD = { id: true, label: true, engineVersion: true, sha256: true, verdict: true, failCount: true, warnCount: true, summary: true, inputs: true,
  createdAt: true, userId: true } as const;
const OLDEST: Prisma.SortOrder = 'asc';
const LAST = { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], select: { createdAt: true, id: true } };

export async function companyExport(companyId: string): Promise<CompanyExport | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, vatNumber: true, city: true, active: true, logoId: true, createdAt: true, updatedAt: true,
      subscriptionStatus: true, seatPack: true, periodEnd: true, cancelAtPeriodEnd: true, trialEndsAt: true, ordineSezioni: true },
  });
  if (!company) return null;
  const where = { companyId };
  const [users, invites, rolePermissions, priceItems, customPrices, feedback, logos, projects, schede, auditLog] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { createdAt: OLDEST },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true,
        termsAcceptedAt: true, termsVersion: true },
    }),
    prisma.invite.findMany({ where, orderBy: { createdAt: OLDEST }, select: { email: true, name: true, role: true, expiresAt: true, createdAt: true } }),
    prisma.companyRolePermission.findMany({ where, orderBy: [{ role: OLDEST }, { capability: OLDEST }],
      select: { role: true, capability: true, granted: true, updatedById: true, updatedAt: true } }),
    prisma.priceItem.findMany({ where, orderBy: { key: OLDEST }, select: { key: true, cents: true, updatedById: true, updatedAt: true } }),
    prisma.customPriceItem.findMany({ where, orderBy: { position: OLDEST }, select: { text: true, cents: true, basis: true, scope: true, position: true, updatedById: true, updatedAt: true } }),
    // what the company's users wrote to LiftPilot, and whether it was handled (the administrators' marks)
    prisma.feedback.findMany({ where, orderBy: { createdAt: OLDEST }, omit: { companyId: true } }),
    // the last row of each paged list, read before the route writes the audit entry of the export
    prisma.companyLogo.findFirst({ where, ...LAST }),
    prisma.project.findFirst({ where, ...LAST }),
    prisma.scheda.findFirst({ where, ...LAST }),
    prisma.auditLog.findFirst({ where, ...LAST }),
  ]);
  return {
    data: {
      format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, exportedAt: new Date().toISOString(), termsVersion: TERMS_VERSION,
      note: 'Dati inseriti dall’azienda in LiftPilot (Carbon Stealth VCC). Importi in centesimi di euro senza IVA, lunghezze in millimetri salvo diversa indicazione, immagini e documenti caricati in base64.',
      company, users, invites, rolePermissions, priceItems, customPrices, feedback,
    },
    ends: { logos, projects, schede, auditLog },
  };
}

/** The company's rows after `from` (null: from its first) up to `end`, in the lists' order. */
const pageWhere = (companyId: string, from: Cursor | null, end: Cursor) => ({
  companyId,
  AND: [
    { OR: [{ createdAt: { lt: end.createdAt } }, { createdAt: end.createdAt, id: { lte: end.id } }] },
    ...(from ? [{ OR: [{ createdAt: { gt: from.createdAt } }, { createdAt: from.createdAt, id: { gt: from.id } }] }] : []),
  ],
});
type PageWhere = ReturnType<typeof pageWhere>;
const PAGE_ORDER = [{ createdAt: OLDEST }, { id: OLDEST }];

/** One page of a paged list as it is written: the rows, and the cursor of the last one read. */
type Page = { rows: unknown[]; last: Cursor | undefined };
const pageOf = <R extends Cursor>(rows: R[], shape: (r: R) => unknown): Page => ({ rows: rows.map(shape), last: rows.at(-1) });

const PAGE: Record<Paged, (where: PageWhere) => Promise<Page>> = {
  logos: async (where) => pageOf(await prisma.companyLogo.findMany({ where, orderBy: PAGE_ORDER, take: EXPORT_PAGES.logos }), image),
  // the installation's module of before round 45 (Project.kind) is no data of the company's any more (format 9; the
  // column is dropped by migration 22, round 47)
  projects: async (where) => pageOf(await prisma.project.findMany({
    where, orderBy: PAGE_ORDER, take: EXPORT_PAGES.projects,
    include: {
      clientLogos: { orderBy: { createdAt: OLDEST } },
      // the test chosen with each calculation as stored (with the logbook's speed and travel and the controller's
      // regulation when entered, round 46: the format stays 9, the register names them)
      calculations: { orderBy: { createdAt: OLDEST }, select: { ...RECORD, profileId: true, results: true, collaudo: true, intervento: true, shaftDesignId: true,
        reviews: { orderBy: { createdAt: OLDEST }, select: { id: true, userId: true, note: true, createdAt: true } } } },
      shaftDesigns: { orderBy: { createdAt: OLDEST }, select: { ...RECORD, profileId: true, source: true, results: true } },
      liftDesigns: { orderBy: { createdAt: OLDEST }, select: { ...RECORD, source: true, shaftDesignId: true, calculationId: true, baseCalculationId: true } },
      roomDesigns: { orderBy: { createdAt: OLDEST }, select: { ...RECORD, results: true, calculationId: true } },
      formDrafts: { orderBy: { createdAt: OLDEST }, select: { scope: true, data: true, createdAt: true, updatedAt: true } },
      drawingSets: { orderBy: { createdAt: OLDEST }, select: { id: true, number: true, revision: true, authorInitials: true, revisions: true, plant: true,
        projectData: true, companyName: true, sha256: true, pages: true, calculationId: true, shaftDesignId: true, roomDesignId: true, logoId: true, clientLogoId: true,
        userId: true, createdAt: true, pdf: { select: { sha256: true, createdAt: true } } } },
      // the relazioni tecniche di modifica issued (format 12): every column — the company and the installation are the
      // file's and the parent's —, the kept body's fingerprint (never its bytes) and the files as listed at issue
      technicalReports: { orderBy: { createdAt: OLDEST }, omit: { companyId: true, projectId: true },
        include: { pdf: { select: { sha256: true, pages: true, createdAt: true } },
          attachments: { orderBy: { position: OLDEST }, omit: { reportId: true } } } },
    },
  }), ({ clientLogos, ...p }) => ({ ...p, clientLogos: clientLogos.map(image) })),
  // every column of the sheet (Decimal as text, the modules as stored, deletedAt for the trashed ones); the
  // search text is the software's index of the same values and the write key (round 48) the software's guard against a
  // save sent twice: both stay out
  schede: async (where) => pageOf(await prisma.scheda.findMany({ where, orderBy: PAGE_ORDER, take: EXPORT_PAGES.schede, omit: { searchText: true, writeKey: true },
    include: { misureBottoniere: { orderBy: { fermata: OLDEST }, omit: { schedaId: true } } } }), (s) => s),
  // the entry's id only places the page: the file has never carried it
  auditLog: async (where) => pageOf(await prisma.auditLog.findMany({ where, orderBy: PAGE_ORDER, take: EXPORT_PAGES.auditLog,
    select: { id: true, createdAt: true, userId: true, action: true, entity: true, entityId: true, meta: true } }),
  (e) => ({ createdAt: e.createdAt, userId: e.userId, action: e.action, entity: e.entity, entityId: e.entityId, meta: e.meta })),
};

/** A value as JSON.stringify(doc, null, 2) writes it at `depth` levels in: the newlines inside it carry the indentation. */
const nested = (value: unknown, depth: number): string => JSON.stringify(value, null, 2).replace(/\n/g, `\n${'  '.repeat(depth)}`);

/** The rows of a paged list, one page per piece: its array as JSON.stringify writes it, rows deleted meanwhile left out. */
async function* pagedText(key: Paged, companyId: string, end: Cursor | null): AsyncGenerator<string> {
  let from: Cursor | null = null, written = 0;
  while (end) {
    const { rows, last } = await PAGE[key](pageWhere(companyId, from, end));
    if (rows.length) yield rows.map((r) => `${written++ ? ',' : ''}\n    ${nested(r, 2)}`).join('');
    if (!last || rows.length < EXPORT_PAGES[key]) break;
    from = last;
  }
  yield written ? '\n  ]' : ']';
}

/** The bytes of a file read per query: whole 3-byte groups, so the slices' base64 joined is the file's base64; small
 *  enough that the server never holds a whole file (20 MiB) or the database driver's copies of it. */
export const EXPORT_SLICE = 3 * 1024 * 1024;

/** The company's uploaded files (oldest first): each one's columns, all but the company, then its bytes in base64, read
 *  EXPORT_SLICE at a time. A file deleted before its turn is left out; one deleted while it is being written ends the
 *  export with an error. */
async function* attachmentsText(companyId: string): AsyncGenerator<string> {
  const ids = (await prisma.attachment.findMany({ where: { companyId }, orderBy: [{ createdAt: OLDEST }, { id: OLDEST }], select: { id: true } }))
    .map((r) => r.id);
  let written = 0;
  for (const id of ids) {
    const row = await prisma.attachment.findFirst({ where: { id, companyId }, omit: { companyId: true } });
    if (!row) continue; // deleted meanwhile
    // the row as JSON.stringify writes it inside the array; the base64 goes between the quotes of its last key
    const text = nested({ ...row, base64: '' }, 2);
    const cut = text.lastIndexOf('""') + 1;
    yield `${written++ ? ',' : ''}\n    ${text.slice(0, cut)}`;
    for (let at = 0; at < row.size;) {
      const rows = await prisma.$queryRaw<{ part: Uint8Array | null }[]>`
        SELECT substring(data FROM ${at + 1}::int FOR ${EXPORT_SLICE}::int) AS part FROM "AttachmentBlob" WHERE "attachmentId" = ${id}`;
      const part = rows[0]?.part;
      if (!part?.length) throw new Error(`attachment ${id}: bytes gone during the export`);
      at += part.length;
      yield Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64');
    }
    yield text.slice(cut);
  }
  yield written ? '\n  ]' : ']';
}

/** The whole document, piece by piece, key by key in the register's order. */
async function* exportText({ data, ends }: CompanyExport, companyId: string): AsyncGenerator<string> {
  let first = true;
  for (const key of [...EXPORT_ENVELOPE, ...EXPORT_DATA]) {
    const name = `${first ? '{' : ','}\n  ${JSON.stringify(key)}: `;
    first = false;
    if (key === 'attachments') {
      yield `${name}[`;
      yield* attachmentsText(companyId);
    } else if (key in EXPORT_PAGES) {
      yield `${name}[`;
      yield* pagedText(key as Paged, companyId, ends[key as Paged]);
    } else yield name + nested(data[key as keyof CompanyExport['data']], 1);
  }
  yield '\n}';
}

/** The export as one JSON document, the same text as JSON.stringify(doc, null, 2) of everything read at once but written
 *  piece by piece — the small parts, then the paged lists a page at a time, then the uploaded files a slice at a time —,
 *  each read only when the client takes the previous piece, so the server holds a page or a slice, never the company's
 *  data (format 12; Data Act art. 25). A database error ends the stream with an error: the client gets no complete JSON,
 *  never a wrong one. */
export function exportStream(head: CompanyExport, companyId: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const pieces = exportText(head, companyId);
  // the client went away (a closed tab, a timeout) while a piece was being read: nothing more is read, and the piece
  // that arrives after is dropped quietly — the closed stream refusing it is not an error of the export
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const r = await pieces.next();
        if (cancelled) return;
        if (r.done) c.close();
        else c.enqueue(enc.encode(r.value));
      } catch (err) {
        if (cancelled) return;
        log.error({ err, companyId }, 'company export stream failed');
        c.error(err);
      }
    },
    async cancel() {
      cancelled = true;
      await pieces.return(undefined);
    },
  });
}
