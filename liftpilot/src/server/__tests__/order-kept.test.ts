// The draft order of a modernisation that keeps the existing machine (round 45, phase 3 step 4): nothing to order — the
// export refuses ('machineKept', 422 at the route) before any machine is chosen or drawn; the same test saved before
// the type existed (no type: read as before) and a modernisation replacing the machine go on to the order. Against a
// database in memory, the renderer replaced.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PRESETS } from '@/calc/presets';
import { snapshotOf } from '@/calc/snapshot';
import type { SessionUser } from '@/lib/auth';
import { capsOf } from '@/lib/rbac';
import { snapshotHash } from '@/lib/snapshot-hash';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;
type Row = Record<string, unknown>;
const rendered: string[] = [];
let calc: Row | null = null;
mock.module(src('server/queries.ts'), { namedExports: {
  getCalculation: async () => calc,
  getLiftDesign: async () => null,
  getLetterhead: async () => ({ company: 'Ditta di prova', companyCity: 'Milano', logo: null }),
} });
mock.module(src('lib/report/render.ts'), { namedExports: {
  renderPdf: async (doc: { meta: { title: string } }) => { rendered.push(doc.meta.title); return Buffer.from('%PDF'); },
  renderPictures: async () => ({}),
  renderTavole: async () => Buffer.from('%PDF'),
  RendererBusy: class extends Error {},
} });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: () => { throw new Error('redirect'); }, notFound: () => { throw new Error('notFound'); } } });
mock.module(src('server/prices.ts'), { namedExports: { companyPrices: async () => new Map() } });

const user: SessionUser = {
  id: 'u1', email: 'tecnico@example.com', name: 'Tecnico', role: 'TECHNICIAN', locale: 'it', companyId: 'c1', companyName: 'Ditta', mustChangePassword: false,
  access: 'active', trialDays: 0, readOnly: false, caps: capsOf('TECHNICIAN'), terms: 'ok', termsBinding: null, modalita: 'semplice',
};
const s = snapshotOf(PRESETS.B);
const calcOf = (collaudo: unknown, intervento: string | null): Row => ({
  id: 'k1', companyId: 'c1', label: null, createdAt: new Date('2026-10-14T08:00:00Z'), inputs: s.values, sha256: snapshotHash(s), collaudo, intervento,
  shaftDesign: null, liftDesign: null, project: { name: 'Impianto di prova', address: null, city: null, province: null, plantNumber: null, plant: null },
});
const exportOrder = async (): Promise<{ ok: boolean; error?: string }> => (await import(src('server/order-export.ts'))).exportCalcOrder(user, 'k1', 'pdf');

test('ordine: l’argano che resta non si ordina; il resto come prima', async () => {
  const kept = { norma: '10411-1', parti: ['controller', 'ropes'] };
  calc = calcOf(kept, 'AMMODERNAMENTO');
  assert.deepEqual(await exportOrder(), { ok: false, error: 'machineKept' });
  assert.equal(rendered.length, 0);
  // the same test saved before the type existed: read as before (an order of the advice's machine)
  calc = calcOf(kept, null);
  assert.equal((await exportOrder()).ok, true);
  // a modernisation replacing the machine orders it
  calc = calcOf({ norma: '10411-1', parti: ['machine', 'controller'] }, 'AMMODERNAMENTO');
  assert.equal((await exportOrder()).ok, true);
  assert.equal(rendered.length, 2);
});
