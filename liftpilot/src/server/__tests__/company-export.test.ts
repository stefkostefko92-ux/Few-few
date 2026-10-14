// The company's data export (GDPR art. 20, Data Act art. 25) over an in-memory database: every key the public register
// lists, in its order, and the survey sheets of Rilievi among them — the company's own only, the trashed ones too, every
// column with the measurements per stop in their order and the suppliers' modules as stored; never the search index —
// and the rights the company set for its colleagues' roles (round 42), its own only.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

type Row = Record<string, unknown>;
type Args = { where?: Row; orderBy?: unknown; omit?: Record<string, boolean>; include?: { misureBottoniere?: { orderBy?: unknown; omit?: Record<string, boolean> } } };
const SCHEDE: Row[] = [
  { id: 's1', companyId: 'c1', data: new Date('2026-10-12'), matricola: '0033871', portataKg: 630, funiDiametroMm: new Prisma.Decimal('10.5'),
    ordineQuadro: { modulo: 'pelazza-ordine-quadri-032026', valori: { ordine: true } }, preventivoArgano: null, searchText: '0033871',
    deletedAt: null, createdAt: new Date('2026-10-12T09:00:00Z') },
  { id: 's2', companyId: 'c1', data: new Date('2026-10-11'), indirizzo: 'Via Verdi 14', searchText: 'via verdi 14', deletedAt: new Date('2026-10-12T10:00:00Z'),
    createdAt: new Date('2026-10-11T09:00:00Z') },
  { id: 's9', companyId: 'c2', data: new Date('2026-10-12'), matricola: '9', searchText: '9', deletedAt: null, createdAt: new Date('2026-10-12T08:00:00Z') },
];
const MISURE: Row[] = [
  { id: 'm2', schedaId: 's1', fermata: 2, piano: 'T', lunghezzaMm: new Prisma.Decimal('300'), larghezzaMm: null, interasseSuperiore: null, interasseInferiore: null, display: false },
  { id: 'm1', schedaId: 's1', fermata: 1, piano: 'S1', lunghezzaMm: new Prisma.Decimal('320.5'), larghezzaMm: new Prisma.Decimal('105'), interasseSuperiore: '60 mm', interasseInferiore: null, display: true },
];
let schedaArgs: Args | null = null, permArgs: Args | null = null;
let companyArgs: { select?: Record<string, boolean> } | null = null;
let projectArgs: { include?: Record<string, { select?: Record<string, unknown> }> } | null = null;
const PERMS: Row[] = [
  { companyId: 'c1', role: 'TECHNICIAN', capability: 'calc:create', granted: false, updatedById: 'u1', updatedAt: new Date('2026-10-14T08:00:00Z') },
  { companyId: 'c2', role: 'SALES', capability: 'prices:view', granted: false, updatedById: 'u9', updatedAt: new Date('2026-10-14T08:00:00Z') },
];
const none = async () => [];
const without = (row: Row, omit: Record<string, boolean> | undefined): Row => Object.fromEntries(Object.entries(row).filter(([k]) => !omit?.[k]));
const db = {
  company: {
    findUnique: async (args: { select?: Record<string, boolean> }) => {
      companyArgs = args;
      return { id: 'c1', name: 'Ascensori Rossi Srl', ordineSezioni: ['note'] };
    },
  },
  user: { findMany: none }, invite: { findMany: none }, companyLogo: { findMany: none },
  project: { findMany: async (args: typeof projectArgs) => { projectArgs = args; return []; } },
  priceItem: { findMany: none }, customPriceItem: { findMany: none }, auditLog: { findMany: none },
  companyRolePermission: {
    findMany: async (args: Args) => { permArgs = args; return PERMS.filter((p) => p.companyId === args.where?.companyId); },
  },
  scheda: {
    findMany: async (args: Args) => {
      schedaArgs = args;
      return SCHEDE.filter((s) => Object.entries(args.where ?? {}).every(([k, v]) => s[k] === v))
        .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
        .map((s) => ({
          ...without(s, args.omit),
          ...(args.include?.misureBottoniere ? {
            misureBottoniere: MISURE.filter((m) => m.schedaId === s.id).sort((a, b) => Number(a.fermata) - Number(b.fermata))
              .map((m) => without(m, args.include?.misureBottoniere?.omit)),
          } : {}),
        }));
    },
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });

test('l’esportazione: ogni chiave del registro, e le schede di rilievo della propria azienda, anche nel cestino, con le misure', async () => {
  const { companyExport } = await import(src('server/company-export.ts'));
  const { EXPORT_DATA, EXPORT_ENVELOPE, EXPORT_FORMAT_VERSION } = await import(src('lib/export-format.ts'));
  const doc = await companyExport('c1');
  assert.ok(doc);
  assert.deepEqual(Object.keys(doc), [...EXPORT_ENVELOPE, ...EXPORT_DATA], 'the keys of the public register, in its order');
  assert.equal(doc.formatVersion, EXPORT_FORMAT_VERSION);
  assert.equal(companyArgs?.select?.ordineSezioni, true, 'the company’s order of the sheet’s sections (a setting it entered)');
  assert.deepEqual(schedaArgs?.where, { companyId: 'c1' }, 'the company’s sheets, the trashed ones included (no deletedAt filter)');
  const schede = doc.schede as Row[];
  assert.deepEqual(schede.map((s) => s.id), ['s2', 's1'], 'oldest first, the other company’s never');
  assert.ok(schede.every((s) => !('searchText' in s)), 'the search index is the software’s, not the company’s data');
  assert.ok(schede[0]?.deletedAt instanceof Date, 'a trashed sheet says when');
  const s1 = schede[1] as Row & { misureBottoniere: Row[] };
  assert.deepEqual(s1.misureBottoniere.map((m) => [m.fermata, m.piano, String(m.lunghezzaMm), m.display]), [[1, 'S1', '320.5', true], [2, 'T', '300', false]]);
  assert.ok(s1.misureBottoniere.every((m) => !('schedaId' in m)));
  assert.deepEqual(s1.ordineQuadro, { modulo: 'pelazza-ordine-quadri-032026', valori: { ordine: true } });
  // as the file is written: Decimal as text, dates in ISO 8601
  const json = JSON.parse(JSON.stringify(doc)) as { schede: (Row & { misureBottoniere: Row[] })[] };
  assert.equal(json.schede[1]?.funiDiametroMm, '10.5');
  assert.equal(json.schede[1]?.misureBottoniere[1]?.lunghezzaMm, '300');
  assert.equal(json.schede[0]?.deletedAt, '2026-10-12T10:00:00.000Z');
  // the rights matrix as the company set it: its rows only
  assert.deepEqual(permArgs?.where, { companyId: 'c1' });
  assert.deepEqual((doc.rolePermissions as Row[]).map((p) => [p.role, p.capability, p.granted]), [['TECHNICIAN', 'calc:create', false]]);
  // format 8 (round 45): each calculation names the intervention declared with it, each lift design its base calculation
  assert.equal(projectArgs?.include?.calculations?.select?.intervento, true);
  assert.equal(projectArgs?.include?.liftDesigns?.select?.baseCalculationId, true);
  assert.equal(doc.formatVersion, 8);
});
