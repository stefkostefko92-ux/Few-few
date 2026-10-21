// The relazione tecnica di modifica (round 49, RT plan §7, §11) in the smoke test, on the installations the run made:
// the replacement's machine room (scripts/smoke-replacement.mjs, the room path): from its page to the workspace, the
// registry with the year 1978 (DPR 1497/1963 derived, then confirmed on the logbook), a 2-page PDF and a phone photo
// uploaded, a section added by hand with its reason, the description and the signatures typed (the draft kept), the
// draft's PDF, the issue after the dialog (Esc closes it, the confirmation issues), the RT's page, its PDF = its body +
// the files' pages, a revision R1 with its note; the Progetto of the main installation (the shaft path): its automatic
// sections with the clause of each reason, the registry's owner missing blocks the issue, the issue; a «Trasformazione
// completa» says why it has none; the old relazione tecnica of the machine room is gone (404); the workspace fits a phone.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { step } from './smoke-kit.mjs';

// a 24 × 12 JPEG and an EXIF segment with a GPS marker in it (the upload strips it: smoke-allegati.mjs checks how)
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDo9E8Gf2Tq0F9/aHneVu+TyducqR13H1rq6KKmMFFWRtXxFSvLmqO7CiiiqMT/2Q==', 'base64');
function phoneJpeg(stamp) {
  const text = Buffer.from(`GPS-45.4642N-9.1900E-rt-${stamp}\0`, 'latin1'), tiff = Buffer.alloc(22);
  tiff.write('MM', 0, 'latin1'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x010e, 10); tiff.writeUInt16BE(2, 12); tiff.writeUInt32BE(text.length, 14); tiff.writeUInt32BE(tiff.length, 18);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, text]);
  return Buffer.concat([JPEG.subarray(0, 20), Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body, JPEG.subarray(20)]);
}
async function pdf(pages, label) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]).drawText(`${label} ${i + 1}`, { x: 40, y: 800, size: 12 });
  return Buffer.from(await doc.save());
}
const pagesOf = async (bytes) => (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();

/** The description and the signatures of «Verificato da», then the live summary and the draft settled. */
async function compila(page, hydrated, descrizione) {
  await hydrated(page, '#rt-descr');
  await page.fill('#rt-descr', descrizione);
  await page.selectOption('#rt-ver-tit', 'Ing.');
  await page.fill('#rt-ver-nome', 'Laura Bianchi');
  await page.fill('#rt-ver-prov', 'Milano');
  await page.fill('#rt-ver-num', 'A12345');
  assert.notEqual(await page.inputValue('#rt-red-nome'), '', '«Redatto da»: the user, prefilled');
  // the draft kept (or taken up again, the same values typed)
  await page.waitForFunction(() => /Bozza (salvata|ripresa)/.test(globalThis.document.querySelector('.rt-bar .draft-bar')?.textContent ?? ''), null, { timeout: 20000 });
  await page.waitForFunction(() => /Riepilogo aggiornato/.test(globalThis.document.querySelector('.rt-live')?.textContent ?? ''), null, { timeout: 20000 });
}

/** The issue: the dialog lists what is printed as not satisfied, missing or to attach; Esc closes it; confirmed, the RT's page. */
async function emetti(page, label) {
  const button = `#rt-firme button.btn-primary:has-text("${label}")`;
  await page.click(button);
  await page.waitForSelector('dialog.rt-dialog[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.rt-dialog[open]', { state: 'detached' });
  await page.click(button);
  await page.waitForSelector('dialog.rt-dialog[open]');
  const lists = await page.locator('dialog.rt-dialog .rt-dlg-group').count();
  assert.ok(lists > 0 || /non manca nessun dato/.test(await page.textContent('dialog.rt-dialog')), 'what the RT prints as missing, listed');
  await Promise.all([page.waitForURL(/\/app\/relazioni\/[a-z0-9]+$/, { timeout: 90000 }), page.click('dialog.rt-dialog button:has-text("Confermo ed emetto")')]);
  return page.url();
}

/** The room path, on the replacement's machine room while its «Solo argano» is the installation's latest calculation. */
export async function rtRoom({ BASE, page, hydrated, stamp, roomUrl, roomId }) {
  step('RT: the old relazione tecnica of the machine room is gone; its page leads to the relazione tecnica di modifica');
  assert.equal((await page.request.get(`${BASE}/api/room-designs/${roomId}/relazione`)).status(), 404, 'old room relazione: 404');
  await page.goto(roomUrl);
  await Promise.all([page.waitForURL(/\/relazione-tecnica$/), page.click('.page-head .actions a[href$="/relazione-tecnica"]')]);
  const wsUrl = page.url(), projectId = wsUrl.split('/').at(-2);
  assert.equal(await page.locator('[data-rt-base="locale"]').count(), 1, 'the room path: its base is the machine room surveyed');

  step('RT: the registry — 1978 gives DPR 1497/1963 to confirm on the logbook, confirmed and saved');
  await hydrated(page, '#rt-anno');
  await page.fill('#rt-anno', '1978');
  assert.match(await page.textContent('#rt-legge option:first-child'), /DPR 1497\/1963 \(dall’anno di installazione\)/, 'the law derived from the year');
  assert.match(await page.textContent('#rt-legge-h'), /confermala sul libretto/);
  await page.check('#rt-legge-ok');
  await page.fill('#rt-prop', 'Condominio Via Roma 1');
  await page.fill('#rt-man', 'Ascensori Brianza');
  await page.click('form.rt-anagrafica button[type="submit"]');
  await page.waitForSelector('form.rt-anagrafica .note:has-text("Anagrafica salvata.")');
  await page.waitForFunction(() => /DPR 1497\/1963/.test(globalThis.document.querySelector('[data-rt="esito"] .rt-kpi')?.textContent ?? ''), null, { timeout: 20000 });

  step('RT: two files of the installation (a 2-page PDF, a phone photo): the document joins on its own, the photo when added');
  const post = (file, fields) => page.request.post(`${BASE}/api/projects/${projectId}/allegati`, { headers: { Origin: BASE }, multipart: { ...fields, file } });
  const doc = await pdf(2, `Libretto RT ${stamp}`);
  assert.equal((await post({ name: 'libretto.pdf', mimeType: 'application/pdf', buffer: doc }, { kind: 'LIBRETTO_VERBALE', title: 'Libretto e verbali' })).status(), 201);
  assert.equal((await post({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: phoneJpeg(stamp) }, { kind: 'FOTO', title: 'Fotografia del locale' })).status(), 201);
  await page.goto(wsUrl);
  await page.waitForSelector('#rt-allegati ol.rt-ordine li');
  assert.equal(await page.locator('#rt-allegati ol.rt-ordine > li').count(), 1, 'the document only: a photo is never attached on its own');
  await hydrated(page, '#rt-allegati button[aria-label="Allega «Fotografia del locale» alla relazione"]');
  await page.click('#rt-allegati button[aria-label="Allega «Fotografia del locale» alla relazione"]');
  await page.waitForFunction(() => globalThis.document.querySelectorAll('#rt-allegati ol.rt-ordine > li').length === 2, null, { timeout: 20000 });
  assert.equal(await page.locator('#rt-allegati ol.rt-ordine > li').count(), 2, 'both files in the relazione');
  assert.match(await page.textContent('#rt-allegati ol.rt-ordine > li:first-child'), /Libretto e verbali/);
  assert.ok(await page.locator('#rt-sezioni article.rt-sezione .chip.rt-auto').count() > 0, 'sections brought by the rule');
  // a section the rule does not bring, added with its reason
  await hydrated(page, '.rt-aggiungibili li button');
  const extra = (await page.locator('.rt-aggiungibili li').first().locator('span').first().textContent()) ?? '';
  await page.click('.rt-aggiungibili li:first-child button');
  await page.fill('.rt-aggiungi input', 'Verificata comunque per scelta del tecnico');
  await page.click('.rt-aggiungi button:has-text("Aggiungi alla relazione")');
  await page.waitForSelector(`#rt-sezioni article.rt-sezione:has(h3:text-is("${extra}")) .chip.rt-man`, { timeout: 20000 });

  step('RT: description and signatures typed (the draft kept), the draft’s PDF');
  await compila(page, hydrated, `Sostituzione dell’argano esistente con uno nuovo, prova ${stamp}: funi sostituite, quadro esistente.`);
  const [preview] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#rt-firme button:has-text("Anteprima PDF")')]);
  const draftPdf = await preview.createReadStream().then(async (s) => { const c = []; for await (const x of s) c.push(x); return Buffer.concat(c); });
  assert.equal(draftPdf.subarray(0, 5).toString('latin1'), '%PDF-', 'the draft’s PDF');
  await page.goto(wsUrl);
  assert.match(await page.textContent('.rt-bar .draft-bar'), /Bozza ripresa/, 'the draft taken up again');

  step('RT: issued after the dialog; its page; its PDF is its body and the files’ pages');
  await hydrated(page, '#rt-firme button.btn-primary');
  const rtUrl = await emetti(page, 'Emetti la relazione'), rtId = rtUrl.split('/').pop();
  const numero = /RT (\d{2}-\d{3}) R0$/.exec(await page.textContent('h1'))?.[1];
  assert.ok(numero, 'number and revision');
  assert.ok(((await page.textContent('main section[aria-labelledby="rt-p-sezioni"]')) ?? '').includes(`${extra}aggiunta dal tecnico`), 'the section added, on its page');
  const res = await page.request.get(`${BASE}/api/relazioni/${rtId}/pdf`);
  assert.equal(res.status(), 200);
  assert.match(res.headers()['content-disposition'] ?? '', /RT-\d{2}-\d{3}-R0-/);
  const total = await pagesOf(await res.body());
  await page.reload();
  const kept = Number(/(\d+) pagin[ae] senza i documenti allegati/.exec(await page.textContent('dl.cartiglio'))?.[1] ?? NaN);
  assert.equal(total, kept + 3, `body ${kept} + PDF 2 + photo 1 = ${total}`);
  await page.goto(wsUrl);
  assert.equal(await page.locator(`.rt-emesse li[data-rt-id="${rtId}"]`).count(), 1, 'listed among the RTs issued');
  assert.equal((await page.request.get(`${BASE}/api/projects/${projectId}/relazione-tecnica/anteprima`)).status(), 200, 'a new draft starts from the RT issued');

  step('RT: revision R1 of the same number, with its note');
  await page.goto(rtUrl);
  await Promise.all([page.waitForURL(/\/relazione-tecnica\?revisione=/), page.click('.page-head a:has-text("Nuova revisione")')]);
  assert.match(await page.textContent('main .alert-info'), /revisione R1/);
  await hydrated(page, '#rt-rev');
  await page.fill('#rt-rev', 'Corretta la descrizione della modifica');
  await page.waitForFunction(() => /Bozza salvata/.test(globalThis.document.querySelector('.rt-bar .draft-bar')?.textContent ?? ''), null, { timeout: 20000 });
  const r1Url = await emetti(page, 'Emetti la revisione');
  assert.match(await page.textContent('h1'), new RegExp(`RT ${numero} R1$`), 'the same number, revision 1');
  assert.equal(await page.locator('main section[aria-labelledby="rt-p-rev"] li').count(), 2, 'R0 and R1');
  assert.equal((await page.goto(rtUrl)).status(), 200);
  assert.match(await page.textContent('main .alert-info'), /non è l’ultima revisione/);

  step('RT: the installation’s page lists it; the workspace fits a phone');
  await page.goto(wsUrl.replace(/\/relazione-tecnica$/, ''));
  assert.ok(await page.locator('.rt-emesse li').count() >= 2, 'the RTs on the installation’s page');
  await page.setViewportSize({ width: 360, height: 800 });
  for (const url of [wsUrl, r1Url]) {
    await page.goto(url);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= 360), `no horizontal scroll at 360 px: ${url}`);
  }
  await page.setViewportSize({ width: 1360, height: 900 });
  return { rtId, rtUrl, wsUrl, projectId };
}

