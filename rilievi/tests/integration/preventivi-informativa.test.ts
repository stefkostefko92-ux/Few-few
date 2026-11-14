// What the customer reads at the end of a quote, and which quotes can be deleted (the owner, 14 November
// 2026 — "направи го както трябва да бъде по най-добрия начин"; the texts by Правният Разбирач). Acceptance
// criteria:
//  - every quote PDF ends with the company's notice to its customers and their contact persons (GDPR art.
//    13 and 14): the model filled with the company's data, or the company's own text from the settings
//    («Preventivi»); «Torna al modello» brings the model back; the audit never carries the text; the export
//    carries the company's text;
//  - a quote that was not accepted (draft, sent, refused) can be deleted — the people it names can ask for
//    it, and a quote that was not accepted is not a contract document; an accepted one is never deleted in
//    the portal; the audit keeps the number.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { esportaAzienda } from '../../src/aziende/esportazione.js';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { accendi, crea, RIGHE } from './preventivi-dati.js';
import { readTar } from './tar.js';

before(startApp);
after(stopApp);

/** The words of the PDF, on one line each run of spaces; null without poppler. */
function testoDel(pdf: Buffer): string | null {
  const out = spawnSync('pdftotext', ['-', '-'], { input: pdf });
  if (out.error !== undefined) return null;
  return out.stdout.toString('utf8').replace(/\s+/g, ' ');
}

describe('the notice at the end of a quote', () => {
  it('prints the model, then the text of the company, and the export carries it', async () => {
    const azienda = await makeAzienda('Informativa Preventivi');
    const { browser: master } = await signedIn('MASTER');
    await accendi(master, azienda.id, true);
    const { browser, user } = await signedIn('ADMIN', azienda.id);
    const sezione = `/impostazioni/preventivi?azienda=${azienda.id}`;

    const pagina = await browser.get(sezione);
    assert.match(pagina.body, /action="\/impostazioni\/preventivi\/informativa"/);
    assert.match(pagina.body, /Titolare del trattamento: Informativa Preventivi/);

    const id = await crea(browser, RIGHE);
    const modello = testoDel((await browser.get(`/preventivi/${id}/pdf`)).bytes);
    if (modello !== null) {
      assert.match(modello, /Informativa sul trattamento dei dati personali/);
      assert.match(modello, /Titolare del trattamento: Informativa Preventivi/);
    }

    const salvata = await browser.submit(sezione, '/impostazioni/preventivi/informativa', {
      azienda: azienda.id,
      testo: 'I dati dei clienti li tratta Informativa Preventivi: scrivete a privacy@esempio.it.',
    });
    assert.equal(salvata.status, 303);
    assert.equal(salvata.location, sezione);
    const riga = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.match(riga.informativaPreventivi ?? '', /privacy@esempio\.it/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'AZIENDA_INFORMATIVA', aziendaId: azienda.id },
      orderBy: { at: 'desc' },
    });
    assert.deepEqual(audit.meta, { modello: false, documento: 'preventivi' });
    const propria = testoDel((await browser.get(`/preventivi/${id}/pdf`)).bytes);
    if (propria !== null) {
      assert.match(propria, /scrivete a privacy@esempio\.it/);
      assert.doesNotMatch(propria, /Titolare del trattamento/);
    }
    // The signers' notice is another text: untouched.
    assert.equal(riga.informativaFirme, null);

    // Empty: refused, what was typed stays.
    const vuota = await browser.submit(sezione, '/impostazioni/preventivi/informativa', {
      azienda: azienda.id,
      testo: '   ',
    });
    assert.equal(vuota.status, 422);
    assert.match(vuota.body, /id="err-prev-informativa"/);

    const esportazione = await esportaAzienda(azienda.id, { id: user.id, master: false });
    assert.ok(esportazione);
    const chunks: Buffer[] = [];
    for await (const chunk of esportazione.stream) chunks.push(Buffer.from(chunk as Uint8Array));
    const dati = JSON.parse(
      [...readTar(Buffer.concat(chunks))].find(([n]) => n.endsWith('/dati.json'))![1].toString(),
    ) as { azienda: { informativaPreventivi: string | null } };
    assert.match(dati.azienda.informativaPreventivi ?? '', /privacy@esempio\.it/);

    const modelloDiNuovo = await browser.submit(sezione, '/impostazioni/preventivi/informativa', {
      azienda: azienda.id,
      azione: 'ripristina',
    });
    assert.equal(modelloDiNuovo.status, 303);
    assert.equal(
      (await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } })).informativaPreventivi,
      null,
    );
    // Only who manages the settings of the company.
    const { browser: resp } = await signedIn('RESPONSABILE', azienda.id);
    assert.equal((await resp.get(sezione)).status, 403);
  });
});

describe('deleting a quote', () => {
  it('deletes what was not accepted, never an accepted one', async () => {
    const azienda = await makeAzienda('Elimina Preventivi');
    const { browser: master } = await signedIn('MASTER');
    await accendi(master, azienda.id, true);
    const { browser } = await signedIn('RESPONSABILE', azienda.id);
    for (const stato of ['INVIATO', 'RIFIUTATO'] as const) {
      const id = await crea(browser, RIGHE);
      await prisma.preventivo.update({ where: { id }, data: { stato } });
      const pagina = await browser.get(`/preventivi/${id}`);
      assert.match(pagina.body, new RegExp(`action="/preventivi/${id}/elimina"`), stato);
      const tolta = await browser.submit(`/preventivi/${id}`, `/preventivi/${id}/elimina`, {});
      assert.equal(tolta.status, 303, stato);
      assert.equal(await prisma.preventivo.count({ where: { id } }), 0, stato);
      assert.equal(
        await prisma.auditLog.count({ where: { action: 'PREVENTIVO_DELETE', targetId: id } }),
        1,
      );
    }
    const accettato = await crea(browser, RIGHE);
    await prisma.preventivo.update({ where: { id: accettato }, data: { stato: 'ACCETTATO' } });
    assert.doesNotMatch(
      (await browser.get(`/preventivi/${accettato}`)).body,
      new RegExp(`action="/preventivi/${accettato}/elimina"`),
    );
    const csrf = await browser.csrf(`/preventivi/${accettato}`);
    const rifiuto = await browser.post(`/preventivi/${accettato}/elimina`, { _csrf: csrf });
    assert.equal(rifiuto.status, 303);
    assert.equal(await prisma.preventivo.count({ where: { id: accettato } }), 1);
  });
});
