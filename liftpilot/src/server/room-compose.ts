import 'server-only';
// The drawing set of a machine replacement, built on the server from what the database holds: the machine room as
// surveyed and the calculation it builds on, both reproduced by the running engines (otherwise refused), the standards
// chosen with the calculation, the data of the installation, the project and the company with its current logo. Used
// by the issue and the revision (live data), by the draft of a saved room and by the PDF of an issued set (its
// snapshots).
import type { Prisma } from '@prisma/client';
import type { DrawingDoc } from '@/drawing';
import type { SessionUser } from '@/lib/auth';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '@/lib/lift/collaudo';
import { reproduceRoom } from '@/lib/room-hash';
import type { RoomDerived } from '@/lib/room/derive';
import type { Survey } from '@/lib/room/survey';
import { storedParts, type ProjectData, type StoredSet } from '@/lib/tavole/compose';
import type { TavoleRevision } from '@/lib/tavole/input';
import { buildSurveyTavole } from '@/lib/tavole/survey-build';
import type { SurveyTavoleInput } from '@/lib/tavole/survey-input';
import { tavoleHash } from '@/lib/tavole-hash';
import { SET_PROJECT, setBasis, type ComposeError } from './drawing-compose';
import { usableLogo } from '@/lib/logo';
import { readCalc, storedCollaudo } from './records';

type Tx = Prisma.TransactionClient;

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

/** A saved room and its calculation, both reproduced by the running engines: the values, the survey, the room derived
 *  again, the standards. */
export function reproduceRoomRecord(r: { inputs: unknown; sha256: string }, c: { inputs: unknown; sha256: string; collaudo: unknown }):
  { ok: true; values: FormValues; survey: Survey; derived: RoomDerived; collaudo: Collaudo } | ComposeError {
  const calc = readCalc(c);
  if (!calc?.same) return { ok: false, error: 'engineChanged' };
  const room = reproduceRoom(r, calc.values, c.sha256);
  if (!room?.same) return { ok: false, error: 'engineChanged' };
  return { ok: true, values: calc.values, survey: room.survey, derived: room.derived, collaudo: storedCollaudo(calc.values, c.collaudo) };
}

/** `readOnly`: a draft, allowed for an archived project too (an issue is not). */
export async function composeFromRoom(
  tx: Tx, user: SessionUser, roomDesignId: string, set: { number: string; issuedAt: Date; author: string; revisions: TavoleRevision[] }, readOnly = false,
): Promise<RoomComposed | ComposeError> {
  const r = await tx.roomDesign.findFirst({
    where: { id: roomDesignId, companyId: user.companyId },
    select: { id: true, inputs: true, sha256: true, calculation: { select: { id: true, inputs: true, sha256: true, collaudo: true } }, project: { select: SET_PROJECT } },
  });
  if (!r) return { ok: false, error: 'notFound' };
  if (r.project.archivedAt && !readOnly) return { ok: false, error: 'archived' };
  const rep = reproduceRoomRecord(r, r.calculation);
  if (!rep.ok) return rep;
  const b = await setBasis(tx, user, r.project, set);
  const parts = b ? storedParts(b.stored, b.logo, b.clientLogo) : null;
  if (!b || !parts) return { ok: false, error: 'notFound' };
  const input: SurveyTavoleInput = { values: rep.values, survey: rep.survey, collaudo: rep.collaudo, ...parts };
  const { doc } = buildSurveyTavole(input);
  return { ok: true, ...b.row, calculationId: r.calculation.id, roomDesignId: r.id, doc, input, sha256: tavoleHash(doc), pages: doc.pages.length };
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
  const parts = storedParts(s, usableLogo(s.logo), usableLogo(s.clientLogo ?? null));
  if (!parts) return { ok: false, error: 'notFound' };
  const { doc } = buildSurveyTavole({ values: rep.values, survey: rep.survey, collaudo: rep.collaudo, ...parts });
  return tavoleHash(doc) === s.sha256 ? { doc } : { ok: false, error: 'engineChanged' };
}
