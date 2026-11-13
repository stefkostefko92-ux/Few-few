// The signature page and the signer's copy (owner, 12 November 2026 — point D4): above the signatures the
// company's notice under GDPR art. 13 (its own text, or the model filled with its data); an optional email
// at which the confirmed document leaves at once. A wrong address confirms nothing; the address is not kept.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';
import { create, firma, firmeNuove, FORM } from './interventi-helpers.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };

describe('the notice and the copy for the signer', () => {
  it('shows the model filled with the company data, then the text the company writes', async () => {
    const azienda = await makeAzienda('Firme Ascensori');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const id = await create(admin, FORM);
    const pagina = await admin.get(`/interventi/${id}/firma`, HTML);
    assert.match(pagina.body, /Informativa sul trattamento dei dati personali/);
    assert.match(pagina.body, /Titolare del trattamento: Firme Ascensori\./);

    const impostazioni = `/impostazioni/firme?azienda=${azienda.id}`;
    const vuoto = await admin.submit(impostazioni, '/impostazioni/informativa', {
      azienda: azienda.id,
      testo: '   ',
      azione: 'salva',
    });
    assert.equal(vuoto.status, 422);
    await admin.submit(impostazioni, '/impostazioni/informativa', {
      azienda: azienda.id,
      testo: 'Titolare: Firme Ascensori S.r.l.\nContatto: privacy@firme.it',
      azione: 'salva',
    });
    assert.match((await admin.get(`/interventi/${id}/firma`)).body, /privacy@firme\.it/);
    await admin.submit(impostazioni, '/impostazioni/informativa', {
      azienda: azienda.id,
      azione: 'ripristina',
    });
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).informativaFirme,
      null,
    );
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const _csrf = await tecnico.csrf('/account');
    const vietato = await tecnico.post('/impostazioni/informativa', {
      _csrf,
      azienda: azienda.id,
      testo: 'x',
    });
    assert.equal(vietato.status, 403);
  });

  it('refuses a wrong address without confirming, and sends the PDF/A to a good one', async () => {
    const azienda = await makeAzienda('Copia Ascensori');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await create(browser, FORM);
    const sbagliata = await firma(browser, id, {
      ...firmeNuove(),
      copiaEmail: 'non-una-email',
    });
    assert.equal(sbagliata.status, 422);
    assert.match(sbagliata.body, /Scrivi un indirizzo email valido/);
    assert.equal((await prisma.intervento.findUniqueOrThrow({ where: { id } })).confermatoAt, null);

    const prima = outbox.length;
    const ok = await firma(browser, id, {
      ...firmeNuove(),
      copiaEmail: 'cliente@esempio.it',
    });
    assert.equal(ok.status, 303);
    assert.ok((await prisma.intervento.findUniqueOrThrow({ where: { id } })).confermatoAt);
    const mail = outbox.slice(prima).find((m) => m.to === 'cliente@esempio.it');
    assert.ok(mail, 'the copy leaves');
    assert.equal(mail.attachments?.length, 1);
    assert.equal(mail.attachments?.[0]?.contentType, 'application/pdf');
    // No SMTP in the tests: the message is the one that would leave; the log records only real sends.
    assert.equal(mail.result, 'disabled');
    const log = await prisma.auditLog.findMany({ where: { targetId: id } });
    assert.ok(!JSON.stringify(log).includes('cliente@esempio.it'), 'the address is not kept');
  });

  it('sends both copies of a closing report to its signer', async () => {
    const azienda = await makeAzienda('Verbali Copia');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const nuovo = await browser.submit('/verbali/nuovo', '/verbali', {
      data: '2026-11-05',
      indirizzo: 'Via Monte Santo 8',
      buono: 'BL 2026/118',
      't-quadro': 'Quadro nuovo installato',
      'c-quadro': 'si',
      positivo: 'si',
    });
    assert.equal(nuovo.status, 303);
    const id = nuovo.location.split('/').pop()!;
    const page = await browser.get(`/verbali/${id}/firma`, HTML);
    assert.match(page.body, /Titolare del trattamento: Verbali Copia\./);
    const f = firmeNuove();
    const prima = outbox.length;
    const ok = await browser.submit(`/verbali/${id}/firma`, `/verbali/${id}/conferma`, {
      base: /name="base" value="([^"]+)"/.exec(page.body)![1]!,
      impronta: /name="impronta" value="([0-9a-f]{64})"/.exec(page.body)![1]!,
      firmaTecnico: f.firmaTecnico!,
      firmaTecnicoNome: 'Mario Rossi',
      firmaSupervisore: f.firmaCliente!,
      firmaSupervisoreNome: 'Anna Bianchi',
      copiaEmail: 'supervisore@esempio.it',
    });
    assert.equal(ok.status, 303);
    const mail = outbox.slice(prima).find((m) => m.to === 'supervisore@esempio.it');
    assert.ok(mail);
    assert.deepEqual(
      mail.attachments?.map((a) => a.filename.replace(/^.*copia-/, '')),
      ['azienda.pdf', 'installatore.pdf'],
    );
  });
});
