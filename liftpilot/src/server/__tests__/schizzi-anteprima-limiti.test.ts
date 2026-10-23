// The preview's limits (round 50, GET /api/allegati/[id]/anteprima; review R50-RT-1, RT-2) with the image tools' child
// processes faked (src/lib/report/render.ts mocked: no pdftoppm, no Pillow — the fake writes the file the tool would):
// only a sketch (kind SCHIZZO) is previewed, whatever the user's right to download — any other kind «not found»; 30
// previews in 10 minutes per user; a preview drawn once is answered from memory without any renderer or the file's bytes
// (48 previews, 48 MB, the least recently used forgotten first); one preview drawn at a time in the whole server — never
// two renderer slots: the others wait a short turn without one, a few at most —, one under way per company (else
// «busy»: 503 with Retry-After); pdftoppm cut at 8 s for a preview, at 20 s for the model's pictures.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE, as, reset, seedFile, state, type FileRow } from './allegati-db';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

class RendererBusy extends Error {}
interface FakeChild { bin: string; args: string[]; input: string; timeoutMs: number }
const spawns: { tool: string; timeoutMs: number }[] = [];
/** while set, every tool waits for it */
let gate: Promise<void> | null = null;
const slots = { now: 0, max: 0 };
mock.module(src('lib/report/render.ts'), {
  namedExports: {
    PRLIMIT: null, RendererBusy, MAX_FASCICOLO_BYTES: 0,
    busyResponse: () => new Response('busy', { status: 503, headers: { 'Retry-After': '5' } }),
    withRendererSlot: async (fn: () => Promise<unknown>) => {
      slots.now++;
      slots.max = Math.max(slots.max, slots.now);
      try {
        return await fn();
      } finally {
        slots.now--;
      }
    },
    spawnChild: async (c: FakeChild) => {
      spawns.push({ tool: c.bin, timeoutMs: c.timeoutMs });
      if (gate) await gate;
      if (c.bin === 'pdftoppm') {
        for (let p = Number(c.args[1]); p <= Number(c.args[3]); p++) writeFileSync(`${c.args.at(-1) ?? ''}-${p}.png`, Buffer.alloc(100, 1));
      } else {
        const { dir, jobs } = JSON.parse(c.input) as { dir: string; jobs: { out: string }[] };
        for (const j of jobs) writeFileSync(path.join(dir, j.out), Buffer.alloc(100, 2));
      }
      return Buffer.alloc(0);
    },
    renderPdf: async () => Buffer.alloc(0), renderTavole: async () => Buffer.alloc(0), renderPictures: async () => [],
    runPdfTool: async () => Buffer.alloc(0), assembleToFile: async () => { throw new Error('not here'); },
  },
});

const { GET } = await import('../../app/api/allegati/[id]/anteprima/route');
const { modelImages } = await import('../../lib/report/image-tool');
const { ANTEPRIMA_LIMITS, byteLru, forgetAnteprime } = await import('../schizzi/anteprime');

// companies c3..c7, one installation each (the queue of the server's turn)
for (let n = 3; n <= 7; n++) state.projects.push({ id: `p${n}x`, companyId: `c${n}`, archivedAt: null });

async function get(id: string, query = '') {
  const res = await GET(new Request(`${BASE}/api/allegati/${id}/anteprima${query}`), { params: Promise.resolve({ id }) });
  return { status: res.status, retry: res.headers.get('retry-after'), bytes: (await res.arrayBuffer()).byteLength };
}
const schizzo = (o: Partial<FileRow> = {}): FileRow =>
  seedFile({ projectId: 'p1', size: 3, kind: 'SCHIZZO', mime: 'image/png', data: new Uint8Array([1, 2, 3]), ...o });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function fresh(): void {
  reset();
  forgetAnteprime();
  spawns.length = 0;
  gate = null;
  slots.max = 0;
}

test('anteprima: solo uno schizzo, anche a chi non può scaricare; ogni altro tipo «non trovato»', async () => {
  fresh();
  as('SALES', { id: 'u-vista' });
  // the company took 'report:download' from the role (a matrix right): the sketch still shows, no other file does
  const caps = state.user?.caps as ReadonlySet<string>;
  state.user = { ...state.user, caps: new Set([...caps].filter((c) => c !== 'report:download')) };
  assert.equal((await get(schizzo().id)).status, 200);
  for (const kind of ['ALTRO', 'RT', 'FOTO', 'CERTIFICATO']) {
    const f = schizzo({ kind, mime: 'application/pdf', pages: 2 });
    assert.equal((await get(f.id, '?pagina=1')).status, 404, kind);
  }
  assert.equal(spawns.length, 1, 'nothing else drawn');
});

