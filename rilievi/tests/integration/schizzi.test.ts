import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { newScheda } from './media.js';

before(startApp);
after(stopApp);

/** A sheet of the sketch pad with black thin paths, as the form sends it. */
const foglio = (...paths: string[]) =>
  JSON.stringify({ e: paths.map((d) => ({ t: 'p', c: 'k', s: 1, d })) });
const VUOTO = '{"e":[]}';

/** Saves the sheet with the minimum it needs and `form` on top (the page's own `base`). */
async function salva(browser: Browser, id: string, form: Record<string, string | string[]>) {
  const edit = await browser.get(`/schede/${id}/modifica`);
  const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
  return browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
    base,
    data: '2026-10-22',
    indirizzo: 'Via Roma 1, Milano',
    matricola: '0012345',
    ...form,
  });
}

/** The sheets in the database, in order (JSONB keeps its own key order: compared as values). */
const fogli = async (schedaId: string) =>
  (await prisma.schizzo.findMany({ where: { schedaId }, orderBy: { ordine: 'asc' } })).map(
    (row) => row.elementi,
  );
const valori = (...sheets: string[]) => sheets.map((sheet) => JSON.parse(sheet) as unknown);
const conSchizzi = (aziendaId: string, schizzi: boolean) =>
  prisma.azienda.update({ where: { id: aziendaId }, data: { schizzi } });

