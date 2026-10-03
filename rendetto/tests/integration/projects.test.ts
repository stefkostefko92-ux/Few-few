import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, customer, prisma, sessionCsrf, startApp, stopApp, type Browser } from './harness.js';

before(startApp);
after(stopApp);

async function newProject(b: Browser, type = 'base', name = 'Шкаф'): Promise<string> {
  const reply = await b.post('/app/projects', { _csrf: await sessionCsrf(b, '/app'), type, name });
  assert.equal(reply.status, 302);
  assert.match(reply.location, /^\/app\/p\/[a-z0-9]+$/);
  return reply.location.split('/').pop() ?? '';
}

/** The version the editor opened: the server saves only over it. */
function baseOf(editorHtml: string): string {
  return (
    /&#34;updatedAt&#34;:&#34;([^&]+)&#34;|"updatedAt":"([^"]+)"/
      .exec(editorHtml)
      ?.slice(1)
      .find(Boolean) ?? ''
  );
}

async function expire(email: string): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: { planExpiresAt: new Date(Date.now() - 60_000) },
  });
}

test('during the trial: create, save, duplicate and export every format', async () => {
  const b = await customer('trial@example.test');
  const id = await newProject(b);
  const editor = await b.get(`/app/p/${id}`);
  assert.equal(editor.status, 200);
  const csrf = /data-csrf="([^"]+)"/.exec(editor.body)?.[1] ?? '';
  const save = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base', width: 700 }, name: 'Шкаф 700', base: baseOf(editor.body) },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(save.status, 200);
  const project = await prisma.project.findUniqueOrThrow({ where: { id } });
  assert.equal((project.spec as { width?: number }).width, 700);
  assert.equal(project.name, 'Шкаф 700');

  for (const kind of [
    'cut-list.csv',
    'hardware.csv',
    'drilling.csv',
    'drawings.zip',
    'cnc.zip',
    'project.zip',
  ]) {
    const file = await b.get(`/app/p/${id}/export/${kind}`);
    assert.equal(file.status, 200, kind);
    assert.match(
      file.headers.get('content-disposition') ?? '',
      /^attachment; filename="rendetto-/,
      kind,
    );
  }
  const dup = await b.post(`/app/p/${id}/duplicate`, { _csrf: await sessionCsrf(b, '/app') });
  assert.equal(dup.status, 302);
  assert.equal(await prisma.project.count({ where: { user: { email: 'trial@example.test' } } }), 2);
});

test('after the plan ends: projects download, but nothing new is created or changed', async () => {
  const b = await customer('expired@example.test');
  const id = await newProject(b);
  await expire('expired@example.test');

  const list = await b.get('/app');
  assert.match(list.body, /Планът ви изтече/);
  const create = await b.post('/app/projects', {
    _csrf: await sessionCsrf(b, '/app'),
    type: 'wall',
    name: 'Нов',
  });
  assert.equal(create.status, 302);
  assert.equal(create.location, '/app');
  assert.equal(
    await prisma.project.count({ where: { user: { email: 'expired@example.test' } } }),
    1,
  );

  const editor = await b.get(`/app/p/${id}`);
  assert.match(editor.body, /data-readonly="true"/);
  const csrf = /data-csrf="([^"]+)"/.exec(editor.body)?.[1] ?? '';
  const save = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base', width: 900 } },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(save.status, 402);
  assert.equal((JSON.parse(save.body) as { code: string }).code, 'app.errors.planExpired');
  const dup = await b.post(`/app/p/${id}/duplicate`, { _csrf: await sessionCsrf(b, '/app') });
  assert.equal(dup.status, 302);
  assert.equal(
    await prisma.project.count({ where: { user: { email: 'expired@example.test' } } }),
    1,
  );

  const zip = await b.get(`/app/p/${id}/export/project.zip`);
  assert.equal(zip.status, 200, 'download stays allowed');
  const del = await b.post(`/app/p/${id}/delete`, { _csrf: await sessionCsrf(b, '/app') });
  assert.equal(del.status, 302);
  assert.equal(await prisma.project.count({ where: { id } }), 0, 'deleting own data stays allowed');
});

