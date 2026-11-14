// The companies that existed when 4.1 went in stay active without a new signature (the owner, 12 November 2026:
// the signature needs a code by email and the mail of the portal is down): the migration marks them with the
// last version of the terms, 2026-11-14, a day before it comes into force. Acceptance criteria:
//  - a company whose accepted version is the one in force OR a later one of the history is not asked to accept;
//  - a company on an older version is asked, as before;
//  - "Richiedi la firma" works at once, also the day before the company's version comes into force (the owner,
//    13 November 2026: "se chiedo di firmare non succede niente" — 4.1 refused until that day): the
//    administrator signs that version, once, and is not asked again when its day comes.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { hashTesto, leggiTesto } from '../../src/legale/testi.js';
import { condizioniValide, STORIA, versioneDaFirmare } from '../../src/legale/versioni.js';
import { makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };
const ULTIMA = STORIA.CONDIZIONI.at(-1)!;
const ACCETTA = '/condizioni/accetta';
const FIRMA = '/condizioni/firma';

describe('the companies marked with the last version of the terms', () => {
  it('use the portal without being asked, before and after the version comes into force', async () => {
    const a = await makeAzienda('Esistente Srl');
    await prisma.azienda.update({ where: { id: a.id }, data: { condizioniVersione: ULTIMA } });
    for (const ruolo of ['ADMIN', 'TECNICO'] as const) {
      const { browser } = await signedIn(ruolo, a.id);
      const pagina = await browser.get('/schede', HTML);
      assert.equal(pagina.status, 200, `${ruolo}: ${pagina.location ?? ''}`);
    }
    // An older version is not an acceptance of the terms in force.
    const vecchia = await makeAzienda('Vecchia Srl');
    await prisma.azienda.update({
      where: { id: vecchia.id },
      data: { condizioniVersione: STORIA.CONDIZIONI[0]! },
    });
    const { browser } = await signedIn('ADMIN', vecchia.id);
    const chiusa = await browser.get('/schede', HTML);
    assert.equal(chiusa.status, 303);
    assert.match(chiusa.location ?? '', /^\/condizioni\/accetta/);
  });

  it('are asked for the real signature at once, and their administrator signs that version once', async () => {
    assert.equal(versioneDaFirmare('CONDIZIONI'), ULTIMA, 'the last version enters by itself');
    const a = await makeAzienda('Da Firmare Srl');
    await prisma.azienda.update({ where: { id: a.id }, data: { condizioniVersione: ULTIMA } });
    const { browser: master } = await signedIn('MASTER');
    const contratti = await master.get('/master/contratti', HTML);
    assert.equal(contratti.status, 200);
    assert.ok(contratti.body.includes(`action="/master/contratti/${a.id}/richiedi"`));
    const esito = await master.submit(
      '/master/contratti',
      `/master/contratti/${a.id}/richiedi`,
      {},
    );
    assert.equal(esito.status, 303);
    assert.match((await master.get('/master/contratti', HTML)).body, /Firma richiesta/);
    const chiesta = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(chiesta.condizioniVersione, null);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CONDIZIONI_RICHIESTE', aziendaId: a.id },
    });
    assert.deepEqual(audit.meta, { versione: ULTIMA });

    // The administrator: the gate, the terms in the version to sign (and where to read exactly that text).
    const { browser: admin, user } = await signedIn('ADMIN', a.id);
    const porta = await admin.get('/schede', HTML);
    assert.match(porta.location ?? '', /^\/condizioni\/accetta/);
    const pagina = await admin.get(`${ACCETTA}?next=%2Fschede`, HTML);
    assert.ok(pagina.body.includes(`name="versioneCondizioni" value="${ULTIMA}"`));
    const leggi = /href="(\/condizioni(?:\/prossima)?)" target="_blank"/.exec(pagina.body)?.[1];
    assert.ok(leggi, 'a link to the text');
    const testo = await admin.get(leggi, HTML);
    assert.equal(testo.status, 200);
    // Exactly that text: the page carries its fingerprint.
    assert.ok(
      testo.body.includes(hashTesto(leggiTesto('CONDIZIONI', ULTIMA))),
      'the text of the version to sign',
    );
    // And the PDF to keep before accepting is of that same version, not of the one of the last day.
    const pdfPath = /href="(\/condizioni[^"]*\.pdf)"/.exec(testo.body)?.[1];
    assert.ok(pdfPath, 'a PDF to save');
    const pdf = await admin.get(pdfPath);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(
      pdf.headers.get('content-disposition') ?? '',
      new RegExp(`condizioni-rilievi-impianti-${ULTIMA}\\.pdf`),
    );
    assert.equal(pdf.bytes.subarray(0, 5).toString('latin1'), '%PDF-');

    const passo1 = await admin.submit(ACCETTA, ACCETTA, {
      versioneCondizioni: ULTIMA,
      versioneRegole: (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .regoleVersione!,
      ragioneSociale: 'Da Firmare S.r.l.',
      sede: 'Via Roma 12, 20121 Milano (MI)',
      partitaIva: 'IT01234567890',
      condizioni: 'si',
      regole: 'si',
      next: '/schede',
    });
    assert.equal(passo1.status, 303);
    assert.equal(passo1.location, `${FIRMA}?next=%2Fschede`);
    const mail = outbox.filter((m) => m.to === user.email).at(-1);
    assert.ok(mail, 'the code by email');
    const codice = /\b(\d{6})\b/.exec(mail.text)?.[1];
    assert.ok(codice, mail.text);
    const firmata = await admin.submit(FIRMA, FIRMA, { clausole: 'si', codice, next: '/schede' });
    assert.equal(firmata.status, 303);
    assert.equal(firmata.location, '/schede');

    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(dopo.condizioniVersione, ULTIMA);
    const riga = await prisma.accettazione.findFirstOrThrow({
      where: { aziendaId: a.id, tipo: 'CONDIZIONI' },
    });
    assert.equal(riga.versione, ULTIMA);
    assert.equal((await admin.get('/schede', HTML)).status, 200);
    // Not asked again when the version comes into force: it is the accepted one then too.
    for (const quando of ['2026-11-13T22:59:59Z', '2026-11-13T23:00:00Z', '2026-12-01T10:00:00Z'])
      assert.equal(condizioniValide(dopo.condizioniVersione, new Date(quando)), true, quando);
    // Signed: nothing more to ask from the console.
    const console2 = await master.get('/master/contratti', HTML);
    assert.ok(!console2.body.includes(`action="/master/contratti/${a.id}/richiedi"`));
  });
});
