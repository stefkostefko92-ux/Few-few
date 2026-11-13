import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { issueDocument } = await import('../../src/documents/issue.js');
const { createServer } = await import('../../src/server.js');
const { domestic } = await import('../fixtures/einvoice-samples.js');

/** Изгледът на PDF от настройките на фирмата (SPEC 32–34). */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Шипка“ 1',
  addressCity: 'София',
  postalCode: '1000',
};
let server: Server;
let origin = '';
let company = { userId: '', organizationId: '' };
let firm = { userId: '', organizationId: '' };

interface Session {
  cookie: string;
  csrf: string;
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${origin}/vhod`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: PASSWORD }),
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const page = await fetch(`${origin}/app`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? '';
  return { cookie, csrf };
}

const get = (s: Session, path: string) =>
  fetch(`${origin}${path}`, { redirect: 'manual', headers: { cookie: s.cookie } });

function post(s: Session, path: string, fields: Record<string, string>) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: s.cookie },
    body: new URLSearchParams({ _csrf: s.csrf, ...fields }),
  });
}

function upload(s: Session, path: string, file: Buffer, type: string, token: string | null) {
  const form = new FormData();
  if (token !== null) form.append('_csrf', token);
  form.append('logo', new Blob([file], { type }), 'logo');
  return fetch(`${origin}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: s.cookie },
    body: form,
  });
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  company = await register({
    ...base,
    kind: 'company',
    name: 'Карбон Стелт',
    email: 'owner@example.test',
    legalName: 'Карбон Стелт ЕДПК',
    eik: '208725180',
    vatNumber: 'BG208725180',
    iban: 'BG80BNBG96611020345678',
  });
  firm = await register({
    ...base,
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'firm@example.test',
    legalName: 'Кантора Баланс ООД',
    eik: '121604974',
  });
  await prisma.clientMandate.create({
    data: {
      firmId: firm.organizationId,
      clientId: company.organizationId,
      status: 'ACTIVE',
      documentRef: 'Пълномощно № 1',
      validFrom: new Date('2026-11-01T00:00:00Z'),
    },
  });
  server = createServer().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('собственикът сменя шрифта, шаблона, цвета и позицията; блед цвят се отказва', async () => {
  const s = await login('owner@example.test');
  const path = `/app/o/${company.organizationId}/nastroyki`;
  const page = await get(s, path);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('name="template"'));
  const saved = await post(s, `${path}/pdf`, {
    font: 'liberation-serif',
    template: 'band',
    accent: '#1f3a93',
    logoPosition: 'right',
  });
  assert.equal(saved.status, 303);
  const row = await prisma.pdfStyle.findUniqueOrThrow({
    where: { organizationId: company.organizationId },
  });
  assert.deepEqual(
    [row.font, row.template, row.accent, row.logoPosition],
    ['liberation-serif', 'band', '#1f3a93', 'right'],
  );
  const pale = await post(s, `${path}/pdf`, {
    font: 'dejavu-sans',
    template: 'classic',
    accent: '#ffff00',
    logoPosition: 'left',
  });
  assert.equal(pale.status, 400);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'organization.pdfStyle.saved' },
  });
  assert.equal(log.organizationId, company.organizationId);
});

test('логото: multipart с токен минава и се прекодира; без токен, на чужд адрес или SVG — отказ', async () => {
  const s = await login('owner@example.test');
  const path = `/app/o/${company.organizationId}/nastroyki/logo`;
  const png = await sharp({
    create: { width: 1600, height: 400, channels: 4, background: '#1f3a93' },
  })
    .png()
    .toBuffer();
  assert.equal((await upload(s, path, png, 'image/png', null)).status, 403);
  assert.equal(
    (await upload(s, `/app/o/${company.organizationId}/nastroyki/pdf`, png, 'image/png', s.csrf))
      .status,
    403,
  );
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  assert.equal((await upload(s, path, svg, 'image/png', s.csrf)).status, 400);
  const ok = await upload(s, path, png, 'image/png', s.csrf);
  assert.equal(ok.status, 303);
  const row = await prisma.pdfStyle.findUniqueOrThrow({
    where: { organizationId: company.organizationId },
  });
  assert.equal(row.logoType, 'image/png');
  assert.deepEqual([row.logoWidth, row.logoHeight], [1200, 300]);
  const image = await get(s, `/app/o/${company.organizationId}/nastroyki/logo.png`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
});

test('образецът и PDF-ът на издадения документ са в избрания изглед', async () => {
  const s = await login('owner@example.test');
  const sample = await get(s, `/app/o/${company.organizationId}/nastroyki/obrazets.pdf`);
  assert.equal(sample.status, 200);
  assert.equal(sample.headers.get('content-type'), 'application/pdf');
  const sampleRaw = Buffer.from(await sample.arrayBuffer()).toString('latin1');
  assert.ok(sampleRaw.includes('/Subtype /Image') && sampleRaw.includes('LiberationSerif'));

  const series = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: company.organizationId },
  });
  const { seller: _seller, number: _number, ...request } = domestic;
  const issued = await issueDocument(
    { organizationId: company.organizationId, role: 'OWNER', viaFirmId: null, mandateId: null },
    company.userId,
    { ...request, seriesId: series.id },
  );
  const pdf = await get(s, `/app/o/${company.organizationId}/d/${issued.id}/pdf`);
  assert.equal(pdf.status, 200);
  const raw = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
  assert.ok(raw.includes('/Subtype /Image') && raw.includes('LiberationSerif'));

  // Без лого: махането работи, PDF-ът е без изображение.
  const removed = await post(s, `/app/o/${company.organizationId}/nastroyki/logo/mahni`, {});
  assert.equal(removed.status, 303);
  const again = await get(s, `/app/o/${company.organizationId}/d/${issued.id}/pdf`);
  assert.ok(
    !Buffer.from(await again.arrayBuffer())
      .toString('latin1')
      .includes('/Subtype /Image'),
  );
});

