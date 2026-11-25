// The saved scheda leaves by email from its page (the owner, 13 November 2026). Acceptance criteria:
//  - who writes schede in the company sends it: the PDF (the same as the download) is attached, the reply goes
//    to the sender, an optional message is in the text; the address is not kept anywhere;
//  - a read-only person (CLIENTE) and a person of another company cannot; a scheda in the bin is not sent;
//  - an invalid address sends nothing and says so; the page offers the form only to who may send;
//  - what a sent email records is an audit row with the scheda and the company, without the address.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { registraInvioScheda } from '../../src/schede/invio.js';
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

before(startApp);
after(stopApp);

const HTML = { accept: 'text/html' };
const SURVEY = {
  data: '2026-11-13',
  numeroImpianto: '880022',
  matricola: 'MI 4321',
  indirizzo: 'Via Verdi 8, Milano',
  fermate: '4',
};

async function crea(browser: Browser, aziendaId: string): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', { ...SURVEY, azienda: aziendaId });
  assert.equal(reply.status, 303, reply.body.slice(0, 300));
  return reply.location.split('/').pop()!;
}

describe('the scheda by email', () => {
  it('leaves with its PDF, the reply to the sender and the message; the address is not kept', async () => {
    const azienda = await makeAzienda('Schede Email');
    const { browser, user } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser, azienda.id);
    const page = await browser.get(`/schede/${id}`, HTML);
    assert.match(page.body, new RegExp(`action="/schede/${id}/invia"`));
    assert.match(page.body, /href="#invia"/);

    outbox.length = 0;
    const sent = await browser.submit(`/schede/${id}`, `/schede/${id}/invia`, {
      email: 'condominio@example.it',
      messaggio: 'In allegato il rilievo di ieri.',
    });
    assert.equal(sent.status, 303);
    assert.equal(sent.location, `/schede/${id}`);
    const mail = outbox.find((m) => m.to === 'condominio@example.it');
    assert.ok(mail, 'the email with the PDF');
    assert.equal(mail.replyTo, user.email);
    assert.match(mail.subject, /880022/);
    assert.match(mail.text, /In allegato il rilievo di ieri\./);
    assert.match(mail.text, /Via Verdi 8, Milano/);
    const allegato = mail.attachments?.[0] as
      { filename: string; contentType: string; size?: number } | undefined;
    assert.equal(allegato?.filename, 'scheda-880022-2026-11-13.pdf');
    assert.equal(allegato?.contentType, 'application/pdf');
    assert.ok((allegato?.size ?? 0) > 1000, 'a real PDF');
    // Without SMTP (tests) nothing left and the page says why; nothing is recorded as sent.
    assert.equal(mail.result, 'disabled');
    assert.match(
      (await browser.get(sent.location, HTML)).body,
      /L&#39;invio delle email non è attivo/,
    );
    assert.equal(await prisma.auditLog.count({ where: { action: 'SCHEDA_EMAIL' } }), 0);

    // What a sent email records: the scheda and the company, never the address.
    await registraInvioScheda(user.id, { id, aziendaId: azienda.id }, { messaggio: true });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SCHEDA_EMAIL' } });
    assert.equal(audit.targetId, id);
    assert.equal(audit.aziendaId, azienda.id);
    assert.deepEqual(audit.meta, { messaggio: true });
    assert.doesNotMatch(JSON.stringify(audit), /condominio@example/);
    const scheda = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.doesNotMatch(JSON.stringify(scheda), /condominio@example/);
  });

  it('sends nothing to an invalid address, and says so', async () => {
    const azienda = await makeAzienda('Schede Email Errori');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await crea(browser, azienda.id);
    outbox.length = 0;
    for (const email of ['', 'non-un-indirizzo', 'a@b.it\nBcc: x@y.z']) {
      const no = await browser.submit(`/schede/${id}`, `/schede/${id}/invia`, { email });
      assert.equal(no.status, 303);
      assert.equal(no.location, `/schede/${id}#invia`);
      assert.match(
        (await browser.get(`/schede/${id}`, HTML)).body,
        /Scrivi un indirizzo email valido/,
      );
    }
    // A message over the limit is named as such, not as a wrong address.
    const lungo = await browser.submit(`/schede/${id}`, `/schede/${id}/invia`, {
      email: 'condominio@example.it',
      messaggio: 'x'.repeat(2001),
    });
    assert.equal(lungo.location, `/schede/${id}#invia`);
    assert.match((await browser.get(`/schede/${id}`, HTML)).body, /Il messaggio è troppo lungo/);
    assert.equal(outbox.length, 0);
  });

  it('is only for who writes schede in that company, and not from the bin', async () => {
    const azienda = await makeAzienda('Schede Email Permessi');
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const id = await crea(tecnico, azienda.id);
    const corpo = { email: 'condominio@example.it' };
    outbox.length = 0;

    // Read-only: sees the scheda, not the form, and cannot send (the token comes from another page).
    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    const vista = await cliente.get(`/schede/${id}`, HTML);
    assert.equal(vista.status, 200);
    assert.doesNotMatch(vista.body, /\/invia"|href="#invia"/);
    assert.equal((await cliente.submit('/account', `/schede/${id}/invia`, corpo)).status, 403);

    // Another company: the scheda does not exist for them.
    const altra = await makeAzienda('Altra Email');
    const { browser: estraneo } = await signedIn('TECNICO', altra.id);
    assert.equal((await estraneo.submit('/account', `/schede/${id}/invia`, corpo)).status, 404);

    // Without the token of the form nothing leaves.
    const { browser: collega } = await signedIn('TECNICO', azienda.id);
    assert.equal((await collega.post(`/schede/${id}/invia`, corpo)).status, 403);

    // In the bin: not sent, and the page has no form.
    const admin = await makeUser('ADMIN', undefined, azienda.id);
    const capo = new Browser();
    await capo.login(admin.email);
    await prisma.scheda.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: admin.id },
    });
    const cestino = await capo.get(`/schede/${id}`, HTML);
    assert.equal(cestino.status, 200);
    assert.doesNotMatch(cestino.body, /\/invia"/);
    assert.equal((await capo.submit(`/schede/${id}`, `/schede/${id}/invia`, corpo)).status, 404);
    assert.equal(outbox.length, 0);
  });
});
