// The master console against a real database (the owner, 10 November 2026 — "Espandi le funzioni di
// master con tutto quello che ti viene in mente"): only MASTER opens it; "Contratti" asks a company that
// was marked as accepted (no row in the register) for a real signature; "Verifica documento" finds a
// calculation PDF by its Rif. or by the file and tells a broken seal; "Comunicazioni" puts a notice above
// the pages of the chosen companies for the chosen days, each person closes it for themself, master stops it.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { improntaCalcolo } from '../../src/build.js';
import { registraEmissione } from '../../src/legale/emissioni.js';
import { VERSIONE } from '../../src/legale/versioni.js';
import {
  Browser,
  makeAzienda,
  makeUser,
  outbox,
  prisma,
  signedIn,
  startApp,
  stopApp,
} from './harness.js';

const HTML = { accept: 'text/html' };
const oggi = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
// Days of the calendar in Rome, not 24-hour steps: across the change of the clocks "now + n × 24 h" lands on
// the day before or after (the audit of 12 November 2026).
const traGiorni = (n: number) => {
  const [y, m, d] = oggi().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
};

let master: Browser;

before(async () => {
  await startApp();
  ({ browser: master } = await signedIn('MASTER'));
});
after(stopApp);

describe('the console', () => {
  it('opens only for master, with numbers, health and the tools', async () => {
    const page = await master.get('/master', HTML);
    assert.equal(page.status, 200);
    assert.match(page.body, /<h1>Console del portale<\/h1>/);
    assert.match(page.body, /class="spia spia--(ok|attenzione|errore)"/);
    assert.match(page.body, /<svg class="grafico"/);
    for (const href of ['/master/contratti', '/master/comunicazioni', '/master/verifica'])
      assert.ok(page.body.includes(`href="${href}"`), href);

    const { browser: admin } = await signedIn('ADMIN');
    for (const path of [
      '/master',
      '/master/contratti',
      '/master/verifica',
      '/master/comunicazioni',
    ])
      assert.equal((await admin.get(path, HTML)).status, 403, path);
  });
});

describe('the contracts', () => {
  it('ask a company accepted without signature for a real one, once', async () => {
    const azienda = await makeAzienda();
    const admin = await makeUser('ADMIN', undefined, azienda.id);
    const page = await master.get('/master/contratti', HTML);
    assert.ok(page.body.includes(`action="/master/contratti/${azienda.id}/richiedi"`));

    const reply = await master.submit(
      '/master/contratti',
      `/master/contratti/${azienda.id}/richiedi`,
      {},
    );
    assert.equal(reply.status, 303);
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(dopo.condizioniVersione, null);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'CONDIZIONI_RICHIESTE', aziendaId: azienda.id },
    });
    assert.deepEqual(audit?.meta, { versione: VERSIONE.CONDIZIONI });

    // Now its administrator signs before using the portal.
    const browser = new Browser();
    await browser.login(admin.email);
    const schede = await browser.get('/schede', HTML);
    assert.equal(schede.status, 303);
    assert.match(schede.location, /^\/condizioni\/accetta/);

    // Waiting already: nothing changes, no second audit row.
    const ancora = await master.submit(
      '/master/contratti',
      `/master/contratti/${azienda.id}/richiedi`,
      {},
    );
    assert.equal(ancora.status, 303);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'CONDIZIONI_RICHIESTE', aziendaId: azienda.id },
      }),
      1,
    );
    const ignota = await master.submit(
      '/master/contratti',
      '/master/contratti/cxxxxxxxxxxxxxxxxxxxxxxxx/richiedi',
      {},
    );
    assert.equal(ignota.status, 404);
  });
});