test('a save over a newer version is refused, not silently overwritten', async () => {
  const b = await customer('twotabs@example.test');
  const id = await newProject(b);
  const page = await b.get(`/app/p/${id}`);
  const csrf = /data-csrf="([^"]+)"/.exec(page.body)?.[1] ?? '';
  const base = baseOf(page.body);
  const first = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base', width: 650 }, base },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(first.status, 200);
  const second = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base', width: 900 }, base },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(second.status, 409);
  assert.equal((JSON.parse(second.body) as { code: string }).code, 'app.errors.conflict');
  const noBase = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base', width: 900 } },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(noBase.status, 409);
  const saved = (await prisma.project.findUniqueOrThrow({ where: { id } })).spec as {
    width: number;
  };
  assert.equal(saved.width, 650, 'the first save stays');
  const next = (JSON.parse(first.body) as { updatedAt: string }).updatedAt;
  const third = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base', width: 900 }, base: next },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(third.status, 200, 'saving over the version just saved works');
});

test('CNC files are withheld while the checks find an error; the project ZIP says why', async () => {
  const b = await customer('blocked@example.test');
  const id = await newProject(b, 'tv', 'ТВ');
  const page = await b.get(`/app/p/${id}`);
  const csrf = /data-csrf="([^"]+)"/.exec(page.body)?.[1] ?? '';
  // 2600 mm in 2 columns with doors: each door over 600 mm — beyond what the hinge maker allows
  const save = await b.request('PUT', `/app/api/projects/${id}`, {
    json: {
      spec: { type: 'tv', width: 2600, columns: 2, tvFronts: 'doors' },
      base: baseOf(page.body),
    },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(save.status, 200);
  const cnc = await b.get(`/app/p/${id}/export/cnc.zip`);
  assert.equal(cnc.status, 422);
  assert.match(cnc.body, /над 600 mm/);
  const zip = await b.get(`/app/p/${id}/export/project.zip`);
  assert.equal(zip.status, 200);
  const drawings = await b.get(`/app/p/${id}/export/drawings.zip`);
  assert.equal(drawings.status, 200, 'drawings stay available, marked as not for production');
});

test('nobody reaches another person’s project', async () => {
  const owner = await customer('mine@example.test');
  const other = await customer('theirs@example.test');
  const id = await newProject(owner);
  assert.equal((await other.get(`/app/p/${id}`)).status, 404);
  assert.equal((await other.get(`/app/p/${id}/export/project.zip`)).status, 404);
  const csrf = await sessionCsrf(other, '/app');
  const save = await other.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base' } },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(save.status, 404);
  await other.post(`/app/p/${id}/delete`, { _csrf: csrf });
  assert.equal(await prisma.project.count({ where: { id } }), 1);
});

test('the spec from the client is normalised and size-limited', async () => {
  const b = await customer('spec@example.test');
  const id = await newProject(b);
  const page = await b.get(`/app/p/${id}`);
  const csrf = /data-csrf="([^"]+)"/.exec(page.body)?.[1] ?? '';
  const big = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base', junk: 'x'.repeat(40_000) } },
    headers: { 'x-csrf-token': csrf },
  });
  assert.ok([400, 413].includes(big.status), `oversized spec: ${big.status}`);
  const odd = await b.request('PUT', `/app/api/projects/${id}`, {
    json: {
      spec: { type: 'base', width: 99999, __proto__: { admin: true } },
      base: baseOf(page.body),
    },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(odd.status, 200);
  const saved = (await prisma.project.findUniqueOrThrow({ where: { id } })).spec as {
    width: number;
  };
  assert.ok(saved.width <= 1200, `width clamped to ${saved.width}`);
});

test('the catalogue is only for signed-in people and supports conditional requests', async () => {
  const anon = await fetch(`${BASE}/app/catalog.json`, { redirect: 'manual' });
  assert.equal(anon.status, 302);
  const b = await customer('catalog@example.test');
  const first = await b.get('/app/catalog.json');
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag') ?? '';
  assert.ok(etag);
  assert.equal((await b.get('/app/catalog.json', { 'if-none-match': etag })).status, 304);
});
