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
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { TERMS_VERSION } from '@/lib/legal';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportKey } from '@/lib/export-format';

/** The export without the uploaded files: everything companyExport reads at once (attachments are written after it,
 *  one file at a time, by exportStream). */
export type CompanyExport = Record<Exclude<ExportKey, 'attachments'>, unknown>;

const image = (l: { id: string; mime: string; sha256: string; width: number; height: number; createdAt: Date; data: Uint8Array }) => ({
  id: l.id, mime: l.mime, sha256: l.sha256, width: l.width, height: l.height, createdAt: l.createdAt, base64: Buffer.from(l.data).toString('base64'),
});

const RECORD = { id: true, label: true, engineVersion: true, sha256: true, verdict: true, failCount: true, warnCount: true, summary: true, inputs: true,
  createdAt: true, userId: true } as const;

export async function companyExport(companyId: string): Promise<CompanyExport | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, vatNumber: true, city: true, active: true, logoId: true, createdAt: true, updatedAt: true,
      subscriptionStatus: true, seatPack: true, periodEnd: true, cancelAtPeriodEnd: true, trialEndsAt: true, ordineSezioni: true },
  });
  if (!company) return null;
  const [users, invites, rolePermissions, logos, projects, priceItems, customPrices, schede, feedback, auditLog] = await Promise.all([
    prisma.user.findMany({
      where: { companyId }, orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true,
        termsAcceptedAt: true, termsVersion: true },
    }),
    prisma.invite.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: { email: true, name: true, role: true, expiresAt: true, createdAt: true } }),
    prisma.companyRolePermission.findMany({ where: { companyId }, orderBy: [{ role: 'asc' }, { capability: 'asc' }],
      select: { role: true, capability: true, granted: true, updatedById: true, updatedAt: true } }),
    prisma.companyLogo.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
    // the installation's module of before round 45 (Project.kind) is no data of the company's any more (format 9; the
    // column is dropped by migration 22, round 47)
    prisma.project.findMany({
      where: { companyId }, orderBy: { createdAt: 'asc' },
      include: {
        clientLogos: { orderBy: { createdAt: 'asc' } },
        // the test chosen with each calculation as stored (with the logbook's speed and travel and the controller's
        // regulation when entered, round 46: the format stays 9, the register names them)
        calculations: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, profileId: true, results: true, collaudo: true, intervento: true, shaftDesignId: true,
          reviews: { orderBy: { createdAt: 'asc' }, select: { id: true, userId: true, note: true, createdAt: true } } } },
        shaftDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, profileId: true, source: true, results: true } },
        liftDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, source: true, shaftDesignId: true, calculationId: true, baseCalculationId: true } },
        roomDesigns: { orderBy: { createdAt: 'asc' }, select: { ...RECORD, results: true, calculationId: true } },
        formDrafts: { orderBy: { createdAt: 'asc' }, select: { scope: true, data: true, createdAt: true, updatedAt: true } },
        drawingSets: { orderBy: { createdAt: 'asc' }, select: { id: true, number: true, revision: true, authorInitials: true, revisions: true, plant: true,
          projectData: true, companyName: true, sha256: true, pages: true, calculationId: true, shaftDesignId: true, roomDesignId: true, logoId: true, clientLogoId: true,
          userId: true, createdAt: true, pdf: { select: { sha256: true, createdAt: true } } } },
        // the relazioni tecniche di modifica issued (format 12): every column — the company and the installation are the
        // file's and the parent's —, the kept body's fingerprint (never its bytes) and the files as listed at issue
        technicalReports: { orderBy: { createdAt: 'asc' }, omit: { companyId: true, projectId: true },
          include: { pdf: { select: { sha256: true, pages: true, createdAt: true } },
            attachments: { orderBy: { position: 'asc' }, omit: { reportId: true } } } },
      },
    }),
    prisma.priceItem.findMany({ where: { companyId }, orderBy: { key: 'asc' }, select: { key: true, cents: true, updatedById: true, updatedAt: true } }),
    prisma.customPriceItem.findMany({ where: { companyId }, orderBy: { position: 'asc' }, select: { text: true, cents: true, basis: true, scope: true, position: true, updatedById: true, updatedAt: true } }),
    // every column of the sheet (Decimal as text, the modules as stored, deletedAt for the trashed ones); the
    // search text is the software's index of the same values and the write key (round 48) the software's guard against a
    // save sent twice: both stay out
    prisma.scheda.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, omit: { searchText: true, writeKey: true },
      include: { misureBottoniere: { orderBy: { fermata: 'asc' }, omit: { schedaId: true } } } }),
    // what the company's users wrote to LiftPilot, and whether it was handled (the administrators' marks)
    prisma.feedback.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, omit: { companyId: true } }),
    prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, userId: true, action: true, entity: true, entityId: true, meta: true } }),
  ]);
  const doc: CompanyExport = {
    format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, exportedAt: new Date().toISOString(), termsVersion: TERMS_VERSION,
    note: 'Dati inseriti dall’azienda in LiftPilot (Carbon Stealth VCC). Importi in centesimi di euro senza IVA, lunghezze in millimetri salvo diversa indicazione, immagini e documenti caricati in base64.',
    company, users, invites, rolePermissions, logos: logos.map(image),
    projects: projects.map(({ clientLogos, ...p }) => ({ ...p, clientLogos: clientLogos.map(image) })),
    priceItems, customPrices, schede, feedback, auditLog,
  };
  return doc;
}

