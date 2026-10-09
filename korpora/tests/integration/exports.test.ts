import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { prisma, startApp, stopApp, unzip, type Browser } from './harness.js';
import { customer, newProject, openEditor, saveProject } from './people.js';

before(startApp);
after(stopApp);

const NOT_FOR_PRODUCTION = 'не е за производство';

const names = (files: Map<string, string>) => [...files.keys()];
const svgs = (files: Map<string, string>) =>
  [...files].filter(([name]) => name.endsWith('.svg')).map(([, text]) => text);

async function download(b: Browser, id: string, kind: string): Promise<Map<string, string>> {
  return unzip(await b.get(`/app/p/${id}/export/${kind}`));
}

test('an error-free project: cnc.zip has DXF and G-code for every sheet, project.zip carries them', async () => {
  const b = await customer('clean-export@example.test');
  const id = await newProject(b);
  const cnc = await download(b, id, 'cnc.zip');
  const dxf = names(cnc).filter((name) => /^sheet-\d{2}\.dxf$/.test(name));
  const gcode = names(cnc).filter((name) => /^sheet-\d{2}\.nc$/.test(name));
  assert.ok(dxf.length >= 1, `DXF sheets: ${names(cnc).join(', ')}`);
  assert.equal(gcode.length, dxf.length, 'one G-code file for each DXF sheet');
  for (const name of gcode) assert.match(cnc.get(name) ?? '', /\bG0?0\b|\bG0?1\b/, name);
  for (const name of dxf) assert.match(cnc.get(name) ?? '', /SECTION/, name);

  const project = await download(b, id, 'project.zip');
  assert.deepEqual(
    names(project)
      .filter((name) => name.startsWith('cnc/'))
      .sort(),
    names(cnc)
      .map((name) => `cnc/${name}`)
      .sort(),
  );
  assert.match(project.get('README.txt') ?? '', /cnc\/ +DXF със слоеве и G-code/);
  assert.ok(project.has('project.json') && project.has('cut-list.csv'));
  assert.ok(svgs(project).length >= 2, 'project.zip carries the drawings');
  for (const svg of svgs(project)) assert.ok(!svg.includes(NOT_FOR_PRODUCTION));
});

test('a project with a construction error: project.zip leaves cnc/ out and says why; drawings are marked', async () => {
  const b = await customer('blocked-export@example.test');
  const id = await newProject(b, 'tv', 'ТВ');
  const { csrf, base } = await openEditor(b, id);
  // 2600 mm in 2 columns with doors: each door over 600 mm — beyond what the hinge maker allows
  const save = await saveProject(b, id, csrf, {
    spec: { type: 'tv', width: 2600, columns: 2, tvFronts: 'doors' },
    base,
  });
  assert.equal(save.status, 200);
  assert.equal((await b.get(`/app/p/${id}/export/cnc.zip`)).status, 422);

  const project = await download(b, id, 'project.zip');
  assert.deepEqual(
    names(project).filter((name) => name.startsWith('cnc/') || /\.(nc|dxf)$/.test(name)),
    [],
    'no machine file in the archive',
  );
  const readme = project.get('README.txt') ?? '';
  assert.match(readme, /cnc\/ +НЕ Е ИЗДАДЕНА/);
  assert.match(readme, /над 600 mm/, 'the README names the reason');
  const drawings = await download(b, id, 'drawings.zip');
  assert.ok(svgs(drawings).length >= 2, 'the drawings stay available');
  assert.ok(
    svgs(drawings).every((svg) => svg.includes(NOT_FOR_PRODUCTION)),
    'every sheet carries the red line',
  );
  assert.ok(svgs(project).length >= 2, 'project.zip carries the drawings');
  assert.ok(svgs(project).every((svg) => svg.includes(NOT_FOR_PRODUCTION)));
});

test('a saved hinge that left the catalogue blocks CNC instead of drilling for a substitute', async () => {
  const b = await customer('drift-export@example.test');
  const id = await newProject(b);
  const row = await prisma.project.findUniqueOrThrow({ where: { id } });
  const spec = { ...(row.spec as Record<string, unknown>), hinge: 'no-such-hinge' };
  await prisma.project.update({ where: { id }, data: { spec: spec as Prisma.InputJsonValue } });

  const cnc = await b.get(`/app/p/${id}/export/cnc.zip`);
  assert.equal(cnc.status, 422);
  assert.match(cnc.body, /Вече не е в каталога: панта „no-such-hinge“/);
  const project = await download(b, id, 'project.zip');
  assert.deepEqual(
    names(project).filter((name) => name.startsWith('cnc/')),
    [],
  );
  assert.match(project.get('README.txt') ?? '', /НЕ Е ИЗДАДЕНА[\s\S]*no-such-hinge/);
});