/** The shaft path, on the Progetto of the main installation (its modernisation to UNI 10411-11). */
export async function rtVano({ page, hydrated, stamp, projectUrl }) {
  step('RT: the Progetto of an installation (the shaft path) — sections by rule with their clauses, issued');
  await page.goto(`${projectUrl}/relazione-tecnica`);
  assert.equal(await page.locator('[data-rt-base="vano"]').count(), 1, 'the shaft path: its base is the lift design');
  const motivi = page.locator('#rt-sezioni article.rt-sezione:has(.chip.rt-auto) .rt-motivi li');
  assert.ok(await motivi.count() > 0, 'automatic sections with their reasons');
  assert.ok(await page.locator('#rt-sezioni .rt-motivi .rt-clausola').count() > 0, 'each reason with its clause');
  // without the owner in the registry and its law confirmed the issue is blocked: the button waits for them
  await hydrated(page, '#rt-prop');
  assert.ok(await page.locator('#rt-firme .rt-issue button.btn-primary').isDisabled(), 'blocked without the owner');
  await page.fill('#rt-prop', 'Condominio Via Verdi 3');
  // a CE-marked lift: DPR 162/1999, derived, confirmed on the logbook
  assert.match(await page.textContent('#rt-legge option:first-child'), /DPR 162\/1999/);
  await page.check('#rt-legge-ok');
  await page.click('form.rt-anagrafica button[type="submit"]');
  await page.waitForSelector('form.rt-anagrafica .note:has-text("Anagrafica salvata.")');
  await compila(page, hydrated, `Ammodernamento dell’impianto esistente, prova ${stamp}: argano, quadro e parti indicate nel calcolo.`);
  await emetti(page, 'Emetti la relazione');
  assert.ok(await page.locator('main section[aria-labelledby="rt-p-sezioni"] li').count() > 0, 'its sections on the RT’s page');
}

/** A «Trasformazione completa» has the new lift's documents, not a relazione tecnica di modifica: said in words. */
export async function rtTrasformazione({ page, projectUrl }) {
  step('RT: a «Trasformazione completa» says why it has no relazione tecnica di modifica');
  await page.goto(`${projectUrl}/relazione-tecnica`);
  assert.equal(await page.locator('[data-rt-motivo="trasformazione"]').count(), 1);
  assert.match(await page.textContent('[data-rt-motivo]'), /ascensore nuovo/);
  assert.equal(await page.locator('[data-rt="workspace"]').count(), 0, 'no workspace');
}
