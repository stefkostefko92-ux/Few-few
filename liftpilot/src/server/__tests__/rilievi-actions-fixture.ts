// The survey sheets' server over an in-memory database, for rilievi-actions.test.ts and rilievi-collegati-actions.test.ts
// (rilievi's integration tests, commit ae6329cb6): the module mocks are set up on import — the database, the session,
// the environment, Next.js' headers and redirect —; `as` signs a user in (the role's default rights, or `caps` as the
// company set them), `session()` is that user as the pages take it, `signOut()` leaves no one signed in.
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

export type Row = Record<string, unknown>;
export const schede: Row[] = [], misure: Row[] = [], audits: Row[] = [];
let clock = Date.parse('2026-10-12T08:00:00Z'), seq = 0;
const tick = () => new Date((clock += 1000));
const NAMES: Record<string, string> = { u1: 'Mario Bianchi', u2: 'Luca Verdi', u3: 'Anna Neri', u4: 'Sara Blu', u9: 'Altra Ditta' };

const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([k, v]) => {
  if (v === null) return row[k] === null;
  if (v instanceof Date) return row[k] instanceof Date && (row[k] as Date).getTime() === v.getTime();
  if (v && typeof v === 'object' && 'not' in v) return row[k] !== (v as { not: unknown }).not;
  if (v && typeof v === 'object' && 'in' in v) return (v as { in: unknown[] }).in.includes(row[k]);
  return row[k] === v;
});
const full = (s: Row): Row => ({
  ...s,
  misureBottoniere: misure.filter((m) => m.schedaId === s.id).sort((a, b) => Number(a.fermata) - Number(b.fermata)),
  createdBy: s.createdById ? { name: NAMES[String(s.createdById)] } : null,
  updatedBy: s.updatedById ? { name: NAMES[String(s.updatedById)] } : null,
  deletedBy: s.deletedById ? { name: NAMES[String(s.deletedById)] } : null,
  company: { id: s.companyId, name: s.companyId === 'c1' ? 'Ascensori Rossi Srl' : 'Altra Ditta', ordineSezioni: companies[String(s.companyId)]?.ordineSezioni ?? [] },
});
export const companies: Record<string, { ordineSezioni: string[] }> = { c1: { ordineSezioni: [] }, c2: { ordineSezioni: [] } };
const db = {
  scheda: {
    create: async ({ data }: { data: Row & { misureBottoniere: { createMany: { data: Row[] } } } }) => {
      const { misureBottoniere, ...rest } = data;
      const at = tick();
      const row: Row = { id: `cm${String(++seq).padStart(22, '0')}`, deletedAt: null, deletedById: null, createdAt: at, updatedAt: at, ...rest };
      schede.push(row);
      for (const m of misureBottoniere.createMany.data) misure.push({ ...m, schedaId: row.id });
      return row;
    },
    findFirst: async ({ where }: { where: Row }) => { const s = schede.find((r) => matches(r, where)); return s ? full(s) : null; },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = schede.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data, { updatedAt: tick() });
      return { count: hit.length };
    },
    count: async ({ where }: { where: Row }) => schede.filter((r) => matches(r, where)).length,
    deleteMany: async ({ where }: { where: Row }) => {
      const hit = schede.filter((r) => matches(r, where));
      for (const r of hit) {
        schede.splice(schedeIndex(r), 1);
        for (let i = misure.length - 1; i >= 0; i--) if (misure[i]?.schedaId === r.id) misure.splice(i, 1);
      }
      return { count: hit.length };
    },
  },
  misuraBottoniera: {
    deleteMany: async ({ where }: { where: Row }) => {
      const before = misure.length;
      for (let i = misure.length - 1; i >= 0; i--) if (misure[i]?.schedaId === where.schedaId) misure.splice(i, 1);
      return { count: before - misure.length };
    },
    createMany: async ({ data }: { data: Row[] }) => { misure.push(...data); return { count: data.length }; },
  },
  auditLog: { create: async ({ data }: { data: Row }) => { audits.push(data); return data; } },
  company: {
    findUnique: async ({ where }: { where: { id: string } }) => ({ logo: null, ordineSezioni: companies[where.id]?.ordineSezioni ?? [] }),
    updateMany: async ({ where, data }: { where: { id: string }; data: { ordineSezioni: string[] } }) => {
      const row = companies[where.id];
      if (!row) return { count: 0 };
      row.ordineSezioni = data.ordineSezioni;
      return { count: 1 };
    },
  },
  $transaction: async (fn: unknown) => (typeof fn === 'function' ? fn(db) : Promise.all(fn as Promise<unknown>[])),
};
const schedeIndex = (r: Row) => schede.indexOf(r);

class Redirect extends Error { constructor(readonly url: string) { super(`redirect ${url}`); } }
let user: Record<string, unknown> | null = null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(src('lib/env.ts'), { namedExports: { env: () => ({ REPORT_FONT_DIR: process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu' }), publicBaseUrl: () => 'http://x' } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (url: string) => { throw new Redirect(url); } } });

export const as = (id: string, role: string, companyId = 'c1', readOnly = false, caps?: ReadonlySet<string>) => {
  user = { id, email: `${id}@example.it`, name: NAMES[id] ?? id, role, locale: 'it', companyId, companyName: companyId === 'c1' ? 'Ascensori Rossi Srl' : 'Altra Ditta', mustChangePassword: false, readOnly, ...(caps ? { caps } : {}) };
};
/** The signed-in user as the pages take it (a SessionUser). */
export const session = (): never => user as never;
export const signOut = () => { user = null; };
export const form = (fields: Record<string, string | string[]>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
export const redirected = async (p: Promise<unknown>): Promise<string> => {
  try { await p; } catch (e) { if (e instanceof Redirect) return e.url; throw e; }
  assert.fail('expected a redirect');
};

export const SHEET = {
  data: '2026-10-12', indirizzo: 'Via Giuseppe Verdi 14, Milano', marca: 'Schindler', matricola: '0033871', numeroImpianto: '104552',
  portataKg: '630', capienzaPersone: '8', fermate: '3', tipoPorte: 'MANUALI', pattinoRetrattile: 'si', pattinoRetrattileNumero: '2', sospensioni: 'si', sospensioniNumero: '5',
  bottoniereMisure: 'si', 'mb-1-piano': 'S1', 'mb-1-lunghezzaMm': '320,5', 'mb-1-display': 'si', 'mb-2-piano': '2', 'mb-3-display': 'no',
  quadroMarca: 'PELAZZA', quadroOrdine: 'si', 'oq-_': '1', 'oq-ordine': 'si', 'oq-nFermate': '3',
  arganoMarca: 'MONTANARI', arganoPreventivo: 'no', 'pa-_': '1', 'pa-portata': '630', 'sg-_': '1', 'sg-ordNo': '77',
};
export const actions = () => import(src('server/rilievi/actions.ts'));
export const pages = () => import(src('server/rilievi/pages.ts'));
export const idOf = (url: string) => /\/rilievi\/([a-z0-9]+)/.exec(url)?.[1] ?? '';

export async function created(): Promise<string> {
  const { createRilievoAction } = await actions();
  as('u1', 'TECHNICIAN');
  return idOf(await redirected(createRilievoAction({ status: 'idle' }, form(SHEET))));
}
