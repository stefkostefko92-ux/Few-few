import 'server-only';
// The drawing set of a machine replacement, built on the server from what the database holds: the machine room as
// surveyed and the calculation it builds on, both reproduced by the running engines (otherwise refused), the standards
// chosen with the calculation, the data of the installation, the project and the company with its current logo. Used
// by the issue and the revision (live data), by the draft of a saved room and by the PDF of an issued set (its
// snapshots).
import type { Prisma } from '@prisma/client';
import type { DrawingDoc } from '@/drawing';
import type { SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import type { FormValues } from '@/calc/types';
import { collaudoSchema } from '@/lib/lift-input';
import { collaudoOf, type Collaudo } from '@/lib/lift/collaudo';
import { plantReadSchema } from '@/lib/plant';
import { reproduceRoom } from '@/lib/room-hash';
import type { Survey } from '@/lib/room/survey';
import { verifyStored } from '@/lib/snapshot-hash';
import { projectData, storedParts, type ProjectData, type StoredSet } from '@/lib/tavole/compose';
import type { TavoleRevision } from '@/lib/tavole/input';
import { buildSurveyTavole } from '@/lib/tavole/survey-build';
import type { SurveyTavoleInput } from '@/lib/tavole/survey-input';
import { tavoleHash } from '@/lib/tavole-hash';
import type { ComposeError } from './drawing-compose';

type Tx = Prisma.TransactionClient;
type Logo = { mime: 'image/png' | 'image/jpeg'; data: Uint8Array } | null;

export interface RoomComposed {
  ok: true;
  projectId: string;
  calculationId: string;
  roomDesignId: string;
  logoId: string | null;
  clientLogoId: string | null;
  plant: Prisma.InputJsonValue;
  projectData: ProjectData;
  companyName: string;
  doc: DrawingDoc;
  input: SurveyTavoleInput;
  sha256: string;
  pages: number;
}

const logoOf = (l: { mime: string; data: Uint8Array } | null): Logo => (l && (l.mime === 'image/png' || l.mime === 'image/jpeg') ? { mime: l.mime, data: l.data } : null);

/** A saved room and its calculation, both reproduced by the running engines: the values, the survey, the standards. */
export function reproduceRoomRecord(r: { inputs: unknown; sha256: string }, c: { inputs: unknown; sha256: string; collaudo: unknown }):
  { ok: true; values: FormValues; survey: Survey; collaudo: Collaudo } | ComposeError {
  const values = formValuesSchema.safeParse(c.inputs);
  if (!values.success || !verifyStored(values.data, c.sha256).same) return { ok: false, error: 'engineChanged' };
  const room = reproduceRoom(r, values.data, c.sha256);
  if (!room?.same) return { ok: false, error: 'engineChanged' };
  const chosen = c.collaudo ? collaudoSchema.safeParse(c.collaudo) : null;
  return { ok: true, values: values.data, survey: room.survey, collaudo: collaudoOf(values.data, chosen?.success ? chosen.data : undefined) };
}

/** `readOnly`: a draft, allowed for an archived project too (an issue is not). */
export async function composeFromRoom(
  tx: Tx, user: SessionUser, roomDesignId: string, set: { number: string; issuedAt: Date; author: string; revisions: TavoleRevision[] }, readOnly = false,
): Promise<RoomComposed | ComposeError> {
  const r = await tx.roomDesign.findFirst({
    where: { id: roomDesignId, companyId: user.companyId },
    select: {
      id: true, inputs: true, sha256: true, calculation: { select: { id: true, inputs: true, sha256: true, collaudo: true } },
      project: {
        select: {
          id: true, name: true, address: true, city: true, province: true, plantNumber: true, client: true, plant: true, archivedAt: true,
          clientLogo: { select: { id: true, mime: true, data: true } },
        },
      },
    },
  });
  if (!r) return { ok: false, error: 'notFound' };
  if (r.project.archivedAt && !readOnly) return { ok: false, error: 'archived' };
  const rep = reproduceRoomRecord(r, r.calculation);
  if (!rep.ok) return rep;
  const company = await tx.company.findUnique({ where: { id: user.companyId }, select: { name: true, logo: { select: { id: true, mime: true, data: true } } } });
  if (!company) return { ok: false, error: 'notFound' };
  const plant = plantReadSchema.safeParse(r.project.plant ?? {}), pd = projectData(r.project), logo = logoOf(company.logo), clientLogo = logoOf(r.project.clientLogo);
  const stored: StoredSet = {
    number: set.number, createdAt: set.issuedAt, authorInitials: set.author, companyName: company.name, projectData: pd,
    plant: plant.success ? plant.data : {}, revisions: set.revisions.map((x) => ({ mark: x.mark, text: x.text, date: x.date.toISOString() })),
  };
  const parts = storedParts(stored, logo, clientLogo);
  if (!parts) return { ok: false, error: 'notFound' };
  const input: SurveyTavoleInput = { values: rep.values, survey: rep.survey, collaudo: rep.collaudo, ...parts };
  const { doc } = buildSurveyTavole(input);
  return {
    ok: true, projectId: r.project.id, calculationId: r.calculation.id, roomDesignId: r.id, logoId: logo ? company.logo?.id ?? null : null,
    clientLogoId: clientLogo ? r.project.clientLogo?.id ?? null : null, plant: (plant.success ? plant.data : {}) as Prisma.InputJsonValue, projectData: pd,
    companyName: company.name, doc, input, sha256: tavoleHash(doc), pages: doc.pages.length,
  };
}

/** An issued set of a replacement drawn again from its snapshots; an error when the engines do not reproduce it. */
export function composeStoredRoom(s: StoredSet & {
  sha256: string;
  calculation: { inputs: unknown; sha256: string; collaudo: unknown };
  roomDesign: { inputs: unknown; sha256: string };
  logo: { mime: string; data: Uint8Array } | null;
  clientLogo?: { mime: string; data: Uint8Array } | null;
}): { doc: DrawingDoc } | ComposeError {
  const rep = reproduceRoomRecord(s.roomDesign, s.calculation);
  if (!rep.ok) return rep;
  const parts = storedParts(s, logoOf(s.logo), logoOf(s.clientLogo ?? null));
  if (!parts) return { ok: false, error: 'notFound' };
  const { doc } = buildSurveyTavole({ values: rep.values, survey: rep.survey, collaudo: rep.collaudo, ...parts });
  return tavoleHash(doc) === s.sha256 ? { doc } : { ok: false, error: 'engineChanged' };
}
