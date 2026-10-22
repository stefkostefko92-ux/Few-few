// POST /api/projects/[id]/schizzi/[allegatoId]/lettura (round 50) over the in-memory database with a fake model (no
// network) and the pictures stubbed (the image tools have their own test): only from the application's pages; the right
// to draw ('progetto:edit': not a Tecnico, not a Commerciale, not a read-only company); another company's installation, a
// file of another installation or of another kind «not found»; a strict body; an archived installation refused; the
// feature off without a usable key (a key open to others is no key: fail closed); the proposal checked against the
// catalog (out of range and wrong types not read, unknown ids dropped); the same bytes read once (memory, audited as
// such) and forgotten past 24 hours without being asked again; 60 calls in 10 minutes per user, from memory too; at most
// 2 under way (refused before the quotas count it); 20 readings an hour per user; a refusal, a cut answer, an answer
// that is not the JSON, the API busy or refusing the key, each with its answer; the activity log with ids, SHA-256 and
// counts only.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BASE, as, reset, seedFile, state } from './allegati-db';
import type { SketchAnswer, SketchRequest } from '../schizzi/model';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

// the service account's key: a file of the test, mode 600 (a fake: the model is not called through the network)
const KEY_DIR = mkdtempSync(path.join(os.tmpdir(), 'vertex-test-'));
const KEY = path.join(KEY_DIR, 'service-account.json');
writeFileSync(KEY, '{"type":"service_account"}', { mode: 0o600 });
process.env.VERTEX_PROJECT_ID = 'liftpilot-test';
process.env.VERTEX_REGION = 'eu';
process.env.VERTEX_CREDENTIALS_FILE = KEY;
process.env.SKETCH_MODEL = 'claude-opus-5-5';

class SketchModelError extends Error {
  constructor(readonly kind: 'busy' | 'unavailable' | 'failed', readonly status: number | null) {
    super(kind);
  }
}
type Reply = SketchAnswer | Error | Promise<SketchAnswer>;
const model = { calls: [] as SketchRequest[], reply: ((): Reply => ({ kind: 'ok', text: '{"fields":[]}', model: 'claude-opus-5-5' })) as (req: SketchRequest) => Reply };
mock.module(src('server/schizzi/model.ts'), {
  namedExports: {
    SketchModelError, FALLBACK_MODEL: 'claude-opus-5', MAX_TOKENS: 16000,
    sketchModel: async () => ({
      read: async (req: SketchRequest) => {
        model.calls.push(req);
        const r = model.reply(req);
        if (r instanceof Error) throw r;
        return r;
      },
    }),
  },
});
const pictures = { calls: 0 };
mock.module(src('lib/report/image-tool.ts'), {
  namedExports: {
    SCHIZZO_PAGINE: 4,
    modelImages: async () => { pictures.calls++; return [Buffer.from('jpeg-1'), Buffer.from('jpeg-2')]; },
    previewOf: async () => { throw new Error('not here'); },
    heicToJpeg: async () => { throw new Error('not here'); },
  },
});

const { POST } = await import('../../app/api/projects/[id]/schizzi/[allegatoId]/lettura/route');
const { LETTURA_LIMITS, forgetReadings, keptReadings, sweepReadings } = await import('../schizzi/lettura');

const OWN = { origin: BASE, host: 'liftpilot.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
interface Answer { ok: boolean; error?: string; message?: string; cached?: boolean; proposta?: { fields: { id: string; value: unknown }[]; notRead: { id: string; code: string }[]; model: string; units: string } }
async function leggi(file: string, body: unknown = { target: 'vano' }, opts: { project?: string; headers?: Record<string, string> } = {}) {
  const project = opts.project ?? 'p1';
  const req = new Request(`${BASE}/api/projects/${project}/schizzi/${file}/lettura`, {
    method: 'POST', headers: { ...OWN, ...opts.headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ id: project, allegatoId: file }) });
  return { status: res.status, body: (await res.json()) as Answer, cache: res.headers.get('cache-control') };
}
let n = 0;
const sketch = (o: { projectId?: string; kind?: string; mime?: string } = {}) =>
  seedFile({ projectId: o.projectId ?? 'p1', size: 3, kind: o.kind ?? 'SCHIZZO', mime: o.mime ?? 'image/png', component: 'vano', sha256: (++n).toString(16).padStart(64, 'a'), data: new Uint8Array([1, 2, 3]) });
const okText = (fields: unknown[], extra: Record<string, unknown> = {}): SketchAnswer =>
  ({ kind: 'ok', text: JSON.stringify({ units: 'cm', fields, notRead: [], warnings: [], ...extra }), model: 'claude-opus-5-5' });
const fresh = (): void => {
  reset();
  forgetReadings();
  model.calls.length = 0;
  pictures.calls = 0;
  model.reply = () => okText([]);
  chmodSync(KEY, 0o600);
};

