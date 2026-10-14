import 'server-only';
// The reads of the link between surveys and installations (round 44), always within the company of the signed-in user:
// an installation or a survey of another company is "not found". The survey's page: the installation it is linked to,
// the suggestions (src/lib/collega/suggerimenti.ts) among the company's active installations, the search of another
// one. The installation's page: its surveys newest first, with their supplier modules.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { likeEscape, searchWords } from '@/lib/dashboard';
import { MODULI_SELECT, moduliDi, type ModuloLink } from '@/lib/collega/moduli';
import { RILIEVO_SELECT, rilievoDati, type RilievoDati } from '@/lib/collega/rilievo';
import { suggerimenti, type Candidato, type Suggerimento } from '@/lib/collega/suggerimenti';
import { paroleDaCercare } from '@/lib/collega/testo';

/** What a page shows of an installation the survey is (or may be) linked to. */
export const IMPIANTO_SELECT = { id: true, name: true, kind: true, address: true, city: true, province: true, plantNumber: true, archivedAt: true } as const;

/** The installation a survey is linked to (the company's); null when none or not readable. */
export function impiantoDi(user: SessionUser, projectId: string | null) {
  if (!projectId) return Promise.resolve(null);
  return prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: IMPIANTO_SELECT });
}

/** The company's active installations that may be the survey's: the same «Numero di matricola», a survey of the same
 *  matricola or number, a word of the address (the ranking and the reasons are suggerimenti.ts). At most 50 read. */
export async function candidatiPer(user: SessionUser, r: { matricola: string | null; numeroImpianto: string | null; indirizzo: string | null }): Promise<Candidato[]> {
  const or: object[] = [];
  if (r.matricola) or.push({ plantNumber: r.matricola });
  const codes = [...(r.matricola ? [{ matricola: r.matricola }] : []), ...(r.numeroImpianto ? [{ numeroImpianto: r.numeroImpianto }] : [])];
  if (codes.length) or.push({ schede: { some: { deletedAt: null, OR: codes } } });
  for (const w of paroleDaCercare(r.indirizzo)) {
    const has = { contains: likeEscape(w), mode: 'insensitive' as const };
    or.push({ address: has }, { schede: { some: { deletedAt: null, indirizzo: has } } });
  }
  if (or.length === 0) return [];
  return prisma.project.findMany({
    where: { companyId: user.companyId, archivedAt: null, OR: or }, orderBy: { updatedAt: 'desc' }, take: 50,
    select: { id: true, name: true, kind: true, address: true, city: true, province: true, plantNumber: true, updatedAt: true,
      schede: { where: { deletedAt: null }, select: { matricola: true, numeroImpianto: true, indirizzo: true }, take: 20 } },
  });
}

/** The suggestions for a survey (not the installation it is linked to). */
export async function suggerimentiPer(user: SessionUser, r: { matricola: string | null; numeroImpianto: string | null; indirizzo: string | null; projectId: string | null }): Promise<Suggerimento[]> {
  return suggerimenti(r, await candidatiPer(user, r));
}

/** The company's active installations by the words searched (name, address, municipality, plant number): at most 8. */
export function cercaImpianti(user: SessionUser, q: unknown) {
  const words = searchWords(q);
  if (words.length === 0) return Promise.resolve([]);
  const has = (w: string) => ({ contains: likeEscape(w), mode: 'insensitive' as const });
  return prisma.project.findMany({
    where: { companyId: user.companyId, archivedAt: null, AND: words.map((w) => ({ OR: [{ name: has(w) }, { address: has(w) }, { city: has(w) }, { plantNumber: has(w) }] })) },
    orderBy: { updatedAt: 'desc' }, take: 8, select: IMPIANTO_SELECT,
  });
}

/** A survey of an installation as its page lists it: its data, who wrote it, its supplier modules. */
export interface RilievoElencato {
  dati: RilievoDati;
  autore: string | null;
  moduli: ModuloLink[];
}

/** The installation's surveys out of the trash, newest first (the first is the reference). */
export async function rilieviImpianto(user: SessionUser, projectId: string): Promise<RilievoElencato[]> {
  const rows = await prisma.scheda.findMany({
    where: { companyId: user.companyId, projectId, deletedAt: null }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], take: 100,
    select: { ...RILIEVO_SELECT, ...MODULI_SELECT, createdBy: { select: { name: true } } },
  });
  return rows.map((s) => ({ dati: rilievoDati(s), autore: s.createdBy?.name ?? null, moduli: moduliDi(s) }));
}

/** The reference survey of an installation (its newest), or null. */
export async function rilievoDiRiferimento(user: SessionUser, projectId: string): Promise<RilievoDati | null> {
  const s = await prisma.scheda.findFirst({
    where: { companyId: user.companyId, projectId, deletedAt: null }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], select: RILIEVO_SELECT,
  });
  return s ? rilievoDati(s) : null;
}

/** The names of the company's installations among these ids (the activity log's links of the surveys). */
export async function nomiImpianti(user: SessionUser, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.project.findMany({ where: { id: { in: [...ids] }, companyId: user.companyId }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}
