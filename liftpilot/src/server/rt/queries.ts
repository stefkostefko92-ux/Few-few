import 'server-only';
// Reads of the relazioni tecniche di modifica, always by the company of the session (another company's id is «not
// found»): an issued RT with what its page, its PDF and its reproduction need (never the bytes of its files nor of its
// kept body), the RTs of an installation and the revisions of a number, the company's latest «Verificato da» (the
// workspace prefills it), the RT's draft (FormDraft scope 'rt') with the files deleted since dropped, and the
// installation's linked survey as hints (persons, stops, matricola) for whoever sees the surveys.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rtDraftDataSchema, type RtDraftData } from '@/lib/draft-input';
import type { RtInputs } from '@/lib/rt/input';
import { readDraft } from '../drafts';
import { LIFT_BASE, ROOM_BASE } from './base';

/** An issued RT with its base's records, its logo, whether its body is kept, its files in their order. */
export const RT_ROW = {
  id: true, companyId: true, projectId: true, number: true, year: true, seq: true, revision: true, revisions: true, calculationId: true, roomDesignId: true,
  liftDesignId: true, inputs: true, anagrafica: true, projectData: true, plant: true, companyName: true, results: true, engineVersion: true, sha256: true,
  verdict: true, failCount: true, warnCount: true, summary: true, createdAt: true, citedSetIds: true,
  user: { select: { name: true } },
  project: { select: { id: true, name: true, archivedAt: true, plant: true, anagrafica: true, plantNumber: true, client: true, address: true, city: true, province: true } },
  roomDesign: { select: ROOM_BASE },
  liftDesign: { select: LIFT_BASE },
  logo: { select: { mime: true, data: true, sha256: true } },
  pdf: { select: { sha256: true, pages: true, createdAt: true } },
  // the snapshot of each file (TechnicalReportAttachment) with the immutable columns of the file it names
  attachments: { orderBy: { position: 'asc' }, include: { attachment: { select: { mime: true, orientation: true, size: true, fileName: true } } } },
} as const;

export function getRt(user: Pick<SessionUser, 'companyId'>, id: string) {
  return prisma.technicalReport.findFirst({ where: { id, companyId: user.companyId }, select: RT_ROW });
}
export type RtRow = NonNullable<Awaited<ReturnType<typeof getRt>>>;

/** The engine versions an RT is told outdated by (records.ts outdated.rt), without its JSON. */
export const RT_VERSIONS = {
  engineVersion: true,
  roomDesign: { select: { engineVersion: true, calculation: { select: { engineVersion: true } } } },
  liftDesign: { select: { engineVersion: true, calculation: { select: { engineVersion: true } }, shaftDesign: { select: { engineVersion: true } } } },
} as const;

/** The RTs of an installation, newest number and revision first. */
export function listProjectRts(user: Pick<SessionUser, 'companyId'>, projectId: string) {
  return prisma.technicalReport.findMany({
    where: { projectId, companyId: user.companyId }, orderBy: [{ year: 'desc' }, { seq: 'desc' }, { revision: 'desc' }], take: 100,
    select: { id: true, number: true, revision: true, createdAt: true, verdict: true, failCount: true, warnCount: true, summary: true, year: true, seq: true,
      user: { select: { name: true } }, pdf: { select: { sha256: true } }, ...RT_VERSIONS },
  });
}

/** The revisions of an RT's number, R0 first. */
export function listRtRevisions(user: Pick<SessionUser, 'companyId'>, year: number, seq: number) {
  return prisma.technicalReport.findMany({
    where: { companyId: user.companyId, year, seq }, orderBy: { revision: 'asc' }, select: { id: true, revision: true, createdAt: true, revisions: true, projectId: true },
  });
}

const verificatoSchema = z.object({ firme: z.object({ verificato: z.record(z.unknown()).optional() }).passthrough().optional() }).passthrough();

