// The drawing sets the relazione tecnica of a replacement attaches (round 37, W2-L3a2-02): the company's sets of that
// machine room, every revision in the order of the year, the number and the revision, at most 200 — the relazione
// keeps the latest of each number (report/elaborati.ts latestRevisions) — each with the data of the installation it was
// issued with (elaborati.ts plantChanged).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

let asked: unknown = null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  drawingSet: { findMany: async (a: unknown) => { asked = a; return []; } },
} } });

test('serie di tavole del locale: della ditta, per anno, numero e revisione, al più 200', async () => {
  const { listRoomDrawingSets } = await import(src('server/queries.ts'));
  const user = { id: 'u1', role: 'TECHNICIAN', companyId: 'c-own', companyName: 'Ditta', mustChangePassword: false, readOnly: false };
  await listRoomDrawingSets(user, 'room-1');
  assert.deepEqual(asked, {
    where: { roomDesignId: 'room-1', companyId: 'c-own' },
    orderBy: [{ year: 'asc' }, { seq: 'asc' }, { revision: 'asc' }],
    take: 200,
    select: { number: true, revision: true, sha256: true, plant: true },
  });
});