test('lettura: dalle pagine dell’applicazione, con la sessione e il diritto di disegnare', async () => {
  fresh();
  const f = sketch();
  assert.deepEqual((await leggi(f.id, { target: 'vano' }, { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })).body.error, 'forbidden');
  assert.equal((await leggi(f.id)).status, 401);
  for (const role of ['TECHNICIAN', 'SALES']) {
    as(role);
    assert.deepEqual([(await leggi(f.id)).status], [403], role);
  }
  as('ENGINEER', { readOnly: true });
  assert.equal((await leggi(f.id)).status, 403, 'a read-only company');
  for (const role of ['ENGINEER', 'CHIEF_TECHNICIAN', 'OWNER']) {
    as(role);
    const r = await leggi(f.id);
    assert.equal(r.status, 200, role);
    assert.equal(r.cache, 'no-store');
  }
  assert.equal(model.calls.length, 1, 'the same bytes are read once');
});

test('lettura: un altro impianto, un’altra azienda, un altro tipo di file → non trovato; archiviato 409; corpo stretto', async () => {
  fresh();
  as('OWNER');
  const f = sketch(), foto = sketch({ kind: 'FOTO' }), other = sketch({ projectId: 'p2' }), theirs = sketch({ projectId: 'pother' });
  for (const [file, project] of [[foto.id, 'p1'], [other.id, 'p1'], [theirs.id, 'pother'], [theirs.id, 'p1'], ['nessuno', 'p1'], ['../x', 'p1']] as const) {
    const r = await leggi(file, { target: 'vano' }, { project });
    assert.deepEqual([r.status, r.body.error], [404, 'notFound'], `${file} @ ${project}`);
  }
  for (const bad of [{ target: 'cantina' }, { target: 'vano', extra: 1 }, {}, 'non json', '{"target":"vano"' + ' '.repeat(2000) + '}']) {
    assert.deepEqual((await leggi(f.id, bad)).body.error, 'invalidFields', JSON.stringify(bad).slice(0, 30));
  }
  assert.equal((await leggi(f.id, { target: 'vano' }, { headers: { 'content-type': 'text/plain' } })).status, 400);
  const arch = sketch({ projectId: 'parch' });
  assert.deepEqual([(await leggi(arch.id, { target: 'vano' }, { project: 'parch' })).status], [409]);
  assert.equal(model.calls.length + pictures.calls, 0, 'nothing read, nothing sent');
});

test('lettura: senza una chiave utilizzabile la funzione è spenta (503), e nulla parte', async () => {
  fresh();
  as('OWNER');
  const f = sketch();
  chmodSync(KEY, 0o644);
  const open = await leggi(f.id);
  assert.deepEqual([open.status, open.body.error], [503, 'sketchOff']);
  assert.match(open.body.message ?? '', /non è attiva/);
  rmSync(KEY);
  assert.equal((await leggi(f.id)).body.error, 'sketchOff', 'no key file');
  writeFileSync(KEY, '{"type":"service_account"}', { mode: 0o600 });
  assert.equal((await leggi(f.id)).status, 200, 'the key back: on again, no restart');
  assert.equal(model.calls.length, 1);
});

test('lettura: la proposta è controllata sul catalogo; la richiesta al modello porta le immagini, le istruzioni e lo schema', async () => {
  fresh();
  as('ENGINEER', { id: 'u-progettista' });
  const f = sketch();
  model.reply = () => okText([
    { id: 'W', value: 1600, confidence: 0.9, read: '160' },
    { id: 'D', value: 99_999, confidence: 0.9, read: '9999,9' },
    { id: 'pit', value: '1200', confidence: 0.9, read: '120' },
    { id: 'Q', value: 630, confidence: 1, read: '630 kg' },
    { id: 'room.W', value: 3000, confidence: 0.5, read: '300' },
  ]);
  const r = await leggi(f.id);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.proposta?.fields.map((x) => [x.id, x.value]), [['W', 1600], ['room.W', 3000]]);
  assert.deepEqual(r.body.proposta?.notRead.map((x) => [x.id, x.code]), [['D', 'fuoriIntervallo'], ['pit', 'tipo']]);
  assert.deepEqual([r.body.cached, r.body.proposta?.units, r.body.proposta?.model], [false, 'cm', 'claude-opus-5-5']);
  const req = model.calls[0];
  assert.ok(req);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.images.map((i) => [i.mediaType, Buffer.from(i.data, 'base64').toString()]), [['image/jpeg', 'jpeg-1'], ['image/jpeg', 'jpeg-2']]);
  assert.match(req.system, /DATA/);
  assert.match(req.instruction, /SHAFT/);
  assert.equal((req.schema as { type?: string }).type, 'object');
  // the activity log: ids, SHA-256, target, model and counts — never what was read
  assert.deepEqual(state.audits, [{
    companyId: 'c1', userId: 'u-progettista', action: 'SKETCH_READ', entity: 'Attachment', entityId: f.id,
    meta: { attachmentId: f.id, sha256: f.sha256, target: 'vano', model: 'claude-opus-5-5', fields: 2, cached: false },
  }]);
  assert.ok(!JSON.stringify(state.audits).includes('160'));
  // again: from memory, the model not called, audited as such; another target is another reading
  const again = await leggi(f.id);
  assert.deepEqual([again.status, again.body.cached, model.calls.length], [200, true, 1]);
  assert.deepEqual(again.body.proposta, r.body.proposta);
  assert.equal((state.audits[1]?.meta as { cached?: boolean } | undefined)?.cached, true);
  assert.equal((await leggi(f.id, { target: 'locale' })).body.cached, false);
  assert.equal(model.calls.length, 2);
  assert.match(model.calls[1]?.instruction ?? '', /MACHINE ROOM/);
});

