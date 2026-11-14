// Quotes going out and around (point C1): the email to the customer with the PDF/A (the address is not kept;
// a sent email turns a draft into "Inviato"), the company's price list (unique code, Italian amounts, the
// JSON for the form only for those who write quotes there), and the export and deletion of the company —
// quotes and list always exported, also with quotes off.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eliminaAzienda } from '../../src/aziende/eliminazione.js';
import { esportaAzienda } from '../../src/aziende/esportazione.js';
import { registraInvio } from '../../src/preventivi/service.js';
import { makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';
import { crea, RIGHE } from './preventivi-dati.js';
import { readTar } from './tar.js';

before(startApp);
after(stopApp);

describe('quotes going out', () => {
  it('goes to the customer by email with the PDF; the address is not kept', async () => {
    const azienda = await makeAzienda('Preventivi Email');
    await prisma.azienda.update({ where: { id: azienda.id }, data: { preventiviAttivi: true } });
    const { browser, user } = await signedIn('ADMIN', azienda.id);
    const id = await crea(browser, { ...RIGHE, azienda: azienda.id });
    outbox.length = 0;
    const sent = await browser.submit(`/preventivi/${id}`, `/preventivi/${id}/invia`, {
      email: 'cliente@example.it',
      messaggio: 'Restiamo a disposizione.',
    });
    assert.equal(sent.status, 303);
    const mail = outbox.find((m) => m.to === 'cliente@example.it');
    assert.ok(mail);
    assert.equal(mail.replyTo, user.email);
    assert.match(mail.text, /Restiamo a disposizione\./);
    assert.equal(mail.attachments?.[0]?.filename, 'preventivo-1.pdf');
    // Without SMTP (tests) nothing left: the draft stays a draft and the page says why.
    assert.equal(mail.result, 'disabled');
    assert.equal((await prisma.preventivo.findUniqueOrThrow({ where: { id } })).stato, 'BOZZA');
    // What a sent email records: the draft becomes "Inviato", the audit without the address.
    await registraInvio(user.id, azienda.id, id);
    assert.equal((await prisma.preventivo.findUniqueOrThrow({ where: { id } })).stato, 'INVIATO');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PREVENTIVO_EMAIL', targetId: id },
    });
    assert.doesNotMatch(JSON.stringify(audit.meta), /cliente@example/);
  });

  it('keeps a price list; export and deletion carry quotes and list', async () => {
    const azienda = await makeAzienda('Preventivi Listino');
    await prisma.azienda.update({ where: { id: azienda.id }, data: { preventiviAttivi: true } });
    const { browser, user } = await signedIn('ADMIN', azienda.id);
    const page = `/preventivi/listino?azienda=${azienda.id}`;
    const add = (form: Record<string, string>) =>
      browser.submit(page, '/preventivi/listino', { azienda: azienda.id, ...form });
    assert.equal(
      (
        await add({
          codice: 'QM-01',
          descrizione: 'Quadro VVVF',
          unita: 'pz',
          prezzo: '4850',
          iva: '10',
        })
      ).status,
      303,
    );
    assert.equal(
      (await add({ codice: 'QM-01', descrizione: 'Doppio', unita: 'pz', prezzo: '1', iva: '22' }))
        .status,
      422,
    );
    assert.equal(
      (await add({ codice: '', descrizione: 'Manodopera', unita: 'h', prezzo: '1,234', iva: '22' }))
        .status,
      422,
    );
    const json = await browser.get(`/preventivi/listino.json?azienda=${azienda.id}`);
    const data = JSON.parse(json.body) as {
      voci: Array<{ codice: string; prezzo: string; iva: string }>;
    };
    assert.deepEqual(
      data.voci.map((v) => [v.codice, v.prezzo, v.iva]),
      [['QM-01', '4850,00', '10']],
    );
    const { browser: estraneo } = await signedIn('ADMIN', (await makeAzienda('Fuori')).id);
    assert.equal(
      (await estraneo.get(`/preventivi/listino.json?azienda=${azienda.id}`)).status,
      403,
    );

    const id = await crea(browser, { ...RIGHE, azienda: azienda.id });
    // Off: export still carries everything.
    await prisma.azienda.update({ where: { id: azienda.id }, data: { preventiviAttivi: false } });
    const esportazione = await esportaAzienda(azienda.id, { id: user.id, master: false });
    assert.ok(esportazione);
    const chunks: Buffer[] = [];
    for await (const chunk of esportazione.stream) chunks.push(Buffer.from(chunk as Uint8Array));
    const entries = readTar(Buffer.concat(chunks));
    const dati = JSON.parse(
      [...entries].find(([n]) => n.endsWith('/dati.json'))![1].toString('utf8'),
    ) as {
      preventivi: Array<{ id: string; totale: number }>;
      listino: Array<{ codice: string }>;
    };
    assert.equal(dati.preventivi[0]!.id, id);
    assert.equal(dati.listino[0]!.codice, 'QM-01');
    assert.ok(
      [...entries.keys()].some((n) => n.endsWith('/documenti/preventivi/preventivo-1.pdf')),
    );

    await prisma.azienda.update({ where: { id: azienda.id }, data: { deactivatedAt: new Date() } });
    assert.equal(await eliminaAzienda(azienda.id, null), true);
    assert.equal(await prisma.preventivo.count({ where: { aziendaId: azienda.id } }), 0);
    assert.equal(await prisma.voceListino.count({ where: { aziendaId: azienda.id } }), 0);
  });
});