describe('the verification of a document', () => {
  it('finds a calculation PDF by its Rif. or by the file, and tells a broken seal', async () => {
    const azienda = await makeAzienda();
    const dati = { vn: 1.6, tipo: 'progressivo', unico: Date.now() };
    const impronta = improntaCalcolo('limitatore', 'test000000', dati);
    const pdf = Buffer.from(`%PDF-1.7\n${impronta}\n%%EOF\n`);
    await registraEmissione({
      calcolo: 'limitatore',
      impronta,
      build: 'test000000',
      dati,
      risultato: [{ riga: 'V1' }],
      calcoloId: null,
      schedaId: null,
      azienda: { id: azienda.id, name: azienda.name },
      user: { id: 'u1', name: 'Tecnico Prova', email: 'tecnico@rilievi.test' },
      pdf,
    });

    const perRif = await master.submit('/master/verifica', '/master/verifica', {
      codice: ` rif. ${impronta.toLowerCase().replace(/-/g, ' ')} `,
    });
    assert.equal(perRif.status, 200);
    assert.match(perRif.body, /Intatto: il sigillo corrisponde/);
    assert.ok(perRif.body.includes(azienda.name));

    const perFile = await master.upload(
      '/master/verifica',
      '/master/verifica',
      {},
      {
        field: 'file',
        name: 'calcolo.pdf',
        type: 'application/pdf',
        bytes: pdf,
      },
    );
    assert.equal(perFile.status, 200);
    assert.match(perFile.body, /Trovato con il file/);

    const altro = await master.upload(
      '/master/verifica',
      '/master/verifica',
      {},
      {
        field: 'file',
        name: 'calcolo.pdf',
        type: 'application/pdf',
        bytes: Buffer.concat([pdf, Buffer.from(' ')]),
      },
    );
    assert.match(altro.body, /Il file non è identico a nessun PDF registrato/);

    // Someone edits the register by hand: the seal no longer matches.
    await prisma.emissioneCalcolo.updateMany({
      where: { impronta },
      data: { userNome: 'Altro Tecnico' },
    });
    const rotto = await master.submit('/master/verifica', '/master/verifica', { codice: impronta });
    assert.match(rotto.body, /Sigillo non valido/);

    const sbagliato = await master.submit('/master/verifica', '/master/verifica', {
      codice: 'ABCD',
    });
    assert.equal(sbagliato.status, 422);

    // The audit keeps how and how many, never the code.
    const righe = await prisma.auditLog.findMany({ where: { action: 'PROVA_VERIFICA' } });
    assert.ok(righe.length >= 4);
    for (const r of righe) assert.ok(!JSON.stringify(r.meta).includes(impronta.slice(0, 4)));
  });
});

