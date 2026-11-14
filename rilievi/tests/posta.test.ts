// The portal's email server set from the MASTER console (the owner, 12 November 2026 — "configurare il server
// Brevo per le email dal Master Account"): the form is read strictly — a public host name in production (no IP,
// no localhost: the console is not a port scanner), only the SMTP ports Brevo uses, a login and a key without
// line breaks, a sender name that cannot smuggle headers; an empty key keeps the saved one.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { leggiFormPosta, PORTE_SMTP } from '../src/mail/posta-form.js';

const base = {
  host: 'smtp-relay.brevo.com',
  porta: '2525',
  utente: '8a1b2c001@smtp-brevo.com',
  password: 'xsmtpsib-0123456789abcdef',
  mittenteNome: 'Rilievi Impianti',
  mittenteEmail: 'no-reply@carbonstealth.eu',
};

describe('the email server form', () => {
  it('takes a complete Brevo configuration', () => {
    const esito = leggiFormPosta(base, { produzione: true, passwordSalvata: false });
    assert.deepEqual(esito, {
      ok: true,
      valori: {
        host: 'smtp-relay.brevo.com',
        porta: 2525,
        utente: '8a1b2c001@smtp-brevo.com',
        password: 'xsmtpsib-0123456789abcdef',
        mittenteNome: 'Rilievi Impianti',
        mittenteEmail: 'no-reply@carbonstealth.eu',
      },
    });
    assert.deepEqual([...PORTE_SMTP], [587, 2525, 465]);
  });

  it('keeps the saved key when the field is left empty, asks for one otherwise', () => {
    const tenuta = leggiFormPosta(
      { ...base, password: '' },
      { produzione: true, passwordSalvata: true },
    );
    assert.equal(tenuta.ok && tenuta.valori.password, null);
    const manca = leggiFormPosta(
      { ...base, password: '' },
      { produzione: true, passwordSalvata: false },
    );
    assert.deepEqual(manca.ok ? null : manca.errori, { password: 'posta.errore.password' });
  });

  it('refuses hosts that are not public names in production', () => {
    for (const host of [
      '127.0.0.1',
      'localhost',
      '10.0.0.5',
      '[::1]',
      'db',
      'smtp.brevo.com:25',
      'http://smtp.brevo.com',
      '-a.com',
    ]) {
      const esito = leggiFormPosta({ ...base, host }, { produzione: true, passwordSalvata: true });
      assert.deepEqual(esito.ok ? null : esito.errori, { host: 'posta.errore.host' }, host);
    }
    // Outside production the tests run their own server on this machine.
    assert.ok(
      leggiFormPosta({ ...base, host: '127.0.0.1' }, { produzione: false, passwordSalvata: true })
        .ok,
    );
  });

  it('refuses other ports, header smuggling and over-long values', () => {
    const casi: Array<[Record<string, string>, string]> = [
      [{ porta: '25' }, 'porta'],
      [{ porta: '22' }, 'porta'],
      [{ porta: 'x' }, 'porta'],
      [{ utente: '' }, 'utente'],
      [{ utente: 'a b@x.it' }, 'utente'],
      [{ utente: 'a'.repeat(255) }, 'utente'],
      [{ password: 'abc\r\nRCPT TO:<x@y.z>' }, 'password'],
      [{ password: 'a'.repeat(513) }, 'password'],
      [{ mittenteNome: 'Rilievi\r\nBcc: x@y.z' }, 'mittenteNome'],
      [{ mittenteNome: 'Rilievi <x@y.z>' }, 'mittenteNome'],
      [{ mittenteNome: '' }, 'mittenteNome'],
      [{ mittenteEmail: 'non-una-email' }, 'mittenteEmail'],
      [{ mittenteEmail: 'a@b.it\r\nBcc: x@y.z' }, 'mittenteEmail'],
    ];
    for (const [cambio, campo] of casi) {
      const esito = leggiFormPosta(
        { ...base, ...cambio },
        { produzione: true, passwordSalvata: true },
      );
      assert.equal(esito.ok, false, JSON.stringify(cambio));
      assert.ok(!esito.ok && campo in esito.errori, `${JSON.stringify(cambio)} → ${campo}`);
    }
  });
});
