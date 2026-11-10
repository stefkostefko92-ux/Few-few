// The intervention forms against the real app (the owner, 30 October 2026): a number per company from 1,
// and once signed and confirmed nothing changes any more — only the PDF and the email. Signing itself and
// the seal: interventi-firma.test.ts. Also the new side bar with its groups.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { improntaLeggibile } from '../../src/interventi/sigillo.js';
import { makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';
import { create, firma, FORM } from './interventi-helpers.js';

before(startApp);
after(stopApp);

describe('the intervention forms', () => {
  it('number each company from 1, without gaps, whoever writes', async () => {
    const [a, b] = [await makeAzienda(), await makeAzienda()];
    const tecnicoA = await signedIn('TECNICO', a.id);
    const altroA = await signedIn('OPERATORE', a.id);
    const tecnicoB = await signedIn('TECNICO', b.id);
    const ids = await Promise.all([
      create(tecnicoA.browser, FORM),
      create(altroA.browser, FORM),
      create(tecnicoB.browser, FORM),
    ]);
    const rows = await prisma.intervento.findMany({ where: { id: { in: ids } } });
    const numeri = (aziendaId: string) =>
      rows
        .filter((r) => r.aziendaId === aziendaId)
        .map((r) => r.numero)
        .sort();
    assert.deepEqual(numeri(a.id), [1, 2]);
    assert.deepEqual(numeri(b.id), [1]);
    const row = rows.find((r) => r.id === ids[2])!;
    assert.deepEqual(row.voci, {
      '05': { x: true, q: '2' },
      '84': { x: true, q: 'piano 3', c: ['P'] },
    });
    assert.equal(String(row.oreTecnico), '1.5');
    const page = await tecnicoB.browser.get(`/interventi/${ids[2]}`);
    assert.match(
      page.body,
      /Modulo di pronto intervento <span class="intervento__num">n\. 000001<\/span>/,
    );
    const list = await tecnicoA.browser.get('/interventi');
    assert.match(list.body, />000002<\/a>/);
    assert.doesNotMatch(list.body, new RegExp(ids[2]!), 'the other company is not listed');
  });

  it('after the confirmation: no change by any way — only the PDF and the email', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, FORM);
    const draftPdf = await browser.get(`/interventi/${id}/pdf`);
    assert.equal(draftPdf.status, 404, 'a draft has no PDF');
    assert.equal((await firma(browser, id)).status, 303);
    const row = await prisma.intervento.findUniqueOrThrow({ where: { id } });
    assert.ok(row.confermatoAt);
    const file = `modulo-intervento-${String(row.numero).padStart(6, '0')}-2026-10-30.pdf`;

    const page = await browser.get(`/interventi/${id}`);
    assert.match(page.body, /Modulo firmato e confermato: non si può più modificare\./);
    assert.match(page.body, /Sigillo verificato: il contenuto è quello firmato\./);
    assert.match(page.body, new RegExp(improntaLeggibile(row.impronta!)));
    assert.doesNotMatch(page.body, new RegExp(`href="/interventi/${id}/modifica"`));
    assert.match(page.body, new RegExp(`href="/interventi/${id}/pdf"`));
    assert.match(page.body, /Firmato e confermato il \d{2}\/\d{2}\/\d{4}/);
    const edit = await browser.get(`/interventi/${id}/modifica`);
    assert.equal(edit.status, 303, 'the edit page sends back to the form');
    // A save sent anyway (an old tab) changes nothing.
    const csrf = await browser.csrf(`/interventi/${id}`);
    const forged = await browser.post(`/interventi/${id}`, {
      _csrf: csrf,
      ...FORM,
      citta: 'Altrove',
      base: row.updatedAt.toISOString(),
    });
    assert.equal(forged.status, 303);
    const after = await prisma.intervento.findUniqueOrThrow({ where: { id } });
    assert.equal(after.citta, 'Milano');
    assert.equal(after.updatedAt.getTime(), row.updatedAt.getTime());

    const pdf = await browser.get(`/interventi/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.ok((pdf.headers.get('content-disposition') ?? '').includes(`filename="${file}"`));
    assert.equal((await PDFDocument.load(pdf.bytes)).getPageCount(), 1);

    const before = outbox.length;
    const bad = await browser.submit(`/interventi/${id}`, `/interventi/${id}/invia`, {
      email: 'non-un-indirizzo',
    });
    assert.equal(bad.status, 303);
    assert.equal(outbox.length, before, 'no email to a wrong address');
    const sent = await browser.submit(`/interventi/${id}`, `/interventi/${id}/invia`, {
      email: 'cliente@esempio.test',
    });
    assert.equal(sent.status, 303);
    const mail = outbox.at(-1)!;
    assert.equal(mail.to, 'cliente@esempio.test');
    assert.match(mail.subject, /^Modulo di pronto intervento n\. \d{6} — /);
    assert.equal(mail.attachments?.[0]?.filename, file);
    assert.equal(mail.attachments?.[0]?.contentType, 'application/pdf');
    // Here the server has no SMTP: the page says so instead of "sent".
    assert.match(
      (await browser.get(`/interventi/${id}`)).body,
      /L&#39;invio di email non è configurato/,
    );

    const audit = await prisma.auditLog.findMany({
      where: { targetId: id },
      orderBy: { at: 'asc' },
    });
    assert.deepEqual(
      audit.map((a) => a.action),
      ['INTERVENTO_CREATE', 'INTERVENTO_CONFIRM'],
    );
  });

  it('keeps each company to itself; a customer reads but does not write or send', async () => {
    const { browser, user } = await signedIn('TECNICO');
    const id = await create(browser, FORM);
    assert.equal((await firma(browser, id)).status, 303);
    const stranger = (await signedIn('ADMIN', (await makeAzienda()).id)).browser;
    for (const path of [
      `/interventi/${id}`,
      `/interventi/${id}/pdf`,
      `/interventi/${id}/modifica`,
      `/interventi/${id}/firma`,
    ]) {
      assert.equal((await stranger.get(path)).status, 404, path);
    }
    const cliente = (await signedIn('CLIENTE', user.aziendaId!)).browser;
    const page = await cliente.get(`/interventi/${id}`);
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.body, /\/invia"/);
    assert.equal((await cliente.get('/interventi/nuovo')).status, 403);
    assert.equal((await cliente.get(`/interventi/${id}/pdf`)).status, 200);
    const draft = await create(browser, FORM);
    assert.equal((await cliente.get(`/interventi/${draft}/firma`)).status, 403);
  });
});

describe('the side bar', () => {
  it('groups the pages: Rilievi, Assistenza elevatori, Amministrazione — by what each one may do', async () => {
    const admin = (await signedIn('ADMIN')).browser;
    const page = (await admin.get('/interventi/nuovo')).body;
    assert.match(page, /<body class="with-nav">/);
    assert.match(page, /aria-controls="sidenav" aria-expanded="false" data-nav-open>/);
    const groups = [...page.matchAll(/<p class="sidenav__group" id="nav-(\w+)">/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(groups, ['rilievi', 'assistenza', 'amministrazione']);
    // The deepest page is the current one: "Nuovo intervento", not "Interventi".
    assert.match(page, /<a href="\/interventi\/nuovo" aria-current="page">/);
    assert.doesNotMatch(page, /<a href="\/interventi" aria-current="page">/);
    const cliente = (await signedIn('CLIENTE')).browser;
    const own = (await cliente.get('/interventi')).body;
    assert.deepEqual(
      [...own.matchAll(/<p class="sidenav__group" id="nav-(\w+)">/g)].map((m) => m[1]),
      ['rilievi', 'assistenza'],
    );
    assert.doesNotMatch(own, /href="\/interventi\/nuovo"/);
    assert.doesNotMatch(own, /href="\/schede\/nuova"/);
  });
});
