import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, prisma, startApp, stopApp } from './harness.js';
import { customer, newProject, openEditor, saveProject, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

async function expire(email: string): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: { planExpiresAt: new Date(Date.now() - 60_000) },
  });
}

const widthOf = async (id: string) =>
  ((await prisma.project.findUniqueOrThrow({ where: { id } })).spec as { width?: number }).width;

test('during the trial: create, save, duplicate and export every format', async () => {
  const b = await customer('trial@example.test');
  const id = await newProject(b);
  const { csrf, base } = await openEditor(b, id);
  const save = await saveProject(b, id, csrf, {
    spec: { type: 'base', width: 700 },
    name: 'Шкаф 700',
    base,
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
      /^attachment; filename="korpora-/,
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
  assert.equal(b.flash(), 'app.errors.planExpired');
  assert.equal(
    await prisma.project.count({ where: { user: { email: 'expired@example.test' } } }),
    1,
  );

  const editor = await openEditor(b, id);
  assert.match(editor.body, /data-readonly="true"/);
  const save = await saveProject(b, id, editor.csrf, { spec: { type: 'base', width: 900 } });
  assert.equal(save.status, 402);
  assert.equal((JSON.parse(save.body) as { code: string }).code, 'app.errors.planExpired');
  const dup = await b.post(`/app/p/${id}/duplicate`, { _csrf: await sessionCsrf(b, '/app') });
  assert.equal(dup.status, 302);
  assert.equal(b.flash(), 'app.errors.planExpired');
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
  const { csrf, base } = await openEditor(b, id);
  const first = await saveProject(b, id, csrf, { spec: { type: 'base', width: 650 }, base });
  assert.equal(first.status, 200);
  const second = await saveProject(b, id, csrf, { spec: { type: 'base', width: 900 }, base });
  assert.equal(second.status, 409);
  assert.equal((JSON.parse(second.body) as { code: string }).code, 'app.errors.conflict');
  const noBase = await saveProject(b, id, csrf, { spec: { type: 'base', width: 900 } });
  assert.equal(noBase.status, 409);
  assert.equal(await widthOf(id), 650, 'the first save stays');
  const next = (JSON.parse(first.body) as { updatedAt: string }).updatedAt;
  const third = await saveProject(b, id, csrf, {
    spec: { type: 'base', width: 900 },
    base: next,
  });
  assert.equal(third.status, 200, 'saving over the version just saved works');
});

test('the JSON save needs the session token and our origin, like every form', async () => {
  const b = await customer('csrf-api@example.test');
  const id = await newProject(b);
  const { csrf, base } = await openEditor(b, id);
  const body = { spec: { type: 'base', width: 640 }, base };
  const put = (headers: Record<string, string>) =>
    b.request('PUT', `/app/api/projects/${id}`, { json: body, headers });
  const refusals = [
    ['no token', await put({})],
    ['a wrong token', await put({ 'x-csrf-token': 'x'.repeat(43) })],
    ['a foreign origin', await put({ 'x-csrf-token': csrf, origin: 'https://evil.example' })],
  ] as const;
  for (const [what, reply] of refusals) {
    assert.equal(reply.status, 403, what);
    assert.equal((JSON.parse(reply.body) as { code: string }).code, 'error.csrf', what);
  }
  assert.notEqual(await widthOf(id), 640, 'nothing was saved');
  assert.equal((await saveProject(b, id, csrf, body)).status, 200, 'the editor itself saves');
  assert.equal(await widthOf(id), 640);
});

test('CNC files are withheld while the checks find an error', async () => {
  const b = await customer('blocked@example.test');
  const id = await newProject(b, 'tv', 'ТВ');
  const { csrf, base } = await openEditor(b, id);
  // 2600 mm in 2 columns with doors: each door over 600 mm — beyond what the hinge maker allows
  const save = await saveProject(b, id, csrf, {
    spec: { type: 'tv', width: 2600, columns: 2, tvFronts: 'doors' },
    base,
  });
  assert.equal(save.status, 200);
  const cnc = await b.get(`/app/p/${id}/export/cnc.zip`);
  assert.equal(cnc.status, 422);
  assert.match(cnc.body, /над 600 mm/);
});

test('nobody reaches another person’s project', async () => {
  const owner = await customer('mine@example.test');
  const other = await customer('theirs@example.test');
  const id = await newProject(owner);
  assert.equal((await other.get(`/app/p/${id}`)).status, 404);
  assert.equal((await other.get(`/app/p/${id}/export/project.zip`)).status, 404);
  const csrf = await sessionCsrf(other, '/app');
  assert.equal((await saveProject(other, id, csrf, { spec: { type: 'base' } })).status, 404);
  const del = await other.post(`/app/p/${id}/delete`, { _csrf: csrf });
  assert.equal(del.status, 302);
  assert.equal(other.flash(), 'error.notFoundText');
  const dup = await other.post(`/app/p/${id}/duplicate`, { _csrf: csrf });
  assert.equal(other.flash(), 'error.notFoundText', `duplicate: ${dup.status}`);
  assert.equal(await prisma.project.count({ where: { id } }), 1);
  assert.equal(
    await prisma.project.count({ where: { user: { email: 'theirs@example.test' } } }),
    0,
  );
});

test('the spec from the client is normalised and size-limited', async () => {
  const b = await customer('spec@example.test');
  const id = await newProject(b);
  const { csrf, base } = await openEditor(b, id);
  const big = await saveProject(b, id, csrf, { spec: { type: 'base', junk: 'x'.repeat(40_000) } });
  assert.ok([400, 413].includes(big.status), `oversized spec: ${big.status}`);
  const odd = await saveProject(b, id, csrf, { spec: { type: 'base', width: 99999 }, base });
  assert.equal(odd.status, 200);
  const width = await widthOf(id);
  assert.ok(width !== undefined && width <= 1200, `width clamped to ${width}`);
});

test('keys like __proto__ and constructor in the spec pollute nothing and are not stored', async () => {
  const b = await customer('proto@example.test');
  const id = await newProject(b);
  const { csrf, base } = await openEditor(b, id);
  const send = (spec: string) =>
    b.request('PUT', `/app/api/projects/${id}`, {
      raw: `{"spec":${spec},"base":${JSON.stringify(base)}}`,
      headers: { 'x-csrf-token': csrf },
    });
  // JSON.parse makes "__proto__" an own key; an object literal would only set the prototype
  const nested = await send(
    '{"type":"base","__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}}}',
  );
  assert.equal(nested.status, 400, 'nested values are not a spec');
  const flat = await send('{"type":"base","width":650,"__proto__":"x","constructor":"y"}');
  assert.equal(flat.status, 200);
  assert.equal(({} as Record<string, unknown>).admin, undefined, 'Object.prototype untouched');
  const keys = await prisma.$queryRaw<Array<{ key: string }>>`
    SELECT jsonb_object_keys(spec) AS key FROM "Project" WHERE id = ${id}`;
  const stored = keys.map((row) => row.key);
  assert.ok(stored.includes('width'));
  for (const key of ['__proto__', 'constructor', 'prototype', 'admin'])
    assert.ok(!stored.includes(key), `${key} stored in the spec`);
  assert.equal(await widthOf(id), 650);
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
