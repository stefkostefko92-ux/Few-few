// The alarms to Discord from the MASTER console (the owner, 12 November 2026: the off-site copy and the alarms go
// to a Discord webhook), end to end with the fake Discord. Acceptance criteria:
//  - only MASTER, and every change only with the password;
//  - only a Discord webhook address is saved; it is stored encrypted and never shown again — not on the page, not
//    in the audit;
//  - "Invia un messaggio di prova" really posts to the webhook and says what Discord answered;
//  - an alarm carries the kind of event, a count and the link to the console — no company, no person;
//  - the same kind of alarm is not repeated before its pause is over; switched off, nothing leaves.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { avviaEsterniFinti, discord, fermaEsterniFinti, WEBHOOK_DISCORD } from './esterni-finti.js';

await avviaEsterniFinti();
const h = await import('./harness.js');
const { makeAzienda, PASSWORD, prisma, signedIn, startApp, stopApp } = h;
const { allarme } = await import('../../src/allarmi/servizio.js');

before(startApp);
after(async () => {
  await stopApp();
  await fermaEsterniFinti();
});

const HTML = { accept: 'text/html' };
const PAGINA = '/master/allarmi';
const TOKEN = WEBHOOK_DISCORD.split('/').pop()!;

describe('the alarms to Discord', () => {
  it('are set only by MASTER, with the password, and the address is never shown again', async () => {
    const azienda = await makeAzienda('Allarmi Srl');
    const admin = await signedIn('ADMIN', azienda.id);
    assert.equal((await admin.browser.get(PAGINA, HTML)).status, 403);

    const { browser, user } = await signedIn('MASTER');
    const vuota = await browser.get(PAGINA, HTML);
    assert.equal(vuota.status, 200);
    assert.match(vuota.body, /Gli allarmi non sono attivi/);

    // Switched on without an address; an address that is not Discord's; without the password: nothing is saved.
    const senzaUrl = await browser.submit(PAGINA, PAGINA, {
      attivo: '1',
      url: '',
      password: PASSWORD,
    });
    assert.equal(senzaUrl.status, 422);
    assert.match(senzaUrl.body, /Incolla l&#39;indirizzo del webhook/);
    const altrove = await browser.submit(PAGINA, PAGINA, {
      attivo: '1',
      url: 'https://evil.example/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
      password: PASSWORD,
    });
    assert.equal(altrove.status, 422);
    assert.match(altrove.body, /non è un webhook di Discord/);
    assert.ok(!altrove.body.includes('evil.example'));
    const senzaPassword = await browser.submit(PAGINA, PAGINA, {
      attivo: '1',
      url: WEBHOOK_DISCORD,
      password: 'sbagliata-9',
    });
    assert.equal(senzaPassword.status, 422);
    assert.match(senzaPassword.body, /Password non corretta/);
    assert.ok(!senzaPassword.body.includes(TOKEN));
    assert.equal(await prisma.configAllarmi.count(), 0);

    // Saved: encrypted in the database, absent from the page and from the audit.
    const salva = await browser.submit(PAGINA, PAGINA, {
      attivo: '1',
      url: `  ${WEBHOOK_DISCORD} `,
      password: PASSWORD,
    });
    assert.equal(salva.status, 303, salva.body.slice(0, 300));
    const riga = await prisma.configAllarmi.findUniqueOrThrow({ where: { id: 'discord' } });
    assert.equal(riga.attivo, true);
    assert.ok(riga.urlEnc && !riga.urlEnc.includes(TOKEN) && !riga.urlEnc.includes('discord'));
    const pagina = await browser.get(PAGINA, HTML);
    assert.match(pagina.body, /Gli allarmi sono attivi/);
    assert.ok(!pagina.body.includes(TOKEN));
    assert.ok(!pagina.body.includes('123456789012345678'));
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ALLARMI_IMPOSTATI', actorId: user.id },
    });
    assert.deepEqual(audit.meta, { attivo: true, urlNuovo: true });

    // The test message really leaves, and the page says what Discord answered.
    discord.stato = 200;
    const prova = await browser.submit(PAGINA, `${PAGINA}/prova`, {});
    assert.equal(prova.status, 303);
    assert.match((await browser.get(prova.location, HTML)).body, /Messaggio di prova inviato/);
    assert.deepEqual(discord.messaggi, [
      'Rilievi Impianti · messaggio di prova: gli allarmi del portale arrivano in questo canale.',
    ]);
    assert.ok(discord.percorsi.at(-1)!.endsWith(`${TOKEN}?wait=true`));
    // The webhook was deleted on Discord: said with the code, not hidden.
    discord.stato = 404;
    const persa = await browser.submit(PAGINA, `${PAGINA}/prova`, {});
    assert.match((await browser.get(persa.location, HTML)).body, /Discord ha risposto 404/);
    discord.stato = 204;
  });

  it('carry no personal data, respect the pause, and stop when switched off', async () => {
    discord.messaggi.length = 0;
    await allarme('manutenzione', 2);
    await allarme('manutenzione', 5);
    await allarme('contestazione');
    assert.equal(discord.messaggi.length, 2);
    assert.match(discord.messaggi[0]!, /manutenzione: 2 passi non riusciti/);
    assert.match(discord.messaggi[0]!, /\/master$/);
    assert.match(discord.messaggi[1]!, /chargeback/);
    for (const m of discord.messaggi) assert.doesNotMatch(m, /@|Srl|S\.r\.l\./);

    // Discord down: the alarm is not counted as sent — the next event tries again.
    discord.stato = 500;
    await allarme('segnalazione');
    discord.stato = 204;
    await allarme('segnalazione');
    assert.equal(discord.messaggi.filter((m) => /segnalazione/.test(m)).length, 1);

    // Switched off (the address stays): nothing leaves, and the test message says so.
    const { browser } = await signedIn('MASTER');
    const spegni = await browser.submit(PAGINA, PAGINA, { url: '', password: PASSWORD });
    assert.equal(spegni.status, 303);
    const riga = await prisma.configAllarmi.findUniqueOrThrow({ where: { id: 'discord' } });
    assert.equal(riga.attivo, false);
    assert.ok(riga.urlEnc);
    const prima = discord.messaggi.length;
    await allarme('posta');
    const prova = await browser.submit(PAGINA, `${PAGINA}/prova`, {});
    assert.match((await browser.get(prova.location, HTML)).body, /Gli allarmi non sono attivi/);
    assert.equal(discord.messaggi.length, prima);
  });
});
