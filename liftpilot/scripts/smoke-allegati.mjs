// The documents uploaded for an installation (round 49, plan §6.1, §11.7, §11.9) against a running server whose
// PUBLIC_BASE_URL is BASE_URL: only from the application's own pages (a POST from another site or without Origin is
// refused); a 2-page PDF, then the same bytes again (the same row); a phone photo with GPS, downloaded as an attachment
// that may do nothing in a browser and without the GPS; a renamed program, a polyglot, «%PDF» not at 0, a protected
// PDF, an XFA form refused with their answers; 21 MiB refused by its Content-Length and, sent in chunks without one, by
// the byte counter; a Tecnico uploads, a Commerciale downloads and cannot upload; another company sees nothing (404);
// an archived installation takes nothing. Standalone: BASE_URL=… ADMIN_PASSWORD=… node scripts/smoke-allegati.mjs
// (the platform's administrator works in its own company and makes the colleagues; the second company is made from
// /app/admin). `allegatiFlow` is also callable from scripts/smoke.mjs.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { loadPlaywright, smokeKit, step } from './smoke-kit.mjs';

const GPS = 'GPS-45.4642N-9.1900E-smoke';
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDo9E8Gf2Tq0F9/aHneVu+TyducqR13H1rq6KKmMFFWRtXxFSvLmqO7CiiiqMT/2Q==', 'base64');

/** The JPEG with an EXIF segment (big-endian TIFF): orientation 6 and an ASCII tag carrying the GPS marker. */
function phoneJpeg(stamp) {
  const text = Buffer.from(`${GPS}-${stamp}\0`, 'latin1');
  const tiff = Buffer.alloc(8 + 2 + 24 + 4);
  tiff.write('MM', 0, 'latin1'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(2, 8);
  tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(6, 18);
  tiff.writeUInt16BE(0x010e, 22); tiff.writeUInt16BE(2, 24); tiff.writeUInt32BE(text.length, 26); tiff.writeUInt32BE(tiff.length, 30);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, text]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  return Buffer.concat([JPEG.subarray(0, 20), seg, JPEG.subarray(20)]);
}

/** An RGB PNG w × h of one grey, its bytes unique to `seed`. */
function png(w, h, seed) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, seed % 256)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

async function pdf(pages, label, build) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]).drawText(`${label} ${i + 1}`, { x: 40, y: 800, size: 12 });
  build?.(doc);
  return Buffer.from(await doc.save());
}

/** A chunked POST without Content-Length, 1 MiB at a time up to 22 MiB: the status line the server answers with. */
function chunked(BASE, path, cookie) {
  const u = new URL(BASE);
  return new Promise((resolve) => {
    const sock = net.connect(Number(u.port || 80), u.hostname);
    let answer = '', sent = 0, done = false;
    const finish = () => { if (!done) { done = true; sock.destroy(); resolve({ status: Number(/^HTTP\/1\.1 (\d{3})/.exec(answer)?.[1] ?? 0), sent }); } };
    sock.on('data', (d) => { answer += d.toString('latin1'); if (answer.includes('\r\n\r\n')) finish(); });
    sock.on('error', finish);
    sock.on('close', finish);
    sock.on('connect', () => {
      sock.write(`POST ${path} HTTP/1.1\r\nHost: ${u.host}\r\nOrigin: ${u.origin}\r\nCookie: ${cookie}\r\nContent-Type: multipart/form-data; boundary=x\r\nTransfer-Encoding: chunked\r\n\r\n`);
      const mib = Buffer.alloc(1 << 20, 0x41);
      const pump = () => {
        while (!done && sent < 22 << 20) {
          sent += mib.length;
          // the three parts of a chunk always together (a short-circuit here would break the framing)
          sock.write(`${mib.length.toString(16)}\r\n`);
          sock.write(mib);
          if (!sock.write('\r\n')) return void sock.once('drain', pump);
        }
        if (!done) sock.write('0\r\n\r\n');
      };
      pump();
    });
  });
}

