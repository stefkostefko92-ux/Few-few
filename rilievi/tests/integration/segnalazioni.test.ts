// Reports of illegal content and their moderation (arts. 11, 12, 14, 16, 17, 18 of Regulation (EU) 2022/2065;
// terms 2026-11-13, art. 25), end to end. Acceptance criteria:
//  - the public page /segnalazioni is indexable, names the point of contact and holds the form (art. 16);
//  - a valid report is stored, confirmed by email to the reporter with its reference — WITHOUT repeating what was
//    written (the address is not verified: the portal must not mail someone's text to a third party) —, announced
//    to MASTER and to Discord without personal data, and audited without the text;
//  - name and email are optional only for child sexual abuse material (art. 16(2)(c));
//  - a bot that fills the trap gets the same answer and nothing is stored;
//  - only MASTER — the person responsible for moderation — sees and decides; a removal or a restriction needs the
//    statement of reasons of art. 17(3) and goes to the administrators of the company, without the reporter's
//    identity; the reporter gets the decision with the reasons and the redress (art. 16(5));
//  - a decided report is kept 5 years (1 year when it could not be examined), then the maintenance deletes it.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  attendiDiscord,
  avviaEsterniFinti,
  discord,
  fermaEsterniFinti,
  WEBHOOK_DISCORD,
} from './esterni-finti.js';

await avviaEsterniFinti();
const h = await import('./harness.js');
const { Browser, makeAzienda, outbox, prisma, signedIn, startApp, stopApp } = h;
const { cifraAllarmi } = await import('../../src/auth/chiavi.js');
const { pulisciSegnalazioni } = await import('../../src/segnalazioni/servizio.js');

before(async () => {
  await startApp();
  await prisma.configAllarmi.create({
    data: { id: 'discord', attivo: true, urlEnc: cifraAllarmi(WEBHOOK_DISCORD) },
  });
});
after(async () => {
  await stopApp();
  await fermaEsterniFinti();
});

const HTML = { accept: 'text/html' };
const PAGINA = '/segnalazioni';
const GIORNO = 24 * 60 * 60 * 1000;
const dati = {
  dove: 'https://rilievi.carbonstealth.eu/schede/abc123 — la terza foto della sezione Quadro',
  motivo: 'La foto ritrae me e la targa della mia auto senza alcuna base di legge.',
  nome: 'Maria Rossi',
  email: 'maria.rossi@example.it',
  buonaFede: 'si',
};

async function attendiPosta(test: (m: { to: string; subject: string; text: string }) => boolean) {
  for (let i = 0; i < 40 && !outbox.some(test); i += 1) await new Promise((r) => setTimeout(r, 50));
  return outbox.find(test);
}

