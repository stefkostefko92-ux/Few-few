// The SVG downloads (round 50) over the download rules, the files themselves made by mocked exports: an SVG or a ZIP of
// them is an attachment, private, never sniffed and sandboxed with no source allowed (the CAD and PDF files keep their
// headers); the audit row says the format; the shaft plan's SVG has its own action, the DXF's rate bucket and the same
// 409 and 404 as its DXF.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

let user: Record<string, unknown> | null = null;
const audits: Record<string, unknown>[] = [];
const ID = 'cmuzcb2tz001x7do03nkvjbfb', STALE = 'cmuzcb2tz001x7do03nkvjbaa', MISSING = 'cmuzcb2tz001x7do03nkvjbzz';
const body = new TextEncoder().encode('<?xml version="1.0"?><svg/>');
type Made = { ok: true; body: Uint8Array; mime: string; name: string } | { ok: false; error: 'notFound' | 'engineChanged' };
/** What a mocked export gives for an id and a format: an SVG or ZIP, a DXF, or the record's refusals. */
const made = (id: string, format: string): Made => {
  if (id === STALE) return { ok: false, error: 'engineChanged' };
  if (id === MISSING) return { ok: false, error: 'notFound' };
  return format === 'svg' ? { ok: true, body, mime: 'application/zip', name: 'tavole-svg.zip' } : { ok: true, body, mime: 'image/vnd.dxf; charset=utf-8', name: `f.${format}` };
};
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: Record<string, unknown>) => { audits.push(a); } } });
mock.module(src('server/set-cad.ts'), { namedExports: {
  SET_CAD_FORMATS: ['dxf', 'dwg', 'svg'], exportDrawingSet: async (_u: unknown, id: string, f: string) => ({ ...made(id, f), setId: id }),
} });
mock.module(src('server/project-export.ts'), { namedExports: {
  EXPORT_FORMATS: ['pdf', 'dxf', 'dwg', 'svg'], exportLiftDesign: async (_u: unknown, id: string, f: string) => ({ ...made(id, f), designId: id }),
} });
mock.module(src('server/room-export.ts'), { namedExports: { ROOM_FORMATS: ['pdf', 'dxf', 'dwg', 'svg'], exportRoomDesign: async (_u: unknown, id: string, f: string) => made(id, f) } });
mock.module(src('server/shaft-export.ts'), { namedExports: { exportShaftPlan: async (_u: unknown, id: string, f: string) => ({ ...made(id, f), designId: id }) } });

const signedIn = (id: string) => ({ id, role: 'TECHNICIAN', companyId: 'c-own', companyName: 'Ditta', mustChangePassword: false, readOnly: false });
const get = async (route: string, params: Record<string, string>): Promise<Response> => {
  const { GET } = await import(src(`app/api/${route}/route.ts`));
  return GET(new Request('http://x/api'), { params: Promise.resolve(params) }) as Promise<Response>;
};
const SANDBOX = "sandbox; default-src 'none'";

test('serie, progetto e locale in SVG: allegato privato, senza sniffing, in sandbox; il registro dice «svg»', async () => {
  user = signedIn('u-files');
  for (const [route, action, entity] of [['drawing-sets/[id]/[format]', 'DRAWING_SET_DOWNLOADED', 'DrawingSet'], ['lift-designs/[id]/[format]', 'PROJECT_EXPORTED', 'LiftDesign'], ['room-designs/[id]/[format]', 'PROJECT_EXPORTED', 'RoomDesign']] as const) {
    const r = await get(route, { id: ID, format: 'svg' });
    assert.equal(r.status, 200, route);
    assert.equal(r.headers.get('Content-Type'), 'application/zip');
    assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="tavole-svg.zip"');
    assert.equal(r.headers.get('Content-Security-Policy'), SANDBOX, route);
    assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(body)));
    assert.deepEqual(audits.at(-1), { companyId: 'c-own', userId: 'u-files', action, entity, entityId: ID, meta: { format: 'svg' } });
    // a CAD file keeps its headers: no sandbox
    const d = await get(route, { id: ID, format: 'dxf' });
    assert.equal(d.status, 200);
    assert.equal(d.headers.get('Content-Security-Policy'), null, route);
    // the record's refusals, as for the other formats
    assert.equal((await get(route, { id: STALE, format: 'svg' })).status, 409);
    assert.equal((await get(route, { id: MISSING, format: 'svg' })).status, 404);
  }
});

test('la pianta del vano in SVG: la sua azione nel registro, 409 e 404 come il DXF', async () => {
  user = signedIn('u-plan');
  const r = await get('shaft-designs/[id]/svg', { id: ID });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Security-Policy'), SANDBOX);
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="tavole-svg.zip"');
  assert.deepEqual(audits.at(-1), { companyId: 'c-own', userId: 'u-plan', action: 'SVG_DOWNLOADED', entity: 'ShaftDesign', entityId: ID, meta: { format: 'svg' } });
  const d = await get('shaft-designs/[id]/dxf', { id: ID });
  assert.equal(d.status, 200);
  assert.equal(d.headers.get('Content-Security-Policy'), null);
  assert.deepEqual(audits.at(-1), { companyId: 'c-own', userId: 'u-plan', action: 'DXF_DOWNLOADED', entity: 'ShaftDesign', entityId: ID });
  const before = audits.length;
  assert.equal((await get('shaft-designs/[id]/svg', { id: STALE })).status, 409);
  assert.equal((await get('shaft-designs/[id]/svg', { id: MISSING })).status, 404);
  assert.equal((await get('shaft-designs/[id]/svg', { id: '../x' })).status, 404);
  assert.equal(audits.length, before);
  user = null;
  assert.equal((await get('shaft-designs/[id]/svg', { id: ID })).status, 401);
});

test('pianta in DXF e in SVG: un solo limite, 60 in 10 minuti', async () => {
  user = signedIn('u-bucket');
  for (let i = 0; i < 30; i++) {
    assert.equal((await get('shaft-designs/[id]/dxf', { id: ID })).status, 200, `dxf ${i + 1}`);
    assert.equal((await get('shaft-designs/[id]/svg', { id: ID })).status, 200, `svg ${i + 1}`);
  }
  assert.equal((await get('shaft-designs/[id]/svg', { id: ID })).status, 429);
  assert.equal((await get('shaft-designs/[id]/dxf', { id: ID })).status, 429);
});
