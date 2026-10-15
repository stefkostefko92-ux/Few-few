// Round 46a (scripts/keep-set-pdfs.ts), with the renderer and the database replaced: only the sets without a kept PDF
// that the running engines still draw are drawn and kept; a second run draws nothing (idempotent); a PDF already kept —
// before the walk, between the list and the set, or by another process during the render (the insert skips it: the
// P2002 path) — is never drawn again nor replaced; a busy renderer is tried again; the sets no longer drawn are listed.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../src/${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Kind = 'shaft' | 'room' | 'stale' | 'none' | 'throws';
interface Fake { kind: Kind; companyId: string; busy?: number; raceKeep?: boolean }
const SETS: Record<string, Fake> = {
  a: { kind: 'shaft', companyId: 'c1' }, b: { kind: 'room', companyId: 'c2' }, c: { kind: 'stale', companyId: 'c1' }, d: { kind: 'shaft', companyId: 'c1' },
  e: { kind: 'shaft', companyId: 'c1' }, f: { kind: 'shaft', companyId: 'c2', busy: 1 }, g: { kind: 'room', companyId: 'c1', raceKeep: true }, h: { kind: 'none', companyId: 'c2' },
};
const kept = new Map<string, Uint8Array>([['d', Buffer.from('pdf d issued')]]);
/** sets kept by the server between the walk's list and the set's read */
const keptMeanwhile = new Set(['e']);
const rendered: string[] = [];
let busyLeft: Record<string, number> = {};

class Busy extends Error {}
mock.module(src('lib/report/render.ts'), { namedExports: {
  RendererBusy: Busy,
  renderTavole: async (doc: { set: string }) => {
    if ((busyLeft[doc.set] ?? 0) > 0) { busyLeft[doc.set]--; throw new Busy(); }
    rendered.push(doc.set);
    if (SETS[doc.set]?.raceKeep && !kept.has(doc.set)) kept.set(doc.set, Buffer.from(`pdf ${doc.set} other process`));
    return Buffer.from(`pdf ${doc.set} walk`);
  },
} });
const sha = (b: Uint8Array) => Buffer.from(b).toString();
const pdfOf = (id: string) => sha(kept.get(id) ?? new Uint8Array());
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  drawingSet: { findMany: async ({ where }: { where: { pdf: null } }) => (where.pdf === null ? Object.keys(SETS).filter((id) => !kept.has(id) || keptMeanwhile.has(id)) : [])
    .map((id) => ({ id, companyId: SETS[id].companyId })) },
  drawingSetPdf: {
    createMany: async ({ data, skipDuplicates }: { data: { drawingSetId: string; data: Uint8Array }[]; skipDuplicates: boolean }) => {
      const [row] = data;
      if (!row) return { count: 0 };
      if (kept.has(row.drawingSetId)) {
        if (!skipDuplicates) throw Object.assign(new Error('unique'), { code: 'P2002' });
        return { count: 0 };
      }
      kept.set(row.drawingSetId, row.data);
      return { count: 1 };
    },
    findUnique: async ({ where }: { where: { drawingSetId: string } }) => {
      const k = kept.get(where.drawingSetId);
      return k ? { data: k, sha256: sha(k) } : null;
    },
  },
  $disconnect: async () => {},
} } });
mock.module(src('server/queries.ts'), { namedExports: {
  getDrawingSet: async (user: { companyId: string }, id: string) => {
    const f = SETS[id];
    if (!f || f.companyId !== user.companyId) return null;
    if (keptMeanwhile.has(id) && !kept.has(id)) kept.set(id, Buffer.from(`pdf ${id} server`));
    const k = kept.get(id);
    return {
      id, companyId: f.companyId, number: `26-0${id}`, revision: 0, year: 2026, seq: 1, createdAt: new Date('2026-10-01T08:00:00Z'), companyName: 'Ditta', project: { name: `Impianto ${id}` },
      calculation: {}, logo: null, clientLogo: null, shaftDesign: f.kind === 'shaft' || f.kind === 'stale' || f.kind === 'throws' ? {} : null, roomDesign: f.kind === 'room' ? {} : null,
      pdf: k ? { sha256: sha(k) } : null,
    };
  },
} });
const draw = (id: string) => {
  if (SETS[id].kind === 'throws') throw new Error(`compose ${id} failed`);
  return SETS[id].kind === 'stale' ? { ok: false, error: 'engineChanged' } : { doc: { set: id } };
};
mock.module(src('server/drawing-compose.ts'), { namedExports: { composeStored: (s: { id: string }) => draw(s.id) } });
mock.module(src('server/room-compose.ts'), { namedExports: { composeStoredRoom: (s: { id: string }) => draw(s.id) } });
mock.module(src('server/set-identity.ts'), { namedExports: { firstIssuedAt: async () => null } });
mock.module(src('lib/log.ts'), { namedExports: { log: { error: () => {}, info: () => {} } } });
mock.module(pkg('next/server'), { namedExports: { after: (fn: () => unknown) => { void fn(); } } });