describe('the public page to report illegal content', () => {
  it('is public and indexable, names the point of contact and holds the form', async () => {
    const anonimo = new Browser();
    const p = await anonimo.get(PAGINA, HTML);
    assert.equal(p.status, 200);
    assert.match(p.body, /<meta name="robots" content="index, follow">/);
    assert.match(p.body, /<link rel="canonical" href="[^"]+\/segnalazioni">/);
    assert.match(p.body, /<h1>Segnalare un contenuto illegale<\/h1>/);
    assert.match(p.body, /Punto di contatto unico/);
    assert.match(p.body, /italiano, bulgaro, inglese/);
    assert.match(p.body, /il responsabile della moderazione di Carbon Stealth VCC/);
    assert.match(p.body, /action="\/segnalazioni#modulo"/);
    assert.match(p.body, /"@type":"BreadcrumbList"/);
    const titolo = /<title>([^<]+)<\/title>/.exec(p.body)![1]!;
    const descrizione = /<meta name="description" content="([^"]+)">/.exec(p.body)![1]!;
    const chiavi = /<meta name="keywords" content="([^"]+)">/.exec(p.body)![1]!;
    assert.ok(titolo.length < 60, titolo);
    assert.ok(descrizione.length < 160, descrizione);
    assert.ok(chiavi.split(',').length >= 5 && /Carbon Stealth/.test(chiavi));
    // The footer of every public page leads here.
    assert.match((await anonimo.get('/privacy', HTML)).body, /href="\/segnalazioni"/);
  });

  it('stores a valid report, confirms it without repeating the text, and tells MASTER', async () => {
    const master = await signedIn('MASTER');
    const anonimo = new Browser();
    const male = await anonimo.submit(PAGINA, PAGINA, { ...dati, motivo: 'breve', buonaFede: '' });
    assert.equal(male.status, 422);
    assert.match(male.body, /Spiega perché il contenuto è illegale/);
    assert.match(male.body, /devi confermare la dichiarazione di buona fede/);
    assert.ok(male.body.includes('maria.rossi@example.it'));
    assert.equal(await prisma.segnalazione.count(), 0);

    discord.messaggi.length = 0;
    const via = await anonimo.submit(PAGINA, PAGINA, dati);
    assert.equal(via.status, 303, via.body.slice(0, 300));
    const riga = await prisma.segnalazione.findFirstOrThrow();
    assert.match(riga.riferimento, /^SG-[0-9A-Z]{8}$/);
    assert.equal(via.location, `/segnalazioni/inviata?rif=${riga.riferimento}`);
    assert.deepEqual(
      [riga.stato, riga.dove, riga.motivo, riga.nome, riga.email, riga.minori, riga.conservaFino],
      ['RICEVUTA', dati.dove, dati.motivo, dati.nome, dati.email, false, null],
    );
    const grazie = await anonimo.get(via.location, HTML);
    assert.match(grazie.body, /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(grazie.body.includes(riga.riferimento));

    // The confirmation (art. 16(4)): the reference, not the text — the address is not verified.
    const conferma = await attendiPosta((m) => m.to === dati.email);
    assert.ok(conferma);
    assert.ok(conferma.subject.includes(riga.riferimento));
    assert.ok(!conferma.text.includes('targa') && !conferma.text.includes('abc123'));
    assert.match(conferma.text, /il responsabile della moderazione/);
    // MASTER: a mail with the link, and Discord with the kind of event only.
    const avviso = await attendiPosta(
      (m) => m.to === master.user.email && /segnalazione/i.test(m.subject),
    );
    assert.ok(avviso);
    assert.ok(!avviso.text.includes('Maria') && !avviso.text.includes('targa'));
    assert.ok(await attendiDiscord((m) => /segnalazione di contenuto illegale/.test(m)));
    assert.ok(discord.messaggi.every((m) => !/Maria|example\.it|targa/.test(m)));
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SEGNALAZIONE_RICEVUTA' },
    });
    assert.deepEqual(
      [audit.actorId, audit.targetId, audit.meta],
      [null, riga.id, { minori: false }],
    );
  });

  it('takes a report without name and email only for child sexual abuse material', async () => {
    const anonimo = new Browser();
    const { nome: _n, email: _e, ...senza } = dati;
    const no = await anonimo.submit(PAGINA, PAGINA, senza);
    assert.equal(no.status, 422);
    assert.match(no.body, /Scrivi il tuo nome/);
    const prima = outbox.length;
    const si = await anonimo.submit(PAGINA, PAGINA, { ...senza, minori: 'si' });
    assert.equal(si.status, 303);
    const riga = await prisma.segnalazione.findFirstOrThrow({ where: { minori: true } });
    assert.deepEqual([riga.nome, riga.email], [null, null]);
    assert.match((await anonimo.get(si.location, HTML)).body, /Senza un indirizzo email/);
    // No address, no confirmation: only MASTER is written to.
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(outbox.slice(prima).every((m) => m.to !== dati.email));
  });

  it('answers a bot like a person and stores nothing', async () => {
    const prima = await prisma.segnalazione.count();
    const bot = await new Browser().submit(PAGINA, PAGINA, {
      ...dati,
      sito: 'http://spam.example',
    });
    assert.equal(bot.status, 303);
    assert.match(bot.location, /^\/segnalazioni\/inviata/);
    assert.equal(await prisma.segnalazione.count(), prima);
  });
});