test('anteprima: disegnata una volta, poi dalla memoria — senza renderer né i byte del file; pdftoppm a 8 s', async () => {
  fresh();
  as('TECHNICIAN', { id: 'u-memoria' });
  const s = schizzo({ mime: 'application/pdf', pages: 3 });
  assert.equal((await get(s.id, '?pagina=2')).status, 200);
  assert.deepEqual(spawns, [{ tool: 'pdftoppm', timeoutMs: 8000 }], 'a preview’s page cut at 8 s');
  const reads = state.raw.length;
  const again = await get(s.id, '?pagina=2');
  assert.deepEqual([again.status, again.bytes, spawns.length, state.raw.length], [200, 100, 1, reads], 'no tool, no read of the file');
  assert.equal((await get(s.id, '?pagina=3')).status, 200);
  assert.equal(spawns.length, 2, 'another page: drawn');
  // a picture turned another way is another preview
  const j = schizzo({ mime: 'image/jpeg', orientation: 6 }), k = schizzo({ mime: 'image/jpeg', orientation: 1, sha256: j.sha256 });
  for (const f of [j, j, k]) assert.equal((await get(f.id)).status, 200);
  assert.equal(spawns.length, 4);
  // the model's pictures keep their own time
  await modelImages({ load: async () => new Uint8Array([1]), type: 'pdf', orientation: null }, 2);
  assert.deepEqual(spawns.slice(4), [{ tool: 'pdftoppm', timeoutMs: 20_000 }, { tool: 'python3', timeoutMs: 20_000 }]);
});

test('anteprima: una sola disegnata nel server (mai due slot), una per azienda, poche in attesa; occupato → 503', async () => {
  fresh();
  let open: () => void = () => undefined;
  gate = new Promise<void>((r) => { open = r; });
  const waiting: Promise<{ status: number }>[] = [];
  try {
    as('ENGINEER', { id: 'u-a' });
    const a = get(schizzo().id);
    while (spawns.length < 1) await sleep(5);
    // a colleague of the same company: busy at once
    as('TECHNICIAN', { id: 'u-b' });
    const b = await Promise.race([get(schizzo().id), sleep(300).then(() => null)]);
    assert.deepEqual(b && [b.status, b.retry], [503, '5'], 'one preview under way per company');
    // other companies wait their turn without a slot (four at most); the fifth is busy
    for (const [c, p] of [['c2', 'pother'], ['c3', 'p3x'], ['c4', 'p4x'], ['c5', 'p5x']] as const) {
      as('OWNER', { id: `u-${c}`, companyId: c });
      waiting.push(get(schizzo({ projectId: p }).id));
    }
    as('OWNER', { id: 'u-c6', companyId: 'c6' });
    const sixth = await Promise.race([get(schizzo({ projectId: 'p6x' }).id), sleep(300).then(() => null)]);
    assert.deepEqual(sixth && [sixth.status, sixth.retry], [503, '5'], 'the queue is full');
    assert.deepEqual([spawns.length, slots.max], [1, 1], 'never two drawn at once');
    gate = null;
    open();
    assert.equal((await a).status, 200);
    assert.deepEqual((await Promise.all(waiting)).map((r) => r.status), [200, 200, 200, 200]);
    assert.deepEqual([spawns.length, slots.max], [5, 1], 'one renderer slot at most, all along');
  } finally {
    gate = null;
    open();
  }
});

test('anteprima: 30 ogni 10 minuti per utente', async () => {
  fresh();
  as('SALES', { id: 'u-trenta' });
  const s = schizzo();
  for (let i = 0; i < 30; i++) assert.equal((await get(s.id)).status, 200, `preview ${i + 1}`);
  assert.equal((await get(s.id)).status, 429);
});

test('memoria delle anteprime: al massimo 48 e 48 MB, la meno usata se ne va per prima', () => {
  assert.deepEqual([ANTEPRIMA_LIMITS.keptEntries, ANTEPRIMA_LIMITS.keptBytes, ANTEPRIMA_LIMITS.perUser10Min], [48, 48 * 1024 * 1024, 30]);
  const lru = byteLru<{ bytes: Uint8Array }>(3, 100);
  const pic = (n: number) => ({ bytes: new Uint8Array(n) });
  lru.set('a', pic(10));
  lru.set('b', pic(10));
  lru.set('c', pic(10));
  assert.ok(lru.get('a'), 'a used again: b is now the least recently used');
  lru.set('d', pic(10));
  assert.deepEqual(['a', 'b', 'c', 'd'].map((k) => lru.get(k) !== undefined), [true, false, true, true], 'at most 3');
  lru.set('e', pic(90));
  assert.deepEqual([lru.size, lru.bytes, lru.get('d') !== undefined, lru.get('e') !== undefined], [2, 100, true, true], 'at most 100 bytes');
  lru.set('f', pic(101));
  assert.deepEqual([lru.size, lru.get('f')], [2, undefined], 'larger than the whole memory: not kept');
  lru.set('e', pic(50));
  assert.deepEqual([lru.size, lru.bytes], [2, 60], 'the same key again: its bytes replaced');
});
