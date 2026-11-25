// The signature of the terms when the mail of the portal does not work (the owner, 13 November 2026: "le email
// non partono … Controlla le email e tutto quanto delle firme"). The code travels only by email, so:
//  - a code that did not leave is not a pending signature: the administrator is told and can try again;
//  - a failed sending does not use up the codes of the hour (5), nor the minute between two codes;
//  - as soon as the mail works again the same person signs, with nothing left over from the failures.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { versioneDaFirmare, VERSIONE } from '../../src/legale/versioni.js';
import { smtpFinto } from '../smtp-finto.js';
import { makeAzienda, outbox, PASSWORD, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const ACCETTA = '/condizioni/accetta';
const FIRMA = '/condizioni/firma';
const SERVER = {
  host: '127.0.0.1',
  porta: '2525',
  utente: 'login-prova@smtp-brevo.com',
  password: 'xsmtpsib-prova-0123456789abcdef',
  passwordAccount: PASSWORD,
  mittenteNome: 'Rilievi Impianti',
  mittenteEmail: 'no-reply@carbonstealth.eu',
};
const PASSO_1 = {
  versioneCondizioni: versioneDaFirmare('CONDIZIONI'),
  versioneRegole: VERSIONE.REGOLE,
  ragioneSociale: 'Ascensori Prova S.r.l.',
  sede: 'Via Roma 12, 20121 Milano (MI)',
  partitaIva: 'IT01234567890',
  condizioni: 'si',
  regole: 'si',
  next: '/schede',
};
const codici = (userId: string) => prisma.firmaCondizioni.count({ where: { userId } });

describe('the signature of the terms while the mail of the portal fails', () => {
  it('tells the administrator, keeps no pending code and no used-up attempt, then works again', async () => {
    const { browser: master } = await signedIn('MASTER');
    const azienda = await makeAzienda();
    await prisma.azienda.update({ where: { id: azienda.id }, data: { condizioniVersione: null } });
    const { browser, user } = await signedIn('ADMIN', azienda.id);

    // A server that refuses the encryption: every email of the portal fails.
    const finto = await smtpFinto({}, 2525);
    try {
      assert.equal((await master.submit('/master/posta', '/master/posta', SERVER)).status, 303);
      for (let n = 0; n < 7; n += 1) {
        const no = await browser.submit(ACCETTA, ACCETTA, PASSO_1);
        assert.equal(no.status, 502, `try ${n + 1}`);
        assert.match(no.body, /Non siamo riusciti a inviare il codice per email/);
        assert.equal(await codici(user.id), 0, 'no code is waiting');
      }
      assert.equal((await browser.get(FIRMA)).status, 303, 'nothing to sign yet');
    } finally {
      await finto.close();
    }

    // The mail is back (here: switched off, the code is shown in the test environment).
    await master.submit('/master/posta', '/master/posta/disattiva', {});
    const ok = await browser.submit(ACCETTA, ACCETTA, PASSO_1);
    assert.equal(ok.status, 303);
    assert.equal(ok.location, `${FIRMA}?next=%2Fschede`);
    assert.equal(await codici(user.id), 1);

    // A new code a minute later, while the mail fails again: the undelivered one is dropped, the hour's
    // count stays at the one code that did leave, and the administrator starts again from the first step.
    await prisma.firmaCondizioni.updateMany({
      where: { userId: user.id },
      data: { inviatoAt: new Date(Date.now() - 2 * 60_000) },
    });
    const finto2 = await smtpFinto({}, 2525);
    try {
      await master.submit('/master/posta', '/master/posta', SERVER);
      const nuovo = await browser.submit(FIRMA, `${FIRMA}/nuovo-codice`, { next: '/schede' });
      assert.equal(nuovo.status, 303);
      assert.equal(nuovo.location, `${ACCETTA}?next=%2Fschede`);
      assert.match(
        (await browser.get(nuovo.location)).body,
        /Non siamo riusciti a inviare il codice/,
      );
      assert.equal(await codici(user.id), 1, 'only the code that left counts');
      assert.equal(
        await prisma.firmaCondizioni.count({ where: { userId: user.id, usataAt: null } }),
        0,
        'the earlier code was replaced: nothing is left to type',
      );
    } finally {
      await finto2.close();
    }

    // The mail works: the whole signature, at the first try.
    await master.submit('/master/posta', '/master/posta/disattiva', {});
    const passo1 = await browser.submit(ACCETTA, ACCETTA, PASSO_1);
    assert.equal(passo1.status, 303);
    assert.equal(passo1.location, `${FIRMA}?next=%2Fschede`);
    const mail = outbox.filter((m) => m.to === user.email).at(-1);
    const codice = /\b(\d{6})\b/.exec(mail?.text ?? '')?.[1];
    assert.ok(codice);
    const firmata = await browser.submit(FIRMA, FIRMA, { clausole: 'si', codice, next: '/schede' });
    assert.equal(firmata.status, 303);
    assert.equal(firmata.location, '/schede');
    const dopo = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(dopo.condizioniVersione, versioneDaFirmare('CONDIZIONI'));
  });
});
