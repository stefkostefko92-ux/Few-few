import 'server-only';
// The reads of the link between surveys and installations (round 44), always within the company of the signed-in user:
// an installation or a survey of another company is "not found". The survey's page: the installation it is linked to,
// the suggestions (src/lib/collega/suggerimenti.ts) among the company's active installations, the search of another
// one. The installation's page: its surveys newest first, with their supplier modules. The reads of an installation's
// surveys give nothing to a role without 'rilievi:view' (whatever page calls them).
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { likeEscape, searchWords } from '@/lib/dashboard';
import { MODULI_SELECT, moduliDi, type ModuloLink } from '@/lib/collega/moduli';
import { RILIEVO_SELECT, rilievoDati, type RilievoDati } from '@/lib/collega/rilievo';
import { suggerimenti, type Candidato, type Suggerimento } from '@/lib/collega/suggerimenti';
import { paroleDaCercare } from '@/lib/collega/testo';

/** What a page shows of an installation the survey is (or may be) linked to. */
export const IMPIANTO_SELECT = { id: true, name: true, address: true, city: true, province: true, plantNumber: true, archivedAt: true } as const;

/** The installation a survey is linked to (the company's); null when none or not readable. */
export function impiantoDi(user: SessionUser, projectId: string | null) {
  if (!projectId) return Promise.resolve(null);
  return prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: IMPIANTO_SELECT });
}

/** An installation as the suggestions read it, with its linked surveys out of the trash — the newest 20, or in the query
 *  by code only those of the same matricola or number (`schede`), so that a match is never cut off. */
const candidatoSelect = (schede: object) => ({
  id: true, name: true, address: true, city: true, province: true, plantNumber: true, updatedAt: true,
  schede: { where: { deletedAt: null, ...schede }, orderBy: [{ data: 'desc' as const }, { createdAt: 'desc' as const }], take: 20,
    select: { matricola: true, numeroImpianto: true, indirizzo: true } },
});

/** At most this many installations of the same matricola or number, and of the same address words, are read. */
export const MAX_CODICE = 10, MAX_INDIRIZZO = 50;

/** The company's active installations that may be the survey's (the ranking and the reasons are suggerimenti.ts), read in
 *  two queries so that the strongest reason is never crowded out: those of the same «Numero di matricola» or with a
 *  survey of the same matricola or number (no address words, at most 10), then those with a word of the address in
 *  theirs or in a survey's (at most 50, latest changed) — merged by id. */
export async function candidatiPer(user: SessionUser, r: { matricola: string | null; numeroImpianto: string | null; indirizzo: string | null }): Promise<Candidato[]> {
  const active = { companyId: user.companyId, archivedAt: null };
  const codes = [...(r.matricola ? [{ matricola: r.matricola }] : []), ...(r.numeroImpianto ? [{ numeroImpianto: r.numeroImpianto }] : [])];
  const byCode = codes.length ? [...(r.matricola ? [{ plantNumber: r.matricola }] : []), { schede: { some: { deletedAt: null, OR: codes } } }] : [];
  const byAddress = paroleDaCercare(r.indirizzo).flatMap((w) => {
    const has = { contains: likeEscape(w), mode: 'insensitive' as const };
    return [{ address: has }, { schede: { some: { deletedAt: null, indirizzo: has } } }];
  });
  const [code, address] = await Promise.all([
    byCode.length ? prisma.project.findMany({ where: { ...active, OR: byCode }, orderBy: { updatedAt: 'desc' }, take: MAX_CODICE, select: candidatoSelect({ OR: codes }) })
      : Promise.resolve([]),
    byAddress.length ? prisma.project.findMany({ where: { ...active, OR: byAddress }, orderBy: { updatedAt: 'desc' }, take: MAX_INDIRIZZO, select: candidatoSelect({}) })
      : Promise.resolve([]),
  ]);
  const out = new Map<string, Candidato>();
  for (const c of [...code, ...address]) {
    const seen = out.get(c.id);
    out.set(c.id, seen ? { ...seen, schede: [...seen.schede, ...c.schede] } : c);
  }
  return [...out.values()];
}

/** The suggestions for a survey (not the installation it is linked to). */
export async function suggerimentiPer(user: SessionUser, r: { matricola: string | null; numeroImpianto: string | null; indirizzo: string | null; projectId: string | null }): Promise<Suggerimento[]> {
  return suggerimenti(r, await candidatiPer(user, r));
}

/** The company's active installations by the words searched — each in the name, the address, the municipality, the
 *  «Numero di matricola» or the matricola or number of a linked survey (as the top bar's search, queries.ts): at most 8. */
export function cercaImpianti(user: SessionUser, q: unknown) {
  const words = searchWords(q);
  if (words.length === 0) return Promise.resolve([]);
  const has = (w: string) => ({ contains: likeEscape(w), mode: 'insensitive' as const });
  return prisma.project.findMany({
    where: { companyId: user.companyId, archivedAt: null, AND: words.map((w) => ({ OR: [{ name: has(w) }, { address: has(w) }, { city: has(w) }, { plantNumber: has(w) },
      { schede: { some: { deletedAt: null, OR: [{ matricola: has(w) }, { numeroImpianto: has(w) }] } } }] })) },
    orderBy: { updatedAt: 'desc' }, take: 8, select: IMPIANTO_SELECT,
  });
}

/** A survey of an installation as its page lists it: its data, who wrote it, its supplier modules. */
export interface RilievoElencato {
  dati: RilievoDati;
  autore: string | null;
  moduli: ModuloLink[];
}

/** The installation's surveys out of the trash, newest first (the first is the reference); none without 'rilievi:view'. */
export async function rilieviImpianto(user: SessionUser, projectId: string): Promise<RilievoElencato[]> {
  if (!can(user, 'rilievi:view')) return [];
  const rows = await prisma.scheda.findMany({
    where: { companyId: user.companyId, projectId, deletedAt: null }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], take: 100,
    select: { ...RILIEVO_SELECT, ...MODULI_SELECT, createdBy: { select: { name: true } } },
  });
  return rows.map((s) => ({ dati: rilievoDati(s), autore: s.createdBy?.name ?? null, moduli: moduliDi(s) }));
}

/** The reference survey of an installation (its newest), or null (also without 'rilievi:view'). */
export async function rilievoDiRiferimento(user: SessionUser, projectId: string): Promise<RilievoDati | null> {
  if (!can(user, 'rilievi:view')) return null;
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
