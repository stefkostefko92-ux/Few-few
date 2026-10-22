// The preview beside a form (round 50, GET /api/allegati/[id]/anteprima) and the list of an installation's sketches
// (GET /api/projects/[id]/schizzi), over the in-memory database with the real image tools: whoever sees the
// installations, a sketch only (another kind, another company's file «not found»; the limits and the memory of the
// previews: schizzi-anteprima-limiti.test.ts); a picture made again by us — a JPEG turned upright, a PDF's page as
// a PNG (pages 1..4 within its own) —, inline, sandboxed, cached privately for 5 minutes, its pages in X-Pagine; the
// list of the SCHIZZO files only, newest first, and whether the reading is on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, as, reset, seedFile } from './allegati-db';
import { JPEG, pdf } from '../../lib/__tests__/allegati-fixtures';

const { GET: anteprima } = await import('../../app/api/allegati/[id]/anteprima/route');
const { GET: elenco } = await import('../../app/api/projects/[id]/schizzi/route');
const { sniff } = await import('../../lib/allegati/sniff');

async function get(id: string, query = '') {
  const res = await anteprima(new Request(`${BASE}/api/allegati/${id}/anteprima${query}`), { params: Promise.resolve({ id }) });
  return { res, bytes: new Uint8Array(await res.arrayBuffer()) };
}
const dims = (b: Uint8Array): [string, number, number] => {
  const s = sniff(b);
  return s.ok && s.type !== 'pdf' ? [s.type, s.width, s.height] : ['?', 0, 0];
};

test('anteprima: un JPEG girato come lo teneva il telefono, inline, in sandbox, con le sue pagine', async () => {
  reset();
  const f = seedFile({ projectId: 'p1', size: JPEG.length, kind: 'SCHIZZO', mime: 'image/jpeg', data: JPEG, orientation: 6, width: 24, height: 12 });
  assert.equal((await get(f.id)).res.status, 401);
  as('SALES');
  const { res, bytes } = await get(f.id, '?pagina=3');
  assert.equal(res.status, 200, 'the page is ignored for a picture; a Commerciale sees the installations');
  assert.deepEqual(dims(bytes), ['jpeg', 12, 24]);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.match(res.headers.get('content-disposition') ?? '', /^inline; filename="anteprima-[0-9a-f]{8}-1\.jpg"$/);
  assert.equal(res.headers.get('cache-control'), 'private, max-age=300');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  assert.equal(res.headers.get('x-pagine'), '1');
  assert.notDeepEqual(Buffer.from(bytes), Buffer.from(JPEG), 'never the stored bytes');
});

test('anteprima: la pagina di un PDF in PNG (1..4, dentro le sue pagine); un’altra azienda non trovato', async () => {
  reset();
  as('TECHNICIAN');
  const doc = await pdf(6);
  const f = seedFile({ projectId: 'p1', size: doc.length, kind: 'SCHIZZO', mime: 'application/pdf', data: doc, pages: 6 });
  const { res, bytes } = await get(f.id, '?pagina=4');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-pagine'), '6');
  const [type, w, h] = dims(bytes);
  assert.deepEqual([type, Math.max(w, h)], ['png', 1600]);
  for (const q of ['?pagina=5', '?pagina=0', '?pagina=abc', '?pagina=-1', '?pagina=1e1']) assert.equal((await get(f.id, q)).res.status, 404, q);
  const two = await pdf(2);
  const g = seedFile({ projectId: 'p1', size: two.length, kind: 'SCHIZZO', mime: 'application/pdf', data: two, pages: 2 });
  assert.equal((await get(g.id, '?pagina=3')).res.status, 404, 'past its own pages');
  assert.equal((await get(g.id, '?pagina=2')).res.status, 200);
  const altro = seedFile({ projectId: 'p1', size: two.length, mime: 'application/pdf', data: two, pages: 2 });
  assert.equal((await get(altro.id, '?pagina=1')).res.status, 404, 'a file of another kind: no preview');
  const theirs = seedFile({ projectId: 'pother', size: JPEG.length, kind: 'SCHIZZO', mime: 'image/jpeg', data: JPEG });
  assert.equal((await get(theirs.id)).res.status, 404);
  as('OWNER', { companyId: 'c2' });
  assert.equal((await get(f.id)).res.status, 404);
});

test('elenco: solo gli schizzi dell’impianto, i più recenti prima, e se la lettura automatica è attiva', async () => {
  reset();
  const call = async (id: string) => {
    const res = await elenco(new Request(`${BASE}/api/projects/${id}/schizzi`), { params: Promise.resolve({ id }) });
    return { status: res.status, body: res.status === 200 ? (await res.json()) as { ok: boolean; aiEnabled: boolean; schizzi: { id: string; component: string | null; mime: string; pages: number }[] } : null };
  };
  assert.equal((await call('p1')).status, 401);
  as('SALES');
  const a = seedFile({ projectId: 'p1', size: 3, kind: 'SCHIZZO', component: 'vano', mime: 'image/png' });
  seedFile({ projectId: 'p1', size: 3, kind: 'FOTO' });
  seedFile({ projectId: 'p2', size: 3, kind: 'SCHIZZO' });
  const b = seedFile({ projectId: 'p1', size: 3, kind: 'SCHIZZO', component: 'locale', mime: 'application/pdf', pages: 3 });
  const r = await call('p1');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body?.schizzi.map((s) => [s.id, s.component, s.mime, s.pages]).sort(), [[a.id, 'vano', 'image/png', 1], [b.id, 'locale', 'application/pdf', 3]].sort());
  assert.equal(r.body?.aiEnabled, false, 'no Vertex settings in this test');
  assert.equal((await call('pother')).status, 404);
  assert.equal((await call('../p1')).status, 404);
});