describe('the notices to the companies', () => {
  it('show above the pages of the chosen companies until closed or stopped', async () => {
    const scelta = await makeAzienda();
    const altra = await makeAzienda();
    const admin = await makeUser('ADMIN', 'Admin Avvisi', scelta.id);
    const { browser: tecnico } = await signedIn('TECNICO', scelta.id);
    const { browser: estraneo } = await signedIn('TECNICO', altra.id);
    outbox.length = 0;

    const titolo = 'Manutenzione <b>sabato</b>';
    const form = {
      titolo,
      testo: 'Il portale si ferma dalle 7 alle 8.\n\nGrazie.',
      livello: 'AVVISO',
      destinatari: 'scelte',
      aziende: [scelta.id],
      inizio: oggi(),
      fine: traGiorni(2),
      email: '1',
    };
    const creata = await master.submit('/master/comunicazioni', '/master/comunicazioni', form);
    assert.equal(creata.status, 303);
    // A second "Pubblica" (a page that hung, a repeated request): no second notice, no second emails.
    const ancora = await master.submit('/master/comunicazioni', '/master/comunicazioni', form);
    assert.equal(ancora.status, 303);
    assert.equal(await prisma.comunicazione.count({ where: { titolo } }), 1);
    let riga = await prisma.comunicazione.findFirstOrThrow({ where: { titolo } });
    // The emails leave after the answer, in the background: wait for their count.
    for (let i = 0; i < 50 && riga.emailInviate === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      riga = await prisma.comunicazione.findFirstOrThrow({ where: { titolo } });
    }
    assert.deepEqual(riga.aziendaIds, [scelta.id]);

    // One email to each administrator of the chosen company — nobody else.
    assert.deepEqual(
      outbox.map((m) => m.to),
      [admin.email],
    );
    assert.ok(outbox[0]!.subject.includes('Manutenzione'));
    assert.match(
      outbox[0]!.text,
      /in cima alle pagine del portale, dal \d{2}\/\d{2}\/\d{4} al \d{2}\/\d{2}\/\d{4}:/,
    );

    const pagina = await tecnico.get('/schede', HTML);
    assert.match(pagina.body, /class="avviso avviso--avviso"/);
    assert.ok(
      pagina.body.includes('Manutenzione &lt;b&gt;sabato&lt;/b&gt;'),
      'the title is escaped',
    );
    assert.ok(!pagina.body.includes('<b>sabato</b>'));
    assert.ok(!(await estraneo.get('/schede', HTML)).body.includes('class="avvisi"'));
    assert.ok(!(await master.get('/schede', HTML)).body.includes('class="avvisi"'));
    // A fragment for the page (search palette) carries no notice.
    assert.ok(
      !(await tecnico.get('/cerca?q=x', { ...HTML, 'x-partial': '1' })).body.includes('avviso'),
    );

    // "Chiudi" in the background: 204, and the notice does not come back.
    const _csrf = await tecnico.csrf('/account');
    const chiusa = await tecnico.post(
      `/comunicazioni/${riga.id}/chiudi`,
      { _csrf, torna: '/schede' },
      { 'x-partial': '1' },
    );
    assert.equal(chiusa.status, 204);
    assert.ok(!(await tecnico.get('/schede', HTML)).body.includes('class="avvisi"'));
    // Closing a notice not meant for you writes nothing.
    const _csrf2 = await estraneo.csrf('/account');
    await estraneo.post(`/comunicazioni/${riga.id}/chiudi`, { _csrf: _csrf2, torna: '/schede' });
    assert.equal(
      await prisma.comunicazioneChiusa.count({ where: { comunicazioneId: riga.id } }),
      1,
    );

    const elenco = await master.get('/master/comunicazioni', HTML);
    assert.match(elenco.body, /Chiusa da 1 persona/);
    // No SMTP in the tests: the email is in the outbox, not sent — the count says so.
    assert.match(elenco.body, /0 email inviate/);
  });

  it('wait for their first day and disappear when stopped', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('OPERATORE', azienda.id);
    await master.submit('/master/comunicazioni', '/master/comunicazioni', {
      titolo: 'Domani',
      testo: 'Non ancora.',
      livello: 'INFO',
      destinatari: 'tutte',
      inizio: traGiorni(1),
    });
    assert.ok(!(await browser.get('/schede', HTML)).body.includes('Non ancora.'));

    await master.submit('/master/comunicazioni', '/master/comunicazioni', {
      titolo: 'Interruzione',
      testo: 'In corso adesso.',
      livello: 'URGENTE',
      destinatari: 'tutte',
      inizio: oggi(),
    });
    assert.match((await browser.get('/schede', HTML)).body, /avviso--urgente/);
    const urgente = await prisma.comunicazione.findFirstOrThrow({
      where: { titolo: 'Interruzione' },
    });
    const ferma = await master.submit(
      '/master/comunicazioni',
      `/master/comunicazioni/${urgente.id}/ferma`,
      {},
    );
    assert.equal(ferma.status, 303);
    assert.ok(!(await browser.get('/schede', HTML)).body.includes('In corso adesso.'));
    const audit = await prisma.auditLog.count({
      where: {
        action: { in: ['COMUNICAZIONE_CREATE', 'COMUNICAZIONE_STOP'] },
        targetId: urgente.id,
      },
    });
    assert.equal(audit, 2);
  });

  it('refuse a wrong form and keep what was written', async () => {
    const reply = await master.submit('/master/comunicazioni', '/master/comunicazioni', {
      titolo: 'Date al contrario',
      testo: 'Testo.',
      livello: 'INFO',
      destinatari: 'tutte',
      inizio: traGiorni(3),
      fine: traGiorni(1),
    });
    assert.equal(reply.status, 422);
    assert.ok(reply.body.includes('value="Date al contrario"'));
    assert.equal(await prisma.comunicazione.count({ where: { titolo: 'Date al contrario' } }), 0);
  });
});
