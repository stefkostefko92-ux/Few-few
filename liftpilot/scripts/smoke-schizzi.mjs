// The survey sketches (round 50) against a running server whose PUBLIC_BASE_URL is BASE_URL, without the automatic
// reading configured (no VERTEX_*): a «Solo argano» calculation on a new installation; a PNG sketch of the shaft and an
// iPhone HEIC of the machine room uploaded (the HEIC kept as a JPEG); their previews drawn by the server (inline, image,
// sandboxed); the list says the reading is off and the reading answers 503 sketchOff; the panel on /progetto (the
// shaft's sketch shown, «Lettura automatica non attiva», no «Leggi lo schizzo»), a sketch uploaded from it and a photo
// already kept made a sketch; on the machine room's survey the room's sketch shown beside the form and the room
// measured on a DXF plan, confirmed and put into the form; a Tecnico uploads but cannot read (403); another company
// gets 404 for the list, the preview, the reading and the page. Standalone:
// BASE_URL=… ADMIN_PASSWORD=… node scripts/smoke-schizzi.mjs
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import * as acad from '@node-projects/acad-ts';
import { loadPlaywright, smokeKit, step } from './smoke-kit.mjs';

const HEIC = readFileSync(new URL('../src/lib/__tests__/fixtures/schizzi/schizzo.heic', import.meta.url));

/** An RGB PNG w × h with a dark frame on white, its bytes unique to `seed`. */
function png(w, h, seed) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w * 3 }, (_, i) => {
    const x = Math.floor(i / 3), edge = x < 4 || x >= w - 4 || y < 4 || y >= h - 4;
    return edge ? 30 : 250 - (seed % 7);
  }))]));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

/** A machine-room plan in millimetres: the room 3000 × 2800 (inner faces from 0,0, walls 300) and, on its own layer, the
 *  shaft below 1600 × 1750 with its inner corner at 500, 600. */
function plan() {
  const doc = new acad.CadDocument();
  doc.header.version = acad.ACadVersion.AC1027;
  doc.header.insUnits = acad.UnitsType.Millimeters;
  const walls = new acad.Layer('MURI'), shaft = new acad.Layer('VANO_SOTTO');
  doc.layers.add(walls);
  doc.layers.add(shaft);
  const rect = (x0, y0, x1, y1, layer) => {
    const p = new acad.LwPolyline([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => new acad.XY(x, y)));
    p.isClosed = true;
    p.layer = layer;
    doc.modelSpace.entities.add(p);
  };
  rect(0, 0, 3000, 2800, walls);
  rect(-300, -300, 3300, 3100, walls);
  rect(500, 600, 2100, 2350, shaft);
  const out = [];
  new acad.DxfWriter({ write: (v) => { out.push(v); } }, doc).write();
  return Buffer.from(out.join(''), 'utf8');
}