/** «Verificato da» of the company's latest RT (the workspace prefills it: the same engineer, usually). */
export async function latestVerificato(user: Pick<SessionUser, 'companyId'>): Promise<NonNullable<RtInputs['firme']>['verificato'] | null> {
  const r = await prisma.technicalReport.findFirst({ where: { companyId: user.companyId }, orderBy: { createdAt: 'desc' }, select: { inputs: true } });
  const v = r ? verificatoSchema.safeParse(r.inputs) : null;
  const ver = v?.success ? v.data.firme?.verificato : undefined;
  if (!ver) return null;
  const out: NonNullable<NonNullable<RtInputs['firme']>['verificato']> = {};
  if (ver.titolo === 'Ing.' || ver.titolo === 'Dott. Ing.') out.titolo = ver.titolo;
  if (typeof ver.nome === 'string') out.nome = ver.nome;
  if (typeof ver.provincia === 'string') out.provincia = ver.provincia;
  if (typeof ver.numero === 'string') out.numero = ver.numero;
  if (ver.sezione === 'A' || ver.sezione === 'B') out.sezione = ver.sezione;
  return Object.keys(out).length ? out : null;
}

/** The ids of files a draft names: in the list, as an expected document, as a source. */
export function idsNamed(inputs: RtInputs): string[] {
  const out = new Set<string>((inputs.allegati ?? []).map((a) => a.attachmentId));
  for (const v of Object.values(inputs.documenti ?? {})) if (v && v !== 'separato') out.add(v);
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if (k === 'attachmentId' && typeof v === 'string') out.add(v);
      else walk(v);
    }
  };
  walk(inputs.componenti);
  return [...out];
}

/** The inputs without the files not in `alive` (deleted since): out of the list, the documents and the sources. */
export function senzaFile(inputs: RtInputs, alive: ReadonlySet<string>): RtInputs {
  const drop = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(drop);
    if (!x || typeof x !== 'object') return x;
    return Object.fromEntries(Object.entries(x).filter(([k, v]) => !(k === 'attachmentId' && typeof v === 'string' && !alive.has(v))).map(([k, v]) => [k, drop(v)]));
  };
  const documenti = inputs.documenti ? Object.fromEntries(Object.entries(inputs.documenti).filter(([, v]) => v === 'separato' || alive.has(v))) : undefined;
  return {
    ...inputs,
    ...(inputs.allegati ? { allegati: inputs.allegati.filter((a) => alive.has(a.attachmentId)) } : {}),
    ...(documenti ? { documenti } : {}),
    ...(inputs.componenti ? { componenti: drop(inputs.componenti) as RtInputs['componenti'] } : {}),
  };
}

/** The RT's draft of an installation; the files it names that were deleted since are dropped (`dropped`: how many). */
export async function readRtDraft(user: SessionUser, projectId: string): Promise<{ data: RtDraftData; at: string; dropped: number } | null> {
  const d = await readDraft(user, projectId, 'rt', rtDraftDataSchema);
  if (!d) return null;
  const named = idsNamed(d.data.inputs);
  const rows = named.length ? await prisma.attachment.findMany({ where: { id: { in: named }, companyId: user.companyId, projectId }, select: { id: true } }) : [];
  const alive = new Set(rows.map((r) => r.id)), dropped = named.filter((id) => !alive.has(id)).length;
  return { data: dropped ? { ...d.data, inputs: senzaFile(d.data.inputs, alive) } : d.data, at: d.at, dropped };
}

/** The installation's latest linked survey as hints for the registry (persons, stops, matricola), for whoever sees
 *  the surveys; null without one. */
export async function rilievoHints(user: SessionUser, projectId: string): Promise<{ persone: number | null; fermate: number | null; matricola: string | null } | null> {
  if (!can(user, 'rilievi:view')) return null;
  const s = await prisma.scheda.findFirst({
    where: { companyId: user.companyId, projectId, deletedAt: null }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
    select: { capienzaPersone: true, fermate: true, matricola: true },
  });
  return s ? { persone: s.capienzaPersone ?? null, fermate: s.fermate ?? null, matricola: s.matricola ?? null } : null;
}