export async function allegatiFlow({ BASE, browser, kit, ADMIN, stamp }) {
  const { login, logout, hydrated } = kit;
  const session = async (email, password) => { const ctx = await browser.newContext(); const page = await ctx.newPage(); await login(page, email, password); return { ctx, page }; };
  const post = (who, projectId, file, fields = { kind: 'DICHIARAZIONE_UE' }, headers = { Origin: BASE }) =>
    who.ctx.request.post(`${BASE}/api/projects/${projectId}/allegati`, { headers, multipart: { ...fields, file }, failOnStatusCode: false });
  const body = async (r) => { try { return await r.json(); } catch { return null; } };

  step('allegati: installation, Tecnico and Commerciale of the administrator’s company');
  const admin = await session(ADMIN.email, ADMIN.password);
  await admin.page.goto(`${BASE}/it/app/projects/new`);
  await admin.page.fill('input[name="name"]', `Allegati ${stamp}`);
  await Promise.all([admin.page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), admin.page.click('main form button[type="submit"]')]);
  const projectUrl = admin.page.url().replace(/\/calc$/, ''), projectId = projectUrl.split('/').pop();
  const colleague = async (role, label) => {
    await admin.page.goto(`${BASE}/it/app/team`);
    const form = 'main form:has(input[name="email"])';
    await hydrated(admin.page, `${form} button[type="submit"]`);
    const email = `${label}.allegati.${stamp}@example.com`;
    await admin.page.fill(`${form} input[name="name"]`, `${label} allegati`);
    await admin.page.fill(`${form} input[name="email"]`, email);
    await admin.page.selectOption(`${form} select[name="role"]`, role);
    await admin.page.click(`${form} button[type="submit"]`);
    const temp = (await admin.page.locator('.secret').first().textContent())?.trim() ?? '';
    const s = await session(email, temp), next = `Allegati${stamp}Pw9${label}`;
    await s.page.fill('input[name="current"]', temp);
    await s.page.fill('input[name="next"]', next);
    await s.page.fill('input[name="confirm"]', next);
    await s.page.click('main form button[type="submit"]');
    await s.page.waitForSelector('.alert-ok');
    return s;
  };
  const tecnico = await colleague('TECHNICIAN', 'tecnico'), commerciale = await colleague('SALES', 'commerciale');

  step('allegati: only from the application’s own pages');
  const two = await pdf(2, `Dichiarazione ${stamp}`);
  const file = (buffer, name, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer });
  for (const [what, headers] of [['another site', { Origin: 'https://evil.example' }], ['no Origin', {}]]) {
    const r = await post(admin, projectId, file(two, 'd.pdf'), undefined, headers);
    assert.equal(r.status(), 403, what);
  }

  step('allegati: a PDF, the same bytes again, a phone photo without its GPS');
  const r1 = await post(admin, projectId, file(two, '../../Dichiarazione UE quadro.pdf'), { kind: 'DICHIARAZIONE_UE', component: 'quadro' });
  assert.equal(r1.status(), 201, 'PDF uploaded');
  const a1 = (await body(r1)).attachment;
  assert.deepEqual([a1.pages, a1.fileName, a1.title, a1.component], [2, 'Dichiarazione UE quadro.pdf', 'Dichiarazione UE quadro', 'quadro']);
  const again = await body(await post(admin, projectId, file(two, 'copia.pdf'), { kind: 'ALTRO' }));
  assert.deepEqual([again.duplicate, again.attachment.id], [true, a1.id], 'the same bytes: the same row');
  const photo = phoneJpeg(stamp);
  assert.ok(photo.includes(Buffer.from(GPS, 'latin1')));
  const r2 = await post(tecnico, projectId, file(photo, 'IMG_0001.jpg', 'image/jpeg'), { kind: 'FOTO', component: 'argano', title: 'Targa della macchina' });
  assert.equal(r2.status(), 201, 'a Tecnico uploads');
  const a2 = (await body(r2)).attachment;
  const dl = await commerciale.ctx.request.get(`${BASE}/api/allegati/${a2.id}`);
  assert.equal(dl.status(), 200, 'a Commerciale downloads');
  const h = dl.headers();
  assert.equal(h['content-type'], 'image/jpeg');
  assert.match(h['content-disposition'], new RegExp(`^attachment; filename="targa-della-macchina-${a2.sha256.slice(0, 8)}\\.jpg"$`));
  assert.equal(h['content-security-policy'], "sandbox; default-src 'none'");
  assert.equal(h['x-content-type-options'], 'nosniff');
  assert.equal(h['cache-control'], 'private, no-store');
  const kept = await dl.body();
  assert.ok(!kept.includes(Buffer.from(GPS, 'latin1')) && !kept.includes(Buffer.from('Exif\0\0', 'latin1')), 'the downloaded copy has no GPS, no EXIF');
  assert.equal(kept.length, a2.size ?? kept.length);
  assert.equal((await post(commerciale, projectId, file(png(40, 30, 1), 'x.png'), { kind: 'FOTO' })).status(), 403, 'a Commerciale cannot upload');

  step('allegati: what the bytes are, not the name — refused with its own answer');
  const refusals = [
    ['a renamed program', file(Buffer.from('MZ\x90\0\x03\0\0\0PE\0\0 program', 'latin1'), 'dichiarazione.pdf'), 415, 'fileInvalid'],
    ['a polyglot', file(Buffer.concat([two, JPEG]), 'foto.jpg'), 415, 'fileInvalid'],
    ['«%PDF» not at 0', file(Buffer.concat([Buffer.from('<html>'), two]), 'x.pdf'), 415, 'fileInvalid'],
    ['a protected PDF', file(await pdf(1, 'p', (d) => { d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4, O: PDFString.of('o'), U: PDFString.of('u') })); }), 'p.pdf'), 422, 'pdfProtected'],
    ['an XFA form', file(await pdf(1, 'x', (d) => { d.catalog.set(PDFName.of('AcroForm'), d.context.obj({ Fields: [], XFA: [PDFString.of('t')] })); }), 'x.pdf'), 422, 'pdfForm'],
  ];
  for (const [what, f, status, error] of refusals) {
    const r = await post(admin, projectId, f);
    assert.deepEqual([r.status(), (await body(r))?.error], [status, error], what);
  }

  step('allegati: 21 MiB — by its Content-Length, and in chunks by the byte counter');
  const big = await post(admin, projectId, file(Buffer.alloc(21 << 20, 0x41), 'grande.pdf'));
  assert.equal(big.status(), 413, '21 MiB with its Content-Length');
  if (new URL(BASE).protocol === 'http:') {
    const cookie = (await admin.ctx.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ');
    const c = await chunked(BASE, `/api/projects/${projectId}/allegati`, cookie);
    assert.equal(c.status, 413, 'chunked, no Content-Length');
    assert.ok(c.sent <= 22 << 20, `stopped by the counter (${c.sent} bytes sent)`);
  } else step('allegati: (chunked case skipped on https)');

  step('allegati: another company sees nothing, uploads nothing');
  await admin.page.goto(`${BASE}/it/app/admin`);
  const ownerEmail = `titolare.allegati.${stamp}@example.com`;
  await admin.page.fill('input[name="name"]', `Ditta allegati ${stamp}`);
  await admin.page.fill('input[name="ownerName"]', 'Titolare allegati');
  await admin.page.fill('input[name="ownerEmail"]', ownerEmail);
  await admin.page.click('main form:has(input[name="ownerEmail"]) button[type="submit"]');
  const ownerTemp = (await admin.page.locator('.secret').first().textContent())?.trim() ?? '';
  const other = await session(ownerEmail, ownerTemp), ownerNext = `Titolare${stamp}Allegati9`;
  await other.page.fill('input[name="current"]', ownerTemp);
  await other.page.fill('input[name="next"]', ownerNext);
  await other.page.fill('input[name="confirm"]', ownerNext);
  await other.page.click('main form button[type="submit"]');
  await other.page.waitForSelector('.alert-ok');
  await other.page.goto(`${BASE}/it/app`);
  await hydrated(other.page, 'main form:has(input[name="clauses"]) button');
  for (const k of ['accept', 'business', 'drafts', 'clauses']) await other.page.check(`main input[name="${k}"]`);
  await other.page.fill('main form:has(input[name="clauses"]) input[name="password"]', ownerNext);
  await other.page.click('main form:has(input[name="clauses"]) button');
  await other.page.waitForSelector('main form:has(input[name="clauses"])', { state: 'detached' });
  for (const id of [a1.id, a2.id]) assert.equal((await other.ctx.request.get(`${BASE}/api/allegati/${id}`)).status(), 404, 'another company’s file');
  assert.equal((await post(other, projectId, file(png(40, 30, 2), 'y.png'), { kind: 'FOTO' })).status(), 404, 'another company’s installation');

  step('allegati: an archived installation takes nothing');
  await admin.page.goto(projectUrl);
  await hydrated(admin.page, 'main form:has(input[name="archive"][value="1"]) button');
  await admin.page.click('main form:has(input[name="archive"][value="1"]) button');
  await admin.page.waitForSelector('main form:has(input[name="archive"][value="0"])');
  const arch = await post(admin, projectId, file(png(40, 30, 3), 'z.png'), { kind: 'FOTO' });
  assert.deepEqual([arch.status(), (await body(arch))?.error], [409, 'archived']);
  assert.equal((await admin.ctx.request.get(`${BASE}/api/allegati/${a1.id}`)).status(), 200, 'still downloaded');
  await hydrated(admin.page, 'main form:has(input[name="archive"][value="0"]) button');
  await admin.page.click('main form:has(input[name="archive"][value="0"]) button');
  await admin.page.waitForSelector('main form:has(input[name="archive"][value="1"])');

  for (const s of [tecnico, commerciale, other]) { await logout(s.page); await s.ctx.close(); }
  await admin.ctx.close();
  return { projectUrl, projectId, attachments: [a1.id, a2.id] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const BASE = (process.env.BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
  const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@carbonstealth.eu', password: process.env.ADMIN_PASSWORD ?? '' };
  if (!ADMIN.password) throw new Error('ADMIN_PASSWORD is required');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    await allegatiFlow({ BASE, browser, kit: smokeKit(BASE), ADMIN, stamp: Date.now().toString(36) });
    step('allegati: all good');
  } finally {
    await browser.close();
  }
}
