import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { prisma, startApp, stopApp } from './harness.js';
import { customer, newProject, openEditor, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

const { MAX_PROJECTS } = await import('../../src/services/projects.js');

test('parallel creates one below the cap make exactly one project', async () => {
  const b = await customer('cap@example.test');
  const id = await newProject(b);
  const first = await prisma.project.findUniqueOrThrow({ where: { id } });
  await prisma.project.createMany({
    data: Array.from({ length: MAX_PROJECTS - 2 }, (_, k) => ({
      userId: first.userId,
      name: `Шкаф ${k}`,
      type: first.type,
      spec: first.spec as Prisma.InputJsonValue,
      specHash: first.specHash,
    })),
  });
  assert.equal(await prisma.project.count({ where: { userId: first.userId } }), MAX_PROJECTS - 1);
  // the token from a light page: /app would render all 499 projects
  const csrf = await sessionCsrf(b);
  const replies = await Promise.all(
    Array.from({ length: 6 }, (_, k) =>
      b.post('/app/projects', { _csrf: csrf, type: 'base', name: `Паралелен ${k}` }),
    ),
  );
  assert.equal(
    replies.filter((r) => /^\/app\/p\/[a-z0-9]+$/.test(r.location)).length,
    1,
    replies.map((r) => r.location).join(', '),
  );
  assert.equal(await prisma.project.count({ where: { userId: first.userId } }), MAX_PROJECTS);
  const dup = await b.post(`/app/p/${id}/duplicate`, { _csrf: csrf });
  assert.equal(dup.status, 302);
  assert.equal(b.flash(), 'app.errors.tooMany', 'a copy counts against the cap too');
  assert.equal(await prisma.project.count({ where: { userId: first.userId } }), MAX_PROJECTS);
});

test('a deeply nested spec is a client error (400), not a crash (500)', async () => {
  const b = await customer('deep@example.test');
  const id = await newProject(b);
  const { csrf, base } = await openEditor(b, id);
  const depth = 30_000; // about 60 KB, under the 64 KB body limit
  const reply = await b.request('PUT', `/app/api/projects/${id}`, {
    raw: `{"spec":${'['.repeat(depth)}${']'.repeat(depth)},"base":${JSON.stringify(base)}}`,
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(reply.status, 400);
  assert.equal((JSON.parse(reply.body) as { code: string }).code, 'app.errors.spec');
  const objects = await b.request('PUT', `/app/api/projects/${id}`, {
    raw: `{"spec":{"type":"base","a":${'{"a":'.repeat(5000)}1${'}'.repeat(5000)}},"base":${JSON.stringify(base)}}`,
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(objects.status, 400);
});

test('a project name with NUL or a direction override is refused with the name error, not a 500', async () => {
  const b = await customer('nul@example.test');
  for (const name of ['Шкаф\u0000x', 'Шкаф ‮gnp.exe']) {
    const reply = await b.post('/app/projects', {
      _csrf: await sessionCsrf(b, '/app'),
      type: 'base',
      name,
    });
    assert.equal(reply.status, 302, JSON.stringify(name));
    assert.equal(reply.location, '/app');
    assert.equal(b.flash(), 'app.errors.name', JSON.stringify(name));
  }
  assert.equal(await prisma.project.count({ where: { user: { email: 'nul@example.test' } } }), 0);
  const id = await newProject(b);
  const { csrf, base } = await openEditor(b, id);
  const rename = await b.request('PUT', `/app/api/projects/${id}`, {
    json: { spec: { type: 'base' }, name: 'Шкаф\u0000', base },
    headers: { 'x-csrf-token': csrf },
  });
  assert.equal(rename.status, 400);
  assert.equal((JSON.parse(rename.body) as { code: string }).code, 'app.errors.name');
});

test('the project list shows the type and the size of each project', async () => {
  const b = await customer('summary@example.test');
  await newProject(b, 'wall', 'Горен шкаф');
  const list = await b.get('/app');
  assert.match(
    list.body,
    /Горен шкаф[\s\S]*?<span class="proj-meta">[^<]*, <span class="mono">600 × 720 × 320 mm<\/span>/,
  );
});
