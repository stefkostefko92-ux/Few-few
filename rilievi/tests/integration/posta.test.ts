// The portal's email server from the MASTER console (#32 — Brevo SMTP): only MASTER; the key is written, stored
// encrypted and never shown again (an empty field keeps it); the saved server replaces the environment at once
// (the pages that depend on email change); a test email reports only an error code; switching it off goes back
// to the environment. The audit never carries the key, the login or the server.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, PASSWORD, prisma, signedIn, startApp, stopApp } from './harness.js';

const { decifraSmtp } = await import('../../src/auth/chiavi.js');

before(startApp);
after(stopApp);

const SEGRETO = 'xsmtpsib-prova-0123456789abcdef';
const form = {
  host: '127.0.0.1',
  porta: '2525',
  utente: 'login-prova@smtp-brevo.com',
  password: SEGRETO,
  passwordAccount: PASSWORD,
  mittenteNome: 'Rilievi Impianti',
  mittenteEmail: 'no-reply@carbonstealth.eu',
};

const posta = async () => (await new Browser().get('/password-dimenticata')).body;
const NO_MAIL = /L&#39;invio di email non è attivo/;

describe('the portal email server', () => {
  it('belongs to MASTER only', async () => {
    const { browser: admin } = await signedIn('ADMIN');
    assert.equal((await admin.get('/master/posta')).status, 403);
    const { browser: master } = await signedIn('MASTER');
    const page = await master.get('/master/posta');
    assert.equal(page.status, 200);
    assert.match(page.body, /L&#39;invio delle email è spento/);
    assert.match(page.body, /value="smtp-relay\.brevo\.com"/);
  });

  it('stores the key encrypted, never shows it, and uses the server at once', async () => {
    const { browser, user } = await signedIn('MASTER');
    assert.match(await posta(), NO_MAIL);
    const bad = await browser.submit('/master/posta', '/master/posta', {
      ...form,
      host: 'non valido!',
      mittenteNome: 'Rilievi <x@y.z>',
    });
    assert.equal(bad.status, 422);
    assert.match(bad.body, /Scrivi il nome del server/);
    assert.match(bad.body, /senza i segni/);
    assert.doesNotMatch(bad.body, new RegExp(SEGRETO));
    assert.equal(await prisma.postaPortale.count(), 0);

    // Not without the password of the account: every email of the portal leaves from here.
    const senza = await browser.submit('/master/posta', '/master/posta', {
      ...form,
      passwordAccount: 'sbagliata-9',
    });
    assert.equal(senza.status, 422);
    assert.match(senza.body, /Password non corretta/);
    assert.equal(await prisma.postaPortale.count(), 0);

    const saved = await browser.submit('/master/posta', '/master/posta', form);
    assert.equal(saved.status, 303);
    const riga = await prisma.postaPortale.findUniqueOrThrow({ where: { id: 'posta' } });
    assert.ok(!riga.passwordEnc.includes(SEGRETO));
    assert.equal(decifraSmtp(riga.passwordEnc), SEGRETO);
    assert.equal(riga.updatedById, user.id);
    const page = await browser.get('/master/posta');
    assert.doesNotMatch(page.body, new RegExp(SEGRETO));
    assert.match(page.body, /Le email partono dal server impostato in questa pagina/);
    assert.doesNotMatch(await posta(), NO_MAIL);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'POSTA_IMPOSTATA' } });
    assert.deepEqual(audit.meta, { porta: 2525, chiaveNuova: true });
    assert.doesNotMatch(JSON.stringify(audit), /login-prova|127\.0\.0\.1|xsmtpsib/);

    // An empty key keeps the saved one.
    const again = await browser.submit('/master/posta', '/master/posta', {
      ...form,
      password: '',
      porta: '587',
    });
    assert.equal(again.status, 303);
    const dopo = await prisma.postaPortale.findUniqueOrThrow({ where: { id: 'posta' } });
    assert.equal(dopo.porta, 587);
    assert.equal(decifraSmtp(dopo.passwordEnc), SEGRETO);

    // Another server or another login with the saved key: the key would go to a server we do not know.
    for (const altro of [{ host: '127.0.0.2' }, { utente: 'altro-login@smtp-brevo.com' }]) {
      const no = await browser.submit('/master/posta', '/master/posta', {
        ...form,
        ...altro,
        password: '',
      });
      assert.equal(no.status, 422);
      assert.match(no.body, /scrivi di nuovo la chiave SMTP/);
    }
    const fermo = await prisma.postaPortale.findUniqueOrThrow({ where: { id: 'posta' } });
    assert.equal(fermo.host, '127.0.0.1');
    assert.equal(fermo.utente, form.utente);
    // With the key written again it is saved.
    const nuovo = await browser.submit('/master/posta', '/master/posta', {
      ...form,
      host: '127.0.0.2',
    });
    assert.equal(nuovo.status, 303);
  });

  it('reports a failed test with its code only, and switches off', async () => {
    const { browser } = await signedIn('MASTER');
    // Nothing answers on this port of this machine: the test fails at the connection.
    await browser.submit('/master/posta', '/master/posta', { ...form, porta: '465' });
    const prova = await browser.submit('/master/posta', '/master/posta/prova', {});
    assert.equal(prova.status, 303);
    const page = await browser.get('/master/posta');
    assert.match(page.body, /Il server non ha accettato la prova \(codice [A-Z][A-Z0-9_]+\)/);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'POSTA_PROVA' } });
    assert.equal((audit.meta as { esito: string }).esito, 'errore');

    const off = await browser.submit('/master/posta', '/master/posta/disattiva', {});
    assert.equal(off.status, 303);
    assert.equal(
      (await prisma.postaPortale.findUniqueOrThrow({ where: { id: 'posta' } })).attiva,
      false,
    );
    assert.match(await posta(), NO_MAIL);
    assert.match(
      (await browser.get('/master/posta')).body,
      /Il server impostato qui è disattivato/,
    );
    assert.equal(await prisma.auditLog.count({ where: { action: 'POSTA_DISATTIVATA' } }), 1);
  });
});
