// The terms of service and the rules of use (the owner, 10 November 2026: "Fai tutto in modo tale da
// essere legalmente coperti e minimamente esposti"). Nobody uses the portal before they are accepted.
// The company's terms are concluded by its ADMIN in two steps: the acceptance with the company's declared
// data, then — on a page of its own — the specific approval of the listed clauses (artt. 1341-1342 c.c.)
// signed with a one-time code sent to his email (a simple electronic signature: Cass. 20945/2026 holds a
// tick, or two, is not enough). The rules of use are accepted by every person with a tick. Each acceptance
// is sealed evidence that outlives the person and the company; the ADMIN gets a PDF copy by email and can
// download it in the portal.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eliminaAzienda } from '../../src/aziende/eliminazione.js';
import { runMaintenance } from '../../src/maintenance.js';
import { CAMPI_ACCETTAZIONE, sigilloValido } from '../../src/legale/sigillo.js';
import { clausoleSpecifiche, hashTesto, leggiTesto } from '../../src/legale/testi.js';
import { VERSIONE } from '../../src/legale/versioni.js';
import { Browser, makeAzienda, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const ACCETTA = '/condizioni/accetta';
const FIRMA = '/condizioni/firma';
const versioni = { versioneCondizioni: VERSIONE.CONDIZIONI, versioneRegole: VERSIONE.REGOLE };
const DICHIARATI = {
  ragioneSociale: 'Ascensori Prova S.r.l.',
  sede: 'Via Roma 12, 20121 Milano (MI)',
  partitaIva: 'IT 01234567890',
};
const PASSO_1 = { ...versioni, ...DICHIARATI, condizioni: 'si', regole: 'si', next: '/schede' };

/** A company whose terms nobody has accepted yet. */
async function aziendaNuova() {
  const azienda = await makeAzienda();
  await prisma.azienda.update({ where: { id: azienda.id }, data: { condizioniVersione: null } });
  return azienda;
}

/** A person who has not accepted the rules yet. */
async function senzaRegole(role: Parameters<typeof signedIn>[0], aziendaId: string) {
  const who = await signedIn(role, aziendaId);
  await prisma.user.update({ where: { id: who.user.id }, data: { regoleVersione: null } });
  return who;
}

/** The last code sent to `email`. */
function codiceInviato(email: string): string {
  const mail = outbox.filter((m) => m.to === email).at(-1);
  assert.ok(mail, `no code sent to ${email}`);
  const codice = /\b(\d{6})\b/.exec(mail.text)?.[1];
  assert.ok(codice, mail.text);
  return codice;
}

/** An ADMIN of a fresh company past the first step, with the code in his mailbox. */
async function adminAlCodice() {
  const azienda = await aziendaNuova();
  const who = await senzaRegole('ADMIN', azienda.id);
  const reply = await who.browser.submit(ACCETTA, ACCETTA, PASSO_1);
  assert.equal(reply.status, 303);
  assert.equal(reply.location, `${FIRMA}?next=%2Fschede`);
  return { azienda, ...who, codice: codiceInviato(who.user.email) };
}

/** As EJS writes text into HTML. */
const html = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');

describe('the gate before the portal', () => {
  it('sends to the acceptance page first, keeps the way back, refuses the live search', async () => {
    const azienda = await makeAzienda();
    const { browser } = await senzaRegole('TECNICO', azienda.id);
    const schede = await browser.get('/schede?q=roma');
    assert.equal(schede.status, 303);
    assert.equal(schede.location, `${ACCETTA}?next=${encodeURIComponent('/schede?q=roma')}`);
    assert.equal((await browser.get('/schede?q=roma', { 'x-partial': '1' })).status, 403);
    assert.equal((await browser.get('/calcolo-argano/nuovo')).status, 303);
    assert.equal((await browser.get('/condizioni')).status, 200, 'the public text stays open');
  });

  it('never stops the portal owner, who is the provider', async () => {
    const { browser } = await signedIn('MASTER');
    assert.equal((await browser.get('/schede')).status, 200);
    assert.equal((await browser.get(ACCETTA)).status, 302, 'nothing to accept: straight on');
  });
});

describe('the rules of use, accepted by every person', () => {
  it('needs the tick; then records the exact text, sealed, and opens the portal', async () => {
    const azienda = await makeAzienda();
    const { browser, user } = await senzaRegole('TECNICO', azienda.id);
    const page = await browser.get(`${ACCETTA}?next=%2Fschede`);
    assert.equal(page.status, 200);
    assert.match(page.body, /name="regole" value="si"/);
    assert.doesNotMatch(page.body, /name="condizioni"/, 'only the ADMIN accepts for the company');

    const vuoto = await browser.submit(ACCETTA, ACCETTA, { ...versioni, next: '/schede' });
    assert.equal(vuoto.status, 422);
    assert.equal(await prisma.accettazione.count({ where: { userId: user.id } }), 0);

    const ok = await browser.submit(ACCETTA, ACCETTA, {
      ...versioni,
      regole: 'si',
      next: '/schede',
    });
    assert.equal(ok.status, 303);
    assert.equal(ok.location, '/schede');
    const riga = await prisma.accettazione.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(riga.tipo, 'REGOLE');
    assert.equal(riga.versione, VERSIONE.REGOLE);
    assert.equal(riga.hash, hashTesto(leggiTesto('REGOLE')));
    assert.equal(riga.userNome, user.name);
    assert.equal(riga.aziendaId, azienda.id);
    assert.equal(riga.ruolo, 'TECNICO');
    assert.ok(riga.ip, 'the address is kept in the register');
    assert.ok(sigilloValido(riga, CAMPI_ACCETTAZIONE), 'sealed');
    assert.equal(
      sigilloValido({ ...riga, userNome: 'Qualcun altro' }, CAMPI_ACCETTAZIONE),
      false,
      'a changed field breaks the seal',
    );
    const testo = await prisma.testoLegale.findUniqueOrThrow({
      where: { tipo_versione: { tipo: 'REGOLE', versione: VERSIONE.REGOLE } },
    });
    assert.equal(testo.hash, riga.hash);
    assert.equal((await browser.get('/schede')).status, 200);
  });
});

describe("the company's terms, concluded by its ADMIN", () => {
  it('makes everyone else wait for the ADMIN, naming him', async () => {
    const azienda = await aziendaNuova();
    const admin = await signedIn('ADMIN', azienda.id);
    const { browser } = await senzaRegole('TECNICO', azienda.id);
    const page = await browser.get(ACCETTA);
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(admin.user.name), 'who to ask');
    assert.doesNotMatch(page.body, /name="condizioni"/);
    assert.equal((await browser.get(FIRMA)).status, 303, 'no signature for him');
    await browser.submit(ACCETTA, ACCETTA, { ...versioni, regole: 'si', next: '/schede' });
    assert.equal((await browser.get('/schede')).status, 303, 'still closed');
  });

  it('asks the declared company data and the acceptance before sending any code', async () => {
    const azienda = await aziendaNuova();
    const { browser, user } = await senzaRegole('ADMIN', azienda.id);
    const page = (await browser.get(ACCETTA)).body;
    assert.match(page, /name="condizioni" value="si"/);
    assert.match(page, /name="partitaIva"/);
    assert.match(page, /href="\/condizioni"/, 'the text can be read before');
    const inviate = outbox.length;
    for (const [campo, valore] of [
      ['condizioni', ''],
      ['partitaIva', '123'],
      ['ragioneSociale', ''],
    ] as const) {
      const reply = await browser.submit(ACCETTA, ACCETTA, { ...PASSO_1, [campo]: valore });
      assert.equal(reply.status, 422, campo);
    }
    assert.equal(outbox.length, inviate, 'no code sent');
    assert.equal(await prisma.accettazione.count({ where: { userId: user.id } }), 0);
  });

  it('signs the specific approval with the code on a page of its own, records it, sends the copy', async () => {
    const { azienda, browser, user, codice } = await adminAlCodice();
    const doc = leggiTesto('CONDIZIONI');
    const page = (await browser.get(`${FIRMA}?next=%2Fschede`)).body;
    for (const { numero, descrizione } of clausoleSpecifiche(doc))
      assert.ok(
        page.includes(`art. ${numero}`) && page.includes(html(descrizione)),
        `art. ${numero}`,
      );
    assert.match(page, /1341/);
    assert.match(page, /name="clausole" value="si"/);
    assert.doesNotMatch(page, /name="clausole" value="si"[^>]* checked/, 'never ticked already');
    assert.match(page, /name="codice"/);
    assert.ok(page.includes(user.email), 'where the code went');

    const senzaSpunta = await browser.submit(FIRMA, FIRMA, { codice, next: '/schede' });
    assert.equal(senzaSpunta.status, 422);
    const sbagliato = await browser.submit(FIRMA, FIRMA, {
      clausole: 'si',
      codice: codice === '000000' ? '111111' : '000000',
      next: '/schede',
    });
    assert.equal(sbagliato.status, 422);
    assert.equal(
      await prisma.accettazione.count({ where: { userId: user.id, tipo: 'CONDIZIONI' } }),
      0,
    );

    const inviate = outbox.length;
    const ok = await browser.submit(FIRMA, FIRMA, { clausole: 'si', codice, next: '/schede' });
    assert.equal(ok.status, 303);
    assert.equal(ok.location, '/schede');

    const riga = await prisma.accettazione.findFirstOrThrow({
      where: { userId: user.id, tipo: 'CONDIZIONI' },
    });
    assert.equal(riga.versione, VERSIONE.CONDIZIONI);
    assert.equal(riga.hash, hashTesto(doc));
    assert.deepEqual(
      riga.clausole,
      doc.clausoleSpecifiche.map((c) => c.numero),
    );
    assert.equal(riga.aziendaId, azienda.id);
    assert.equal(riga.ruolo, 'ADMIN');
    assert.equal(riga.ragioneSociale, DICHIARATI.ragioneSociale);
    assert.equal(riga.partitaIva, 'IT01234567890');
    assert.equal(riga.otpEmail, user.email);
    assert.ok(riga.otpInviatoAt && riga.otpVerificatoAt);
    assert.ok(riga.otpVerificatoAt >= riga.otpInviatoAt);
    assert.match(riga.copiaHash ?? '', /^[0-9a-f]{64}$/);
    assert.ok(sigilloValido(riga, CAMPI_ACCETTAZIONE));
    assert.equal(
      await prisma.accettazione.count({ where: { userId: user.id, tipo: 'REGOLE' } }),
      1,
      'the rules ticked in the first step',
    );
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(dopo.condizioniVersione, VERSIONE.CONDIZIONI);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'CONDIZIONI_ACCETTATE', aziendaId: azienda.id },
      }),
      1,
    );

    const copia = outbox.slice(inviate).find((m) => m.to === user.email);
    assert.ok(copia, 'the ADMIN gets a copy');
    assert.ok(copia.text.includes(hashTesto(doc)));
    for (const numero of doc.clausoleSpecifiche.map((c) => c.numero))
      assert.ok(copia.text.includes(`art. ${numero}`), numero);
    assert.ok(
      copia.attachments?.some((a) => a.filename.endsWith('.pdf')),
      'the text as a PDF',
    );

    const scarica = await browser.get('/condizioni/copia');
    assert.equal(scarica.status, 200);
    assert.equal(scarica.headers.get('content-type'), 'application/pdf');
    assert.equal(scarica.bytes.subarray(0, 5).toString(), '%PDF-');

    // The code is spent: the same code again records nothing more.
    await browser.submit('/account', FIRMA, { clausole: 'si', codice, next: '/schede' });
    assert.equal(
      await prisma.accettazione.count({ where: { userId: user.id, tipo: 'CONDIZIONI' } }),
      1,
    );
    assert.equal((await browser.get('/schede')).status, 200);
  });

  it('lets his people in once the ADMIN has signed', async () => {
    const azienda = await aziendaNuova();
    const tecnico = await signedIn('TECNICO', azienda.id);
    assert.equal((await tecnico.browser.get('/schede')).status, 303);
    const admin = await senzaRegole('ADMIN', azienda.id);
    await admin.browser.submit(ACCETTA, ACCETTA, PASSO_1);
    const codice = codiceInviato(admin.user.email);
    await admin.browser.submit(FIRMA, FIRMA, { clausole: 'si', codice, next: '/schede' });
    assert.equal((await tecnico.browser.get('/schede')).status, 200);
    assert.equal(
      (await tecnico.browser.get('/condizioni/copia')).status,
      404,
      'the copy is the ADMIN’s',
    );
  });

  it('drops the code after too many wrong tries, and does not send codes too often', async () => {
    const { browser, user } = await adminAlCodice();
    for (let n = 0; n < 5; n += 1)
      await browser.submit(FIRMA, FIRMA, { clausole: 'si', codice: '999999', next: '/schede' });
    assert.equal((await browser.get(FIRMA)).status, 303, 'a new code is needed');
    const subito = await browser.submit(ACCETTA, `${FIRMA}/nuovo-codice`, {});
    assert.equal(subito.status, 303);
    assert.equal(
      await prisma.firmaCondizioni.count({ where: { userId: user.id } }),
      1,
      'not again within a minute',
    );
  });

  it('does not accept for the company with a role changed meanwhile', async () => {
    const { azienda, browser, user, codice } = await adminAlCodice();
    await prisma.membership.update({
      where: { userId_aziendaId: { userId: user.id, aziendaId: azienda.id } },
      data: { role: 'TECNICO' },
    });
    const _csrf = await browser.csrf(ACCETTA);
    const reply = await browser.post(FIRMA, { _csrf, clausole: 'si', codice });
    assert.notEqual(reply.status, 303);
    assert.equal(
      await prisma.accettazione.count({ where: { userId: user.id, tipo: 'CONDIZIONI' } }),
      0,
    );
  });

  it('does not accept a version other than the one on the page', async () => {
    const azienda = await aziendaNuova();
    const { browser, user } = await senzaRegole('ADMIN', azienda.id);
    const reply = await browser.submit(ACCETTA, ACCETTA, {
      ...PASSO_1,
      versioneCondizioni: '2000-01-01',
    });
    assert.equal(reply.status, 409);
    assert.equal(await prisma.accettazione.count({ where: { userId: user.id } }), 0);
  });
});