/** The bytes of a file read per query: whole 3-byte groups, so the slices' base64 joined is the file's base64; small
 *  enough that the server never holds a whole file (20 MiB) or the database driver's copies of it. */
export const EXPORT_SLICE = 3 * 1024 * 1024;

/** A file being written: its id, its size, how much is written, and the end of its JSON after the base64. */
type OpenFile = { id: string; size: number; at: number; tail: string };

/** The export as one JSON document, the same text as JSON.stringify({ ...doc, attachments }, null, 2) but written piece
 *  by piece: the company's data, then each uploaded file of the company (oldest first) — its columns, all but the
 *  company, then its bytes in base64, read EXPORT_SLICE at a time — so the server holds one slice, never the files
 *  (format 12; Data Act art. 25). A file deleted before its turn is left out; one deleted while it is being written,
 *  or a database error, ends the stream with an error (the client gets no complete JSON, never a wrong one). */
export function exportStream(doc: CompanyExport, companyId: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let head: string | null = JSON.stringify(doc, null, 2);
  let ids: string[] = [], next = 0, written = 0, open: OpenFile | null = null;
  const slice = async (f: OpenFile): Promise<Buffer> => {
    const rows = await prisma.$queryRaw<{ part: Uint8Array | null }[]>`
      SELECT substring(data FROM ${f.at + 1}::int FOR ${EXPORT_SLICE}::int) AS part FROM "AttachmentBlob" WHERE "attachmentId" = ${f.id}`;
    const part = rows[0]?.part;
    if (!part?.length) throw new Error(`attachment ${f.id}: bytes gone during the export`);
    return Buffer.from(part.buffer, part.byteOffset, part.byteLength);
  };
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        if (head !== null) {
          ids = (await prisma.attachment.findMany({ where: { companyId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } }))
            .map((r) => r.id);
          // the document without its closing brace, then the last key; the text is let go once queued
          c.enqueue(enc.encode(`${head.slice(0, -2)},\n  "attachments": [`));
          head = null;
          return;
        }
        if (open) {
          const part = await slice(open);
          open.at += part.length;
          c.enqueue(enc.encode(part.toString('base64')));
          if (open.at >= open.size) {
            c.enqueue(enc.encode(open.tail));
            open = null;
          }
          return;
        }
        while (next < ids.length) {
          const id = ids[next++];
          const row = await prisma.attachment.findFirst({ where: { id, companyId }, omit: { companyId: true } });
          if (!row) continue; // deleted meanwhile
          // the row as JSON.stringify writes it inside the array (4 spaces in); the base64 goes between the quotes of its
          // last key
          const text = JSON.stringify({ ...row, base64: '' }, null, 2).replace(/\n/g, '\n    ');
          const cut = text.lastIndexOf('""') + 1;
          c.enqueue(enc.encode(`${written++ ? ',' : ''}\n    ${text.slice(0, cut)}`));
          open = { id, size: row.size, at: 0, tail: text.slice(cut) };
          return;
        }
        c.enqueue(enc.encode(written ? '\n  ]\n}' : ']\n}'));
        c.close();
      } catch (err) {
        log.error({ err, companyId }, 'company export stream failed');
        c.error(err);
      }
    },
  });
}