test('lettura: rifiuto 422, risposta tagliata o non JSON 502, API occupata 503, chiave rifiutata = spenta; niente in memoria', async () => {
  fresh();
  as('OWNER');
  const cases: [Reply, number, string][] = [
    [{ kind: 'refusal' }, 422, 'sketchRefused'],
    [{ kind: 'truncated' }, 502, 'sketchFailed'],
    [{ kind: 'other', stopReason: 'pause_turn' }, 502, 'sketchFailed'],
    [{ kind: 'ok', text: 'Ecco le misure: W=1600', model: 'm' }, 502, 'sketchFailed'],
    [{ kind: 'ok', text: '{"campi":[]}', model: 'm' }, 502, 'sketchFailed'],
    [new SketchModelError('busy', 429), 503, 'sketchBusy'],
    [new SketchModelError('unavailable', 403), 503, 'sketchOff'],
    [new SketchModelError('failed', 500), 502, 'sketchFailed'],
    [new Error('anything else'), 502, 'sketchFailed'],
  ];
  const f = sketch();
  for (const [reply, status, error] of cases) {
    model.reply = () => reply;
    const r = await leggi(f.id);
    assert.deepEqual([r.status, r.body.ok, r.body.error], [status, false, error], error);
  }
  assert.equal(model.calls.length, cases.length, 'a failure is never kept: each try asks again');
  assert.equal(state.audits.length, 0);
});

test('lettura: al massimo 2 in corso nel server, 20 l’ora per utente', async () => {
  fresh();
  as('OWNER', { id: 'u-limiti' });
  const waits: (() => void)[] = [];
  model.reply = () => new Promise<SketchAnswer>((resolve) => { waits.push(() => resolve(okText([]))); });
  const a = leggi(sketch().id), b = leggi(sketch().id);
  while (waits.length < 2) await new Promise((r) => setTimeout(r, 5));
  const third = await leggi(sketch().id);
  assert.deepEqual([third.status, third.body.error], [503, 'sketchBusy']);
  for (const w of waits) w();
  assert.deepEqual([(await a).status, (await b).status], [200, 200]);
  model.reply = () => okText([]);
  // 2 readings counted so far (the third, refused as busy, is not counted): 18 more pass, the 21st is refused
  for (let i = 0; i < 18; i++) assert.equal((await leggi(sketch().id)).status, 200, `reading ${i + 3}`);
  const over = await leggi(sketch().id);
  assert.deepEqual([over.status, over.body.error], [429, 'rateLimited']);
  // a reading kept in memory costs nothing: still answered
  assert.equal((await leggi(state.files[0]?.id ?? '')).body.cached, true);
});

test('lettura: 60 chiamate ogni 10 minuti per utente, anche dalla memoria (ognuna nel registro attività)', async () => {
  fresh();
  as('OWNER', { id: 'u-chiamate' });
  const f = sketch();
  assert.equal((await leggi(f.id)).body.cached, false);
  for (let i = 0; i < 59; i++) assert.equal((await leggi(f.id)).body.cached, true, `call ${i + 2}`);
  const over = await leggi(f.id);
  assert.deepEqual([over.status, over.body.error], [429, 'rateLimited']);
  assert.deepEqual([model.calls.length, state.audits.length], [1, 60], 'one reading, 60 answers in the activity log, the 61st refused before it');
  assert.equal((await leggi('nessuno')).status, 429, 'every call counts, before the database');
  as('OWNER', { id: 'u-collega' });
  assert.equal((await leggi(f.id)).body.cached, true, 'a colleague has calls of their own');
});

test('lettura: una lettura in memoria da più di 24 ore se ne va da sola, senza che la si chieda di nuovo', async () => {
  fresh();
  as('OWNER', { id: 'u-memoria' });
  const a = sketch(), b = sketch();
  await leggi(a.id);
  assert.equal(keptReadings(), 1);
  sweepReadings(Date.now());
  assert.equal(keptReadings(), 1, 'still valid: kept');
  // a day and a little later another file is read: the old reading goes as the new one is kept
  const later = Date.now() + LETTURA_LIMITS.cacheMs + 1000;
  mock.method(Date, 'now', () => later);
  try {
    assert.equal((await leggi(b.id)).body.cached, false);
    assert.equal(keptReadings(), 1, 'only the new one');
  } finally {
    mock.restoreAll();
  }
  // the hourly sweep: nothing new read, the readings past 24 h go all the same
  forgetReadings();
  await leggi(a.id);
  assert.equal(keptReadings(), 1);
  sweepReadings(Date.now() + LETTURA_LIMITS.cacheMs + 1);
  assert.equal(keptReadings(), 0);
});