describe('a person in several companies', () => {
  it('accepts for the company where he is ADMIN and its terms are missing, not the first one', async () => {
    const alfa = await makeAzienda('Alfa Ascensori');
    const beta = await aziendaNuova();
    const { browser, user } = await signedIn('ADMIN', alfa.id);
    await prisma.membership.create({
      data: { userId: user.id, aziendaId: beta.id, role: 'ADMIN' },
    });
    const page = (await browser.get(ACCETTA)).body;
    assert.ok(page.includes(html(beta.name)), 'the page names the company still to accept');
    const passo = await browser.submit(ACCETTA, ACCETTA, PASSO_1);
    assert.equal(passo.status, 303);
    const codice = codiceInviato(user.email);
    const ok = await browser.submit(FIRMA, FIRMA, { clausole: 'si', codice, next: '/schede' });
    assert.equal(ok.status, 303);
    const riga = await prisma.accettazione.findFirstOrThrow({
      where: { userId: user.id, tipo: 'CONDIZIONI' },
    });
    assert.equal(riga.aziendaId, beta.id);
    assert.equal((await browser.get('/schede')).status, 200);
    const copia = await browser.get(`/condizioni/copia?azienda=${beta.id}`);
    assert.equal(copia.status, 200);
  });

  it('waits for the ADMIN of the company still without terms, naming it', async () => {
    const alfa = await makeAzienda('Alfa Impianti');
    const beta = await aziendaNuova();
    const { browser, user } = await signedIn('TECNICO', alfa.id);
    await prisma.membership.create({
      data: { userId: user.id, aziendaId: beta.id, role: 'TECNICO' },
    });
    assert.equal((await browser.get('/schede')).status, 303, 'closed until every company has them');
    assert.ok((await browser.get(ACCETTA)).body.includes(html(beta.name)));
  });
});