const { keepSetPdfs } = await import('../keep-set-pdfs');
const outcomes = (lines: { id: string; outcome: string }[]) => Object.fromEntries(lines.map((l) => [l.id, l.outcome]));

test('elenco senza disegnare: --dry-run non disegna nulla', async () => {
  const lines = await keepSetPdfs({ dryRun: true, waitMs: 1 });
  assert.deepEqual(rendered, []);
  assert.deepEqual(outcomes(lines), { a: 'listed', b: 'listed', c: 'stale', e: 'already', f: 'listed', g: 'listed', h: 'notFound' });
  assert.ok(!kept.has('a') && !kept.has('b'));
});

test('disegna solo i set riprodotti senza PDF, uno alla volta; mai un PDF già tenuto', async () => {
  busyLeft = { f: 1 };
  const before = { d: pdfOf('d'), e: pdfOf('e') };
  const lines = await keepSetPdfs({ waitMs: 1 });
  assert.deepEqual(outcomes(lines), { a: 'kept', b: 'kept', c: 'stale', e: 'already', f: 'kept', g: 'kept', h: 'notFound' });
  // the whole project's and the replacement's sets drawn, the busy renderer tried again; never d (kept before) nor e
  // (kept between the list and its read)
  assert.deepEqual(rendered, ['a', 'b', 'f', 'g']);
  assert.equal(pdfOf('a'), 'pdf a walk');
  assert.equal(pdfOf('d'), before.d);
  assert.equal(pdfOf('e'), before.e);
  // the P2002 path: another process kept g during the render — its PDF stays, the walk reports it, no error
  assert.equal(pdfOf('g'), 'pdf g other process');
  assert.equal(lines.find((l) => l.id === 'g')?.sha256, 'pdf g other process');
  assert.equal(kept.has('c'), false, 'a set no longer drawn is only listed');
});

test('idempotente: un secondo passaggio non disegna nulla', async () => {
  const n = rendered.length, snapshot = new Map(kept);
  const lines = await keepSetPdfs({ waitMs: 1 });
  assert.equal(rendered.length, n);
  assert.deepEqual(outcomes(lines), { c: 'stale', e: 'already', h: 'notFound' });
  for (const [id, pdf] of snapshot) assert.equal(pdfOf(id), sha(pdf));
});

test('renderer sempre occupato: il set fallisce dopo i tentativi, gli altri continuano', async () => {
  SETS.i = { kind: 'shaft', companyId: 'c1' };
  busyLeft = { i: 99 };
  const lines = await keepSetPdfs({ tries: 3, waitMs: 1 });
  const i = lines.find((l) => l.id === 'i');
  assert.equal(i?.outcome, 'failed');
  assert.equal(busyLeft.i, 96, 'three tries');
  assert.equal(kept.has('i'), false);
});

test('un set che lancia mentre si ridisegna: «failed» con il motivo, il giro continua sugli altri', async () => {
  SETS.j = { kind: 'throws', companyId: 'c1' };
  SETS.k = { kind: 'shaft', companyId: 'c2' };
  busyLeft = {};
  const lines = await keepSetPdfs({ waitMs: 1 });
  const j = lines.find((l) => l.id === 'j');
  assert.deepEqual([j?.outcome, j?.error], ['failed', 'compose j failed']);
  assert.equal(lines.find((l) => l.id === 'k')?.outcome, 'kept', 'the sets after it are kept');
  // a set without a design to draw it from: not found, the reason named
  assert.deepEqual(lines.find((l) => l.id === 'h')?.error, 'noDesign');
  delete SETS.j;
});
