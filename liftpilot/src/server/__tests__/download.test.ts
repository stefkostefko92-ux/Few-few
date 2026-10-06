// What every download route does the same way (src/server/download.ts): the file name, the headers that keep a
// company's documents out of any cache, and the checks before any work — signed in, the right to download, a bounded rate.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

let user: Record<string, unknown> | null = null;
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => user } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });

const signedIn = (over: Record<string, unknown> = {}) => ({ id: 'u1', role: 'TECHNICIAN', companyId: 'c1', mustChangePassword: false, readOnly: false, ...over });

test('slug: lettere, cifre e trattini; senza accenti', async () => {
  const { slug } = await import(src('server/download.ts'));
  assert.equal(slug('Via Ä Roma_12 !!'), 'via-a-roma-12');
  assert.equal(slug('  Impianto   Nord  '), 'impianto-nord');
});

test('slug: vuoto o solo simboli dà il nome di ripiego', async () => {
  const { slug } = await import(src('server/download.ts'));
  assert.equal(slug(''), 'impianto');
  assert.equal(slug('!!!'), 'impianto');
  assert.equal(slug('???', 'progetto'), 'progetto');
});

test('slug: al massimo 60 caratteri', async () => {
  const { slug } = await import(src('server/download.ts'));
  assert.equal(slug('a'.repeat(100)), 'a'.repeat(60));
});

test('un file da salvare: allegato, tipo, privato e mai in cache', async () => {
  const { attachment } = await import(src('server/download.ts'));
  const r = attachment('x', 'application/pdf', 'via-roma.pdf');
  assert.equal(r.headers.get('Content-Type'), 'application/pdf');
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="via-roma.pdf"');
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('la risposta breve in testo non resta in cache', async () => {
  const { text } = await import(src('server/download.ts'));
  const r = text(404, 'Not found');
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.match(r.headers.get('Content-Type') ?? '', /^text\/plain/);
  assert.equal(await r.text(), 'Not found');
});

test('senza sessione: 401, mai in cache', async () => {
  const { downloader } = await import(src('server/download.ts'));
  user = null;
  const r = await downloader('t-nosession', 5);
  assert.ok('refused' in r);
  assert.equal(r.refused.status, 401);
  assert.equal(r.refused.headers.get('Cache-Control'), 'no-store');
});

test('con la password da cambiare: 401 come senza sessione', async () => {
  const { downloader } = await import(src('server/download.ts'));
  user = signedIn({ mustChangePassword: true });
  const r = await downloader('t-mustchange', 5);
  assert.ok('refused' in r);
  assert.equal(r.refused.status, 401);
});

test('senza il diritto richiesto: 403', async () => {
  const { downloader } = await import(src('server/download.ts'));
  user = signedIn();
  const r = await downloader('t-cap', 5, 'company:export');
  assert.ok('refused' in r);
  assert.equal(r.refused.status, 403);
});

test('il Commerciale scarica (report:download)', async () => {
  const { downloader } = await import(src('server/download.ts'));
  user = signedIn({ role: 'SALES' });
  const r = await downloader('t-sales', 5);
  assert.ok('user' in r);
});

test('la richiesta dopo il massimo: 429; un altro utente non è toccato', async () => {
  const { downloader } = await import(src('server/download.ts'));
  user = signedIn();
  for (let i = 0; i < 3; i++) assert.ok('user' in (await downloader('t-rate', 3)), `richiesta ${i + 1}`);
  const over = await downloader('t-rate', 3);
  assert.ok('refused' in over);
  assert.equal(over.refused.status, 429);
  user = signedIn({ id: 'u2' });
  assert.ok('user' in (await downloader('t-rate', 3)));
});

test('un diritto negato non consuma il limite', async () => {
  const { downloader } = await import(src('server/download.ts'));
  user = signedIn();
  for (let i = 0; i < 5; i++) await downloader('t-nocount', 1, 'company:export');
  user = signedIn({ role: 'OWNER' });
  assert.ok('user' in (await downloader('t-nocount', 1, 'company:export')));
});