describe('the evidence of an acceptance', () => {
  it('outlives the company for its own term after the end of the contract', async () => {
    const { azienda, browser, user, codice } = await adminAlCodice();
    await browser.submit(FIRMA, FIRMA, { clausole: 'si', codice, next: '/schede' });
    const riga = await prisma.accettazione.findFirstOrThrow({
      where: { userId: user.id, tipo: 'CONDIZIONI' },
    });
    // While the company exists, the term does not run out.
    await prisma.accettazione.update({
      where: { id: riga.id },
      data: { conservaFino: new Date(Date.now() - 1000) },
    });
    await runMaintenance();
    assert.equal(await prisma.accettazione.count({ where: { id: riga.id } }), 1);

    await prisma.azienda.update({ where: { id: azienda.id }, data: { deactivatedAt: new Date() } });
    assert.equal(await eliminaAzienda(azienda.id, null), true);
    const dopo = await prisma.accettazione.findUniqueOrThrow({ where: { id: riga.id } });
    assert.equal(dopo.aziendaNome, azienda.name);
    const anni = (dopo.conservaFino.getTime() - Date.now()) / (365.25 * 86_400_000);
    assert.ok(Math.abs(anni - 10) < 0.01, `kept ${anni} years after the end`);
    assert.ok(sigilloValido(dopo, CAMPI_ACCETTAZIONE), 'the moved term does not break the seal');

    await prisma.accettazione.update({
      where: { id: riga.id },
      data: { conservaFino: new Date(Date.now() - 1000) },
    });
    await runMaintenance();
    assert.equal(await prisma.accettazione.count({ where: { id: riga.id } }), 0);
  });
});

describe('the public page of the terms', () => {
  it('shows every article, the annexes, the rules and the clauses of the specific approval', async () => {
    const page = await new Browser().get('/condizioni');
    assert.equal(page.status, 200);
    const condizioni = leggiTesto('CONDIZIONI');
    const regole = leggiTesto('REGOLE');
    for (const doc of [condizioni, regole]) {
      assert.ok(page.body.includes(html(doc.titolo)));
      for (const a of doc.articoli) assert.ok(page.body.includes(html(a.titolo)), a.titolo);
    }
    for (const allegato of condizioni.allegati)
      assert.ok(page.body.includes(html(allegato.titolo)), allegato.titolo);
    assert.ok(page.body.includes(hashTesto(condizioni)), 'the fingerprint of the text');
    assert.match(page.body, /<link rel="canonical" href="[^"]+\/condizioni">/);
    assert.equal((page.body.match(/<h1\b/g) ?? []).length, 1);
    assert.match((await new Browser().get('/')).body, /href="\/condizioni"/, 'in the footer');
    assert.match((await new Browser().get('/sitemap.xml')).body, /\/condizioni<\/loc>/);
  });
});
