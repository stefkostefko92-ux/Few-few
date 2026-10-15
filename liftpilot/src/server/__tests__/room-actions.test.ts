// The machine room's survey saved on a «Calcolo argano» (round 45, phase 3 step 5): on a step-2 calculation of an
// existing lift, whatever the installation was created as (a former whole project's too); refused with 'notLocale' on a
// transformation, on a lift design's calculation and on one of the archive made from a shaft design, with
// 'notLocaleResta' on a modernisation keeping the machine; an archived or
// foreign installation is not found; whoever does not draw the project is refused before anything is looked up.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { snapshotOf } from '@/calc/snapshot';
import { capsOf } from '@/lib/rbac';
import { startSurvey } from '@/lib/room/survey';
import { snapshotHash } from '@/lib/snapshot-hash';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Row = Record<string, unknown>;
let rows: Row[] = [], role = 'ENGINEER';
const saved: string[] = [];
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  calculation: { findFirst: async ({ where }: { where: Row }) => rows.find((r) => r.id === where.id && r.companyId === where.companyId) ?? null },
  formDraft: { deleteMany: async () => ({ count: 0 }) },
} } });
mock.module(src('server/save.ts'), { namedExports: { createRoomDesign: async (_u: unknown, c: { id: string }) => { saved.push(c.id); return { ok: true, id: `room-${c.id}` }; } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => ({ id: 'u1', role, companyId: 'c1', mustChangePassword: false, readOnly: false, caps: capsOf(role as 'ENGINEER') }) } });

const snap = (V: FormValues) => { const s = snapshotOf(V); return { inputs: s.values, sha256: snapshotHash(s) }; };
const calc = (id: string, over: Row = {}): Row => ({
  id, companyId: 'c1', projectId: 'p1', collaudo: null, shaftDesignId: null, liftDesign: null, project: { archivedAt: null }, ...snap(PRESETS.B), ...over,
});
const save = async (calculationId: string) => (await import(src('server/room-actions.ts'))).saveRoomDesignAction({ calculationId, survey: startSurvey(600), label: '' });

test('locale macchina: su ogni calcolo argano di un impianto esistente; mai su trasformazione, progetto o archivio', async () => {
  rows = [
    calc('repl1'),
    calc('trasf1', snap({ ...PRESETS.B, context: 'new' })),
    calc('lift1', { liftDesign: { id: 'd1' } }),
    calc('arch1', { shaftDesignId: 's1' }),
    calc('old1', { project: { archivedAt: new Date('2026-10-01') } }),
    calc('theirs1', { companyId: 'c2' }),
    // a modernisation keeping the machine: no new machine to place in the room (its Progetto is the shaft); the same test
    // saved before the type existed is read as it was
    calc('kept1', { intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-1', parti: ['controller'] } }),
    calc('legacy1', { intervento: null, collaudo: { norma: '10411-1', parti: ['controller'] } }),
  ];
  assert.deepEqual(await save('repl1'), { ok: true, id: 'room-repl1' });
  for (const id of ['trasf1', 'lift1', 'arch1']) assert.deepEqual(await save(id), { ok: false, error: 'notLocale' }, id);
  for (const id of ['old1', 'theirs1']) assert.deepEqual(await save(id), { ok: false, error: 'notFound' }, id);
  assert.deepEqual(await save('kept1'), { ok: false, error: 'notLocaleResta' });
  assert.deepEqual(await save('legacy1'), { ok: true, id: 'room-legacy1' });
  saved.length = 1;
  assert.deepEqual(saved, ['repl1']);
  // the Tecnico calculates but does not draw: refused before anything is looked up
  role = 'TECHNICIAN';
  assert.deepEqual(await save('repl1'), { ok: false, error: 'forbidden' });
  assert.deepEqual(saved, ['repl1']);
});