describe('the sketch pad', () => {
  it('is turned on and off for a company by the MASTER only, in the log', async () => {
    const { browser: master } = await signedIn('MASTER');
    const azienda = await makeAzienda();
    const page = `/aziende/${azienda.id}`;
    assert.match((await master.get(page)).body, /Attiva gli schizzi/);
    const on = await master.submit(page, `${page}/schizzi`, { attivi: '1' });
    assert.equal(on.status, 303);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).schizzi,
      true,
    );
    assert.match((await master.get(page)).body, /Disattiva gli schizzi/);
    assert.equal((await master.submit(page, `${page}/schizzi`, { attivi: '0' })).status, 303);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).schizzi,
      false,
    );
    const log = await prisma.auditLog.findMany({
      where: { aziendaId: azienda.id, action: { startsWith: 'AZIENDA_SCHIZZI' } },
      orderBy: { at: 'asc' },
    });
    assert.deepEqual(
      log.map((row) => row.action),
      ['AZIENDA_SCHIZZI_ON', 'AZIENDA_SCHIZZI_OFF'],
    );

    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const denied = await admin.submit('/account', `${page}/schizzi`, { attivi: '1' });
    assert.equal(denied.status, 403);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).schizzi,
      false,
    );
  });

  it('saves the sheets with the sheet, shows, prints and puts them in the PDF', async () => {
    const { browser, user } = await signedIn('TECNICO', (await makeAzienda()).id);
    const id = await newScheda(browser);
    // A company without the sketch pad: no block, the sheets sent are not taken.
    assert.doesNotMatch((await browser.get(`/schede/${id}/modifica`)).body, /id="s-schizzi"/);
    const ignored = await salva(browser, id, { 'schizzi-_': '1', schizzo: foglio('M10 10l5 5') });
    assert.equal(ignored.status, 303);
    assert.deepEqual(await fogli(id), []);

    await conSchizzi(user.aziendaId!, true);
    const form = (await browser.get(`/schede/${id}/modifica`)).body;
    assert.match(form, /id="s-schizzi"/);
    assert.match(form, /name="schizziStampati" value="1" checked/);
    const pdfPages = async () =>
      (await PDFDocument.load((await browser.get(`/schede/${id}/pdf`)).bytes)).getPageCount();
    const plain = await pdfPages();
    const primo = foglio('M10 10l5 5');
    const secondo = foglio('M100 100l200 0l0 100l-200 0z');
    const saved = await salva(browser, id, {
      'schizzi-_': '1',
      schizzo: [primo, VUOTO, secondo],
      'schizziStampati-_': '1',
      schizziStampati: '1',
    });
    assert.equal(saved.status, 303);
    assert.deepEqual(await fogli(id), valori(primo, secondo), 'in order, the empty sheet dropped');

    const print = (await browser.get(`/schede/${id}/stampa`)).body;
    assert.equal((print.match(/class="paper__schizzo"/g) ?? []).length, 2);
    assert.match(print, /<path d="M100 100l200 0l0 100l-200 0z" stroke="#000000"/);
    assert.ok((await pdfPages()) > plain, 'the PDF has the sketches');
    assert.match((await browser.get(`/schede/${id}`)).body, /id="s-schizzi"/);
    assert.ok(
      (await browser.get(`/schede/${id}/modifica`)).body.includes('M100 100l200 0l0 100l-200 0z'),
    );

    // The print tick off: neither the print nor the PDF has them; the sheets stay.
    assert.equal((await salva(browser, id, { 'schizziStampati-_': '1' })).status, 303);
    assert.doesNotMatch((await browser.get(`/schede/${id}/stampa`)).body, /paper__schizzi/);
    assert.equal(await pdfPages(), plain);
    assert.equal((await fogli(id)).length, 2);

    // The company turned off: the field goes, what was drawn stays and prints; sent sheets are ignored.
    await conSchizzi(user.aziendaId!, false);
    const spento = (await browser.get(`/schede/${id}/modifica`)).body;
    assert.doesNotMatch(spento, /id="s-schizzi"/);
    assert.match(spento, /id="f-schizziStampati"/, 'the print tick stays while there are sheets');
    const ripresa = await salva(browser, id, {
      'schizzi-_': '1',
      schizzo: VUOTO,
      'schizziStampati-_': '1',
      schizziStampati: '1',
    });
    assert.equal(ripresa.status, 303);
    assert.deepEqual(await fogli(id), valori(primo, secondo));
    assert.equal(
      ((await browser.get(`/schede/${id}/stampa`)).body.match(/class="paper__schizzo"/g) ?? [])
        .length,
      2,
    );
  });

  it('refuses a tampered sheet, leaves the sheets alone from an old page, keeps them on a conflict', async () => {
    const { browser, user } = await signedIn('TECNICO', (await makeAzienda()).id);
    await conSchizzi(user.aziendaId!, true);
    const id = await newScheda(browser);
    const mio = foglio('M10 10l5 5');
    assert.equal((await salva(browser, id, { 'schizzi-_': '1', schizzo: mio })).status, 303);

    const bad = await salva(browser, id, {
      'schizzi-_': '1',
      schizzo: '{"e":[{"t":"p","c":"k","s":1,"d":"M1 1L2 2"}]}',
    });
    assert.equal(bad.status, 422);
    assert.match(bad.body, /id="err-schizzo"/);
    assert.deepEqual(await fogli(id), valori(mio), 'nothing changed');

    assert.equal((await salva(browser, id, {})).status, 303);
    assert.deepEqual(await fogli(id), valori(mio), 'a page without the block leaves them alone');

    // A stale page: a colleague saves meanwhile; the conflict brings back what was drawn here.
    const stale = /name="base" value="([^"]+)"/.exec(
      (await browser.get(`/schede/${id}/modifica`)).body,
    )![1]!;
    const colleague = (await signedIn('TECNICO', user.aziendaId!)).browser;
    const loro = foglio('M300 300l10 10');
    assert.equal((await salva(colleague, id, { 'schizzi-_': '1', schizzo: loro })).status, 303);
    const nostro = foglio('M600 600l20 20');
    const back = await salva(browser, id, { base: stale, 'schizzi-_': '1', schizzo: nostro });
    assert.equal(back.status, 409);
    assert.ok(back.body.includes('M600 600l20 20'), 'the drawing stays on screen');
    assert.deepEqual(await fogli(id), valori(loro), 'the conflict saved nothing');
  });

  it('takes the sheets of a new sheet only in a company that has the sketch pad', async () => {
    const nuova = async (browser: Browser) => {
      const reply = await browser.submit('/schede/nuova', '/schede', {
        data: '2026-10-22',
        indirizzo: 'Via Roma 1, Milano',
        matricola: '0012345',
        'schizzi-_': '1',
        schizzo: foglio('M10 10l5 5'),
      });
      assert.equal(reply.status, 303);
      return /^\/schede\/([a-z0-9]+)$/.exec(reply.location)![1]!;
    };
    const { browser, user } = await signedIn('TECNICO', (await makeAzienda()).id);
    assert.doesNotMatch((await browser.get('/schede/nuova')).body, /id="s-schizzi"/);
    assert.deepEqual(await fogli(await nuova(browser)), []);
    await conSchizzi(user.aziendaId!, true);
    assert.match((await browser.get('/schede/nuova')).body, /id="s-schizzi"/);
    assert.equal((await fogli(await nuova(browser))).length, 1);
  });

  it('takes a large drawing on the sheet form, and only there and signed in', async () => {
    const { browser, user } = await signedIn('TECNICO', (await makeAzienda()).id);
    await conSchizzi(user.aziendaId!, true);
    const id = await newScheda(browser);
    // Eight sheets of ~180 KB each: ~1.4 MB, over the 1 MB of every other form.
    const pieno = foglio(...Array.from({ length: 9 }, () => `M0 0${'l1 1'.repeat(4000)}`));
    const grande = Array.from({ length: 8 }, () => pieno);
    assert.equal((await salva(browser, id, { 'schizzi-_': '1', schizzo: grande })).status, 303);
    assert.equal((await fogli(id)).length, 8);
    const altrove = await browser.submit('/account', '/account', { name: 'x'.repeat(1_200_000) });
    assert.equal(altrove.status, 413);
    // Without a session the sheet form takes no more than any other.
    assert.equal((await new Browser().post('/schede', { schizzo: grande })).status, 413);
    assert.equal((await new Browser().post(`/schede/${id}`, { schizzo: grande })).status, 413);
  });
});