describe('the moderation in the console', () => {
  it('is only for MASTER, who decides with the reasons art. 17 asks for', async () => {
    const azienda = await makeAzienda('Contenuti Srl');
    const admin = await signedIn('ADMIN', azienda.id);
    assert.equal((await admin.browser.get('/master/segnalazioni', HTML)).status, 403);
    const s = await prisma.segnalazione.findFirstOrThrow({ where: { email: dati.email } });
    assert.equal((await admin.browser.get(`/master/segnalazioni/${s.id}`, HTML)).status, 403);

    const { browser, user } = await signedIn('MASTER');
    const elenco = await browser.get('/master/segnalazioni', HTML);
    assert.equal(elenco.status, 200);
    assert.ok(elenco.body.includes(s.riferimento));
    assert.match(elenco.body, /Ricevuta/);
    const scheda = `/master/segnalazioni/${s.id}`;
    const pagina = await browser.get(scheda, HTML);
    assert.ok(pagina.body.includes('la terza foto della sezione Quadro'));
    assert.ok(pagina.body.includes('maria.rossi@example.it'));

    // A removal without the statement of reasons of art. 17(3): refused, nothing changes.
    const senza = await browser.submit(scheda, `${scheda}/decisione`, {
      esito: 'RIMOSSO',
      motivazione: 'La foto mostra una persona riconoscibile senza base di legge.',
    });
    assert.equal(senza.status, 422);
    assert.match(senza.body, /Per rimuovere o limitare un contenuto servono/);
    assert.equal(
      (await prisma.segnalazione.findUniqueOrThrow({ where: { id: s.id } })).stato,
      'RICEVUTA',
    );

    const decisa = await browser.submit(scheda, `${scheda}/decisione`, {
      esito: 'RIMOSSO',
      motivazione: 'La foto mostra una persona riconoscibile senza base di legge.',
      azienda: azienda.id,
      misura: 'Rimozione della terza foto della sezione Quadro; per tutti gli utenti; definitiva.',
      fatti: 'Nella foto si riconoscono una persona e una targa.',
      fondamento: "Art. 6 GDPR: manca una base giuridica per il trattamento dell'immagine.",
    });
    assert.equal(decisa.status, 303, decisa.body.slice(0, 400));
    const dopo = await prisma.segnalazione.findUniqueOrThrow({ where: { id: s.id } });
    assert.deepEqual(
      [dopo.stato, dopo.esito, dopo.aziendaId, dopo.aziendaNome, dopo.decisaById],
      ['DECISA', 'RIMOSSO', azienda.id, 'Contenuti Srl', user.id],
    );
    const anni = (dopo.conservaFino!.getTime() - Date.now()) / (365 * GIORNO);
    assert.ok(anni > 4.9 && anni < 5.1, String(anni));

    // The reporter: the decision, the reasons, how to contest it (art. 16(5)).
    const alSegnalante = await attendiPosta(
      (m) => m.to === dati.email && /Decisione/.test(m.subject),
    );
    assert.ok(alSegnalante);
    assert.match(alSegnalante.text, /Abbiamo rimosso il contenuto/);
    assert.match(alSegnalante.text, /persona riconoscibile/);
    assert.match(alSegnalante.text, /Coordinatore dei servizi digitali/);
    // The company: the statement of reasons (art. 17), without who reported.
    const allAzienda = await attendiPosta(
      (m) => m.to === admin.user.email && /i motivi/.test(m.subject),
    );
    assert.ok(allAzienda);
    assert.match(allAzienda.text, /Rimozione della terza foto/);
    assert.match(allAzienda.text, /Art\. 6 GDPR/);
    assert.match(allAzienda.text, /Mezzi automatizzati: nessuno/);
    assert.match(allAzienda.text, /una segnalazione ricevuta il/);
    assert.ok(!allAzienda.text.includes('Maria') && !allAzienda.text.includes('example.it'));
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SEGNALAZIONE_DECISA' },
    });
    assert.deepEqual(
      [audit.actorId, audit.aziendaId, audit.meta],
      [user.id, null, { esito: 'RIMOSSO' }],
    );
    // Decided once: a second decision is refused.
    const ancora = await browser.submit(scheda, `${scheda}/decisione`, {
      esito: 'NESSUNA_AZIONE',
      motivazione: 'Ripensamento senza riesame.',
    });
    assert.equal(ancora.status, 409);

    // The review (art. 25.7) and the notice to the authorities (art. 18) are recorded.
    const riesame = await browser.submit(scheda, `${scheda}/riesame`, {
      esito:
        "Riesame chiesto dall'azienda: la misura è confermata, la persona resta riconoscibile.",
    });
    assert.equal(riesame.status, 303);
    const chiusa = await prisma.segnalazione.findUniqueOrThrow({ where: { id: s.id } });
    assert.equal(chiusa.stato, 'CHIUSA');
    assert.ok(chiusa.riesameAt && chiusa.riesameEsito?.includes('confermata'));
  });

  it('keeps an unexaminable report one year, and the maintenance deletes what is past its time', async () => {
    const { browser } = await signedIn('MASTER');
    const s = await prisma.segnalazione.findFirstOrThrow({ where: { minori: true } });
    const scheda = `/master/segnalazioni/${s.id}`;
    const via = await browser.submit(scheda, `${scheda}/decisione`, {
      esito: 'NON_VALIDA',
      motivazione: 'Non si capisce di quale contenuto si tratta.',
    });
    assert.equal(via.status, 303);
    const dopo = await prisma.segnalazione.findUniqueOrThrow({ where: { id: s.id } });
    const giorni = (dopo.conservaFino!.getTime() - Date.now()) / GIORNO;
    assert.ok(giorni > 364 && giorni < 367, String(giorni));
    // Past its time: deleted; an undecided report never is.
    await prisma.segnalazione.update({
      where: { id: s.id },
      data: { conservaFino: new Date(Date.now() - 1000) },
    });
    const aperta = await prisma.segnalazione.create({
      data: {
        riferimento: 'SG-APERTA01',
        dove: dati.dove,
        motivo: dati.motivo,
        nome: 'X Y',
        email: 'x@example.it',
      },
    });
    assert.equal(await pulisciSegnalazioni(), 1);
    assert.equal(await prisma.segnalazione.count({ where: { id: s.id } }), 0);
    assert.equal(await prisma.segnalazione.count({ where: { id: aperta.id } }), 1);
  });
});
