// The payments console of MASTER (#31 — "configure fully from the master settings, in the easiest way, and switch
// payments on and off"): Revolut Business on or off, sandbox or production, the API secret key written once and
// never shown (stored encrypted), the webhook registered with one button (its signing secret stored encrypted),
// and the plans (level by people, months, price without VAT in euro) — switched off, never deleted.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { avviaRevolutFinto, CHIAVE, fermaRevolutFinto, webhook } from './revolut-finto.js';

await avviaRevolutFinto();
const { BASE, outbox, PASSWORD, prisma, signedIn, startApp, stopApp } =
  await import('./harness.js');
const { decifraRevolut } = await import('../../src/auth/chiavi.js');

before(startApp);
after(async () => {
  await stopApp();
  await fermaRevolutFinto();
});

const HTML = { accept: 'text/html' };

describe('the payments console', () => {
  it('belongs to MASTER only', async () => {
    const { browser } = await signedIn('ADMIN');
    assert.equal((await browser.get('/master/pagamenti', HTML)).status, 403);
  });

  it('stores the key encrypted, never shows it, registers the webhook', async () => {
    const { browser } = await signedIn('MASTER');
    const page = await browser.get('/master/pagamenti', HTML);
    assert.equal(page.status, 200);
    assert.match(page.body, /I pagamenti non sono attivi/);
    // On without a key: refused.
    const senza = await browser.submit('/master/pagamenti', '/master/pagamenti', {
      attivo: '1',
      ambiente: 'SANDBOX',
      chiave: '',
    });
    assert.equal(senza.status, 422);
    // A new key only with the password of the MASTER (a stolen session does not redirect the payments).
    for (const password of ['', 'sbagliata-123456']) {
      const no = await browser.submit('/master/pagamenti', '/master/pagamenti', {
        attivo: '1',
        ambiente: 'SANDBOX',
        chiave: CHIAVE,
        password,
      });
      assert.equal(no.status, 422);
      assert.match(no.body, /scrivi la tua password/);
    }
    assert.equal(await prisma.configPagamenti.count(), 0);
    const prima = outbox.length;
    const ok = await browser.submit('/master/pagamenti', '/master/pagamenti', {
      attivo: '1',
      ambiente: 'SANDBOX',
      chiave: CHIAVE,
      password: PASSWORD,
    });
    assert.equal(ok.status, 303);
    // Every MASTER is told, without the key.
    const avvisi = outbox.slice(prima).filter((m) => /impostazioni di Revolut/.test(m.subject));
    assert.ok(avvisi.length >= 1);
    assert.doesNotMatch(JSON.stringify(avvisi), new RegExp(CHIAVE));
    const riga = await prisma.configPagamenti.findUniqueOrThrow({ where: { id: 'revolut' } });
    assert.equal(riga.attivo, true);
    assert.ok(riga.chiaveEnc && !riga.chiaveEnc.includes(CHIAVE));
    assert.equal(decifraRevolut(riga.chiaveEnc), CHIAVE);
    const dopo = await browser.get('/master/pagamenti', HTML);
    assert.doesNotMatch(dopo.body, new RegExp(CHIAVE));
    assert.match(dopo.body, /I pagamenti sono attivi/);

    const reg = await browser.submit('/master/pagamenti', '/master/pagamenti/webhook', {});
    assert.equal(reg.status, 303);
    assert.equal(webhook.url, `${BASE}/webhook/revolut`);
    const conWebhook = await prisma.configPagamenti.findUniqueOrThrow({ where: { id: 'revolut' } });
    assert.equal(conWebhook.webhookId, 'wh-1');
    assert.ok(conWebhook.webhookSegretoEnc && !conWebhook.webhookSegretoEnc.startsWith('wsk_'));
    // Registered again: the old one is removed first (Revolut keeps at most 10).
    await browser.submit('/master/pagamenti', '/master/pagamenti/webhook', {});
    assert.deepEqual(webhook.eliminati, ['wh-1']);
    assert.equal(
      (await prisma.configPagamenti.findUniqueOrThrow({ where: { id: 'revolut' } })).webhookId,
      'wh-2',
    );

    // An empty key keeps the saved one; off keeps everything for later.
    await browser.submit('/master/pagamenti', '/master/pagamenti', {
      attivo: '',
      ambiente: 'SANDBOX',
      chiave: '',
    });
    const spento = await prisma.configPagamenti.findUniqueOrThrow({ where: { id: 'revolut' } });
    assert.equal(spento.attivo, false);
    assert.equal(decifraRevolut(spento.chiaveEnc!), CHIAVE);
    const audit = await prisma.auditLog.findMany({ where: { action: 'PAGAMENTI_IMPOSTATI' } });
    assert.ok(audit.length >= 2);
    assert.doesNotMatch(JSON.stringify(audit), /sk_test|wsk_/);
  });

  it('creates plans in euro without VAT and switches them off, never deleting', async () => {
    const { browser } = await signedIn('MASTER');
    const male = await browser.submit('/master/pagamenti', '/master/pagamenti/piani', {
      livello: '4',
      mesi: '0',
      prezzo: 'gratis',
    });
    assert.equal(male.status, 422);
    const ok = await browser.submit('/master/pagamenti', '/master/pagamenti/piani', {
      livello: '2',
      mesi: '12',
      prezzo: '1.290,50',
    });
    assert.equal(ok.status, 303);
    const piano = await prisma.pianoAbbonamento.findFirstOrThrow({ where: { livello: 2 } });
    assert.equal(piano.prezzoCent, 129050);
    assert.equal(piano.mesi, 12);
    const page = await browser.get('/master/pagamenti', HTML);
    assert.match(page.body, /1\.290,50 €/);
    const off = await browser.submit('/master/pagamenti', `/master/pagamenti/piani/${piano.id}`, {
      attivo: '',
    });
    assert.equal(off.status, 303);
    const spento = await prisma.pianoAbbonamento.findUniqueOrThrow({ where: { id: piano.id } });
    assert.equal(spento.attivo, false);
  });
});