export async function schizziFlow({ BASE, browser, kit, ADMIN, stamp }) {
  const { login, logout, hydrated } = kit;
  const session = async (email, password) => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); await login(page, email, password); return { ctx, page }; };
  const upload = (who, projectId, file, fields) => who.ctx.request.post(`${BASE}/api/projects/${projectId}/allegati`, { headers: { Origin: BASE }, multipart: { ...fields, file }, failOnStatusCode: false });
  const lettura = (who, projectId, id, headers = { Origin: BASE, 'Content-Type': 'application/json' }) =>
    who.ctx.request.post(`${BASE}/api/projects/${projectId}/schizzi/${id}/lettura`, { headers, data: JSON.stringify({ target: 'vano' }), failOnStatusCode: false });
  const loaded = (page, sel) => page.waitForFunction((s) => { const img = globalThis.document.querySelector(s); return !!img && img.complete && img.naturalWidth > 0; }, sel, { timeout: 30000 });

  step('schizzi: an installation with a «Solo argano» calculation');
  const admin = await session(ADMIN.email, ADMIN.password), page = admin.page;
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Schizzi ${stamp}`);
  await page.fill('input[name="city"]', 'Bergamo');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const projectId = page.url().split('/').at(-2);
  await hydrated(page, '#Q');
  await page.click('.controls button:has-text("Esempio C")');
  await page.waitForSelector('.verdict .big');
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const calcUrl = page.url();

  step('schizzi: a PNG of the shaft and an iPhone HEIC of the machine room, kept as sketches');
  const r1 = await upload(admin, projectId, { name: 'vano.png', mimeType: 'image/png', buffer: png(240, 180, Number.parseInt(stamp, 36)) }, { kind: 'SCHIZZO', component: 'vano', title: 'Schizzo del vano' });
  assert.equal(r1.status(), 201, 'PNG sketch');
  const vano = (await r1.json()).attachment;
  assert.deepEqual([vano.kind, vano.component, vano.mime], ['SCHIZZO', 'vano', 'image/png']);
  const r2 = await upload(admin, projectId, { name: 'IMG_0420.HEIC', mimeType: 'image/heic', buffer: HEIC }, { kind: 'SCHIZZO', component: 'locale', title: 'Schizzo del locale' });
  assert.equal(r2.status(), 201, 'HEIC sketch');
  const locale = (await r2.json()).attachment;
  assert.deepEqual([locale.kind, locale.component, locale.mime], ['SCHIZZO', 'locale', 'image/jpeg'], 'the HEIC kept as a JPEG');

  step('schizzi: the previews drawn by the server; the reading off');
  for (const [a, mime] of [[vano, 'image/png'], [locale, 'image/jpeg']]) {
    const res = await admin.ctx.request.get(`${BASE}/api/allegati/${a.id}/anteprima`);
    assert.equal(res.status(), 200, `preview ${mime}`);
    const h = res.headers();
    assert.deepEqual([h['content-type'], h['x-pagine'], h['content-security-policy'], h['x-content-type-options']], [mime, '1', "sandbox; default-src 'none'", 'nosniff']);
    assert.match(h['content-disposition'], /^inline;/);
  }
  const list = await (await admin.ctx.request.get(`${BASE}/api/projects/${projectId}/schizzi`)).json();
  assert.equal(list.aiEnabled, false, 'no Vertex AI on this server');
  assert.deepEqual(list.schizzi.map((s) => s.id).sort(), [vano.id, locale.id].sort());
  const off = await lettura(admin, projectId, vano.id);
  assert.equal(off.status(), 503, 'the reading off');
  assert.equal((await off.json()).error, 'sketchOff');
  assert.equal(off.headers()['retry-after'], '10');
  assert.equal((await lettura(admin, projectId, vano.id, { 'Content-Type': 'application/json' })).status(), 403, 'not from the application’s pages');

  step('schizzi: the panel on /progetto — the shaft’s sketch, no reading; a sketch uploaded from it, a photo made a sketch');
  await page.goto(`${BASE}/it/app/projects/${projectId}/progetto`);
  const panel = '.schizzo-panel[data-schizzi="vano"]';
  await page.waitForSelector(`${panel} .schizzo-view img`);
  await loaded(page, `${panel} .schizzo-view img`);
  assert.equal(await page.getAttribute(`${panel} .schizzo-view img`, 'src'), `/api/allegati/${vano.id}/anteprima`, 'the shaft’s sketch first');
  assert.match(await page.textContent(panel), /Lettura automatica non attiva: inserisci le misure guardando lo schizzo\./);
  assert.equal(await page.locator(`${panel} [data-schizzi="leggi"]`).count(), 0, 'no reading button');
  await page.click(`${panel} .schizzo-carica > summary`);
  await hydrated(page, `${panel} form[data-schizzi="upload"] button[type="submit"]`);
  await page.setInputFiles(`${panel} form[data-schizzi="upload"] input[type="file"]`, { name: 'vano-2.png', mimeType: 'image/png', buffer: png(200, 300, 11) });
  await page.click(`${panel} form[data-schizzi="upload"] button[type="submit"]`);
  await page.waitForSelector(`${panel} [role="status"]:has-text("caricato")`);
  await page.waitForFunction((s) => globalThis.document.querySelectorAll(`${s} .schizzo-list li`).length === 3, panel);
  const photo = png(160, 120, 23);
  assert.equal((await upload(admin, projectId, { name: 'foto.png', mimeType: 'image/png', buffer: photo }, { kind: 'FOTO' })).status(), 201, 'a photo of the installation');
  await page.setInputFiles(`${panel} form[data-schizzi="upload"] input[type="file"]`, { name: 'foto.png', mimeType: 'image/png', buffer: photo });
  await page.click(`${panel} form[data-schizzi="upload"] button[type="submit"]`);
  await page.waitForSelector(`${panel} [role="status"]:has-text("già stato caricato come")`);
  await page.click(`${panel} button:has-text("Usalo come schizzo")`);
  await page.waitForSelector(`${panel} [role="status"]:has-text("ora è uno schizzo di rilievo")`);
  await page.waitForFunction((s) => globalThis.document.querySelectorAll(`${s} .schizzo-list li`).length === 4, panel);

  step('schizzi: the machine room’s survey — its sketch beside the form, the room measured on a DXF and put into the form');
  await page.goto(`${calcUrl}/locale`);
  const lp = '.schizzo-panel[data-schizzi="locale"]';
  await page.waitForSelector(`${lp} .schizzo-view img`);
  await loaded(page, `${lp} .schizzo-view img`);
  assert.equal(await page.getAttribute(`${lp} .schizzo-view img`, 'src'), `/api/allegati/${locale.id}/anteprima`, 'the room’s sketch first');
  assert.equal(await page.locator('main.page-wide .schizzo-layout').count(), 1, 'two columns');
  await hydrated(page, '#bk-room-W');
  await page.click('.locale-cad-box > summary');
  await page.setInputFiles('.locale-cad input[data-schizzi="cad-file"]', { name: 'locale.dxf', mimeType: 'application/dxf', buffer: plan() });
  await page.waitForSelector('.locale-cad .cad-canvas canvas');
  // a click on the drawing's point x, y [mm]: the viewer fits the drawing (−300…3300 × −300…3100) to 92 % of the
  // canvas, centred (CadViewer fit); the canvas brought into view first
  const canvas = page.locator('.locale-cad .cad-canvas');
  const click = async (x, y) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box, 'the drawing shown');
    const s = 0.92 * Math.min(box.width / 3600, box.height / 3400);
    await page.mouse.click(box.x + box.width / 2 + (x - 1500) * s, box.y + box.height / 2 - (y - 1400) * s);
  };
  const layer = '.locale-cad details.layers li:has-text("VANO_SOTTO") input[type="checkbox"]';
  await page.click('.locale-cad details.layers > summary');
  await page.uncheck(layer);
  await click(2700, 2600);
  await page.waitForSelector('.locale-cad [role="status"]:has-text("Locale: 3000 × 2800 mm")');
  await page.check(layer);
  await click(1300, 1500);
  await page.waitForSelector('.locale-cad [role="status"]:has-text("Vano: 1600 × 1750 mm")');
  const table = '.schizzo-conferma[data-fonte="cad"]';
  assert.equal(await page.locator(`${table} tbody tr`).count(), 6, 'room, shaft and where the shaft is');
  await page.click(`${table} button:has-text("Applica i valori confermati")`);
  await page.waitForSelector(`${table} [role="status"]:has-text("Applicati 6 valori dal disegno CAD")`);
  const typed = Object.fromEntries(await Promise.all(['room-W', 'room-D', 'room-shaftX', 'room-shaftY', 'shaft-W', 'shaft-D'].map(async (k) => [k, await page.inputValue(`#bk-${k}`)])));
  assert.deepEqual(typed, { 'room-W': '3000', 'room-D': '2800', 'room-shaftX': '500', 'room-shaftY': '600', 'shaft-W': '1600', 'shaft-D': '1750' });

  step('schizzi: a Tecnico uploads a sketch but cannot read one');
  await page.goto(`${BASE}/it/app/team`);
  const form = 'main form:has(input[name="email"])', email = `tecnico.schizzi.${stamp}@example.com`;
  await hydrated(page, `${form} button[type="submit"]`);
  await page.fill(`${form} input[name="name"]`, 'Tecnico schizzi');
  await page.fill(`${form} input[name="email"]`, email);
  await page.selectOption(`${form} select[name="role"]`, 'TECHNICIAN');
  await page.click(`${form} button[type="submit"]`);
  const temp = (await page.locator('.secret').first().textContent())?.trim() ?? '';
  const tecnico = await session(email, temp), next = `Schizzi${stamp}Pw9`;
  await tecnico.page.fill('input[name="current"]', temp);
  await tecnico.page.fill('input[name="next"]', next);
  await tecnico.page.fill('input[name="confirm"]', next);
  await tecnico.page.click('main form button[type="submit"]');
  await tecnico.page.waitForSelector('.alert-ok');
  assert.equal((await upload(tecnico, projectId, { name: 't.png', mimeType: 'image/png', buffer: png(64, 48, 31) }, { kind: 'SCHIZZO', component: 'vano' })).status(), 201, 'a Tecnico uploads');
  assert.equal((await lettura(tecnico, projectId, vano.id)).status(), 403, 'a Tecnico does not read');

  step('schizzi: another company gets nothing (404)');
  await page.goto(`${BASE}/it/app/admin`);
  const ownerEmail = `titolare.schizzi.${stamp}@example.com`;
  await page.fill('input[name="name"]', `Ditta schizzi ${stamp}`);
  await page.fill('input[name="ownerName"]', 'Titolare schizzi');
  await page.fill('input[name="ownerEmail"]', ownerEmail);
  await page.click('main form:has(input[name="ownerEmail"]) button[type="submit"]');
  const ownerTemp = (await page.locator('.secret').first().textContent())?.trim() ?? '';
  const other = await session(ownerEmail, ownerTemp), ownerNext = `Titolare${stamp}Schizzi9`;
  await other.page.fill('input[name="current"]', ownerTemp);
  await other.page.fill('input[name="next"]', ownerNext);
  await other.page.fill('input[name="confirm"]', ownerNext);
  await other.page.click('main form button[type="submit"]');
  await other.page.waitForSelector('.alert-ok');
  await other.page.goto(`${BASE}/it/app`);
  await hydrated(other.page, 'main form:has(input[name="clauses"]) button[type="submit"]');
  for (const k of ['accept', 'business', 'drafts', 'clauses']) await other.page.check(`main input[name="${k}"]`);
  await other.page.fill('main form:has(input[name="clauses"]) input[name="password"]', ownerNext);
  await other.page.click('main form:has(input[name="clauses"]) button[type="submit"]');
  await other.page.waitForSelector('main form:has(input[name="clauses"])', { state: 'detached' });
  assert.equal((await other.ctx.request.get(`${BASE}/api/projects/${projectId}/schizzi`)).status(), 404, 'the list');
  assert.equal((await other.ctx.request.get(`${BASE}/api/allegati/${vano.id}/anteprima`)).status(), 404, 'the preview');
  assert.equal((await lettura(other, projectId, vano.id)).status(), 404, 'the reading');
  assert.equal((await other.page.goto(`${BASE}/it/app/projects/${projectId}/progetto`))?.status(), 404, 'the page');
  await other.page.goto(`${BASE}/it/app`);

  for (const x of [tecnico, other]) { await logout(x.page); await x.ctx.close(); }
  await admin.ctx.close();
  return { projectId, schizzi: [vano.id, locale.id] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const BASE = (process.env.BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
  const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@carbonstealth.eu', password: process.env.ADMIN_PASSWORD ?? '' };
  if (!ADMIN.password) throw new Error('ADMIN_PASSWORD is required');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    await schizziFlow({ BASE, browser, kit: smokeKit(BASE), ADMIN, stamp: Date.now().toString(36) });
    step('schizzi: all good');
  } finally {
    await browser.close();
  }
}
