// The PDF of an issued drawing set is rendered once (round 46): the background render after the issue and a first
// download right after it share one render and one insert — no second render, no failed insert on the unique set; a
// set another process kept first is served as that one.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

let renders = 0, inserts = 0;
const kept = new Map<string, Uint8Array>();
mock.module(src('lib/report/render.ts'), { namedExports: {
  RendererBusy: class extends Error {},
  renderTavole: async () => { renders++; await new Promise((r) => setTimeout(r, 30)); return Buffer.from(`pdf ${renders}`); },
} });
mock.module(src('lib/db.ts'), { namedExports: { prisma: { drawingSetPdf: {
  createMany: async ({ data, skipDuplicates }: { data: { drawingSetId: string; data: Uint8Array }[]; skipDuplicates: boolean }) => {
    inserts++;
    const [row] = data;
    if (!row) return { count: 0 };
    if (kept.has(row.drawingSetId)) {
      if (!skipDuplicates) throw Object.assign(new Error('unique'), { code: 'P2002' });
      return { count: 0 };
    }
    kept.set(row.drawingSetId, row.data);
    return { count: 1 };
  },
  findUnique: async ({ where }: { where: { drawingSetId: string } }) => (kept.has(where.drawingSetId) ? { data: kept.get(where.drawingSetId) } : null),
} } } });
mock.module(src('lib/log.ts'), { namedExports: { log: { error: () => {}, info: () => {} } } });
mock.module(pkg('next/server'), { namedExports: { after: (fn: () => unknown) => { void fn(); } } });

test('due primi rendering insieme: uno solo, un solo inserimento, lo stesso PDF', async () => {
  const { keepSetPdf } = await import(src('server/drawing-pdf.ts'));
  const doc = { pages: [] }, at = new Date('2026-10-15T08:00:00Z');
  const [a, b] = await Promise.all([keepSetPdf('set1', doc, at), keepSetPdf('set1', doc, at)]);
  assert.equal(renders, 1, 'one render');
  assert.equal(inserts, 1, 'one insert');
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
  // once kept, a set kept by another process meanwhile: its PDF, no error
  kept.set('set2', Buffer.from('kept elsewhere'));
  const c = await keepSetPdf('set2', doc, at);
  assert.equal(Buffer.from(c).toString(), 'kept elsewhere');
});
