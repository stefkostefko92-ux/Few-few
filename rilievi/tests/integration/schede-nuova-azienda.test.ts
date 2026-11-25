// A new sheet sent back (422) by someone who writes in more than one company: the page that comes back
// is filled only for a company of theirs. Sent with the id of another company, it carried that company's
// details (name, address, phone, e-mail, VAT number) into the page — audit, 4 November 2026.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, makeUser, prisma, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const dati = (nome: string, email: string) => ({
  ragioneSociale: nome,
  indirizzo: 'Via Riservata 9',
  cap: '20100',
  citta: 'Milano',
  provincia: 'MI',
  telefono: '+39 02 000000',
  email,
  partitaIva: 'IT01234567890',
  sito: '',
});

describe('a new sheet sent back', () => {
  it('never shows the details of a company that is not the writer’s', async () => {
    const [mia, altra, estranea] = [await makeAzienda(), await makeAzienda(), await makeAzienda()];
    await prisma.azienda.update({
      where: { id: mia.id },
      data: { datiSocietari: dati('Mia Ascensori S.r.l.', 'ufficio@mia.test') },
    });
    await prisma.azienda.update({
      where: { id: estranea.id },
      data: { datiSocietari: dati('Estranea Segreta S.p.A.', 'riservato@estranea.test') },
    });
    const user = await makeUser('TECNICO', undefined, mia.id);
    await prisma.membership.create({
      data: { userId: user.id, aziendaId: altra.id, role: 'TECNICO' },
    });
    const browser = new Browser();
    assert.equal((await browser.login(user.email)).status, 302);

    const forged = await browser.submit('/schede/nuova', '/schede', {
      data: '2026-11-04',
      matricola: '0099',
      azienda: estranea.id,
    });
    assert.equal(forged.status, 422);
    assert.doesNotMatch(forged.body, /Estranea Segreta/);
    assert.doesNotMatch(forged.body, /riservato@estranea\.test/);
    assert.doesNotMatch(forged.body, new RegExp(estranea.id));

    // A company of theirs, sent back for another reason: its details are there for the forms.
    const own = await browser.submit('/schede/nuova', '/schede', {
      data: 'non-una-data',
      matricola: '0099',
      azienda: mia.id,
    });
    assert.equal(own.status, 422);
    assert.match(own.body, /Mia Ascensori S\.r\.l\./);
  });
});