test('кантората по пълномощно не сменя изгледа на фирмата', async () => {
  const s = await login('firm@example.test');
  assert.equal((await get(s, `/app/o/${company.organizationId}/nastroyki`)).status, 404);
  const tried = await post(s, `/app/o/${company.organizationId}/nastroyki/pdf`, {
    font: 'dejavu-sans',
    template: 'classic',
    accent: '#0b6b52',
    logoPosition: 'left',
  });
  assert.equal(tried.status, 404);
});

test('повреден запис на логото в базата не чупи PDF-а — рисува се без лого', async () => {
  const s = await login('owner@example.test');
  const broken = {
    logo: Buffer.from('не е изображение'),
    logoType: 'image/png',
    logoWidth: 100,
    logoHeight: 50,
  };
  await prisma.pdfStyle.upsert({
    where: { organizationId: company.organizationId },
    create: { organizationId: company.organizationId, ...broken },
    update: broken,
  });
  const sample = await get(s, `/app/o/${company.organizationId}/nastroyki/obrazets.pdf`);
  assert.equal(sample.status, 200);
  const raw = Buffer.from(await sample.arrayBuffer()).toString('latin1');
  assert.ok(!raw.includes('/Subtype /Image'));
});

test('качването на лого е с таван на заявките на човек', async () => {
  await register({
    ...base,
    kind: 'company',
    name: 'Драгомир Петков',
    email: 'limit@example.test',
    legalName: 'Таван ЕООД',
    eik: '200000002',
  });
  const s = await login('limit@example.test');
  const org = await prisma.organization.findUniqueOrThrow({ where: { eik: '200000002' } });
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const statuses: number[] = [];
  let last: Response | null = null;
  for (let i = 0; i < 21; i += 1) {
    last = await upload(s, `/app/o/${org.id}/nastroyki/logo`, svg, 'image/png', s.csrf);
    statuses.push(last.status);
  }
  assert.deepEqual(statuses.slice(0, 20), Array(20).fill(400));
  // Над тавана — страницата с обяснение, не гол текст „Too many requests“ (изглеждаше като срив).
  assert.equal(statuses[20], 303);
  assert.equal(last?.headers.get('location'), `/app/o/${org.id}/nastroyki?greshka=logoTooMany`);
  const page = await fetch(`${origin}/app/o/${org.id}/nastroyki?greshka=logoTooMany`, {
    headers: { cookie: s.cookie },
  });
  assert.equal(page.status, 429);
  assert.match(await page.text(), /опитайте пак след 10 минути/);
});

test('снимка от телефон (над 1 MB) се приема и се свежда до лого', async () => {
  await register({
    ...base,
    kind: 'company',
    name: 'Петя Колева',
    email: 'photo@example.test',
    legalName: 'Снимка ЕООД',
    eik: '200000015',
  });
  const s = await login('photo@example.test');
  const org = await prisma.organization.findUniqueOrThrow({ where: { eik: '200000015' } });
  // ~1,7 MB JPEG (шум — не се компресира), 1400×1400 — по-рано: „Файлът е над 1 MB“.
  const noise = Buffer.alloc(1400 * 1400 * 3);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) >>> 24;
  const photo = await sharp(noise, { raw: { width: 1400, height: 1400, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
  assert.ok(photo.length > 1024 * 1024);
  const res = await upload(s, `/app/o/${org.id}/nastroyki/logo`, photo, 'image/jpeg', s.csrf);
  assert.equal(res.status, 303);
  const style = await prisma.pdfStyle.findUniqueOrThrow({ where: { organizationId: org.id } });
  assert.ok(style.logo && style.logo.length < photo.length);
  assert.ok((style.logoWidth ?? 0) <= 1200 && (style.logoHeight ?? 0) <= 600);
});
