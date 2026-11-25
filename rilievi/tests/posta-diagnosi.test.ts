// Why an email did not leave: the portal names the step that failed (connection, encryption, login, sender,
// recipient, message) and keeps the server's own reply for the MASTER page. The errors are the real ones
// nodemailer raises against a scripted SMTP server — not hand-written look-alikes.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import nodemailer from 'nodemailer';
import { diagnosiPosta, FASI_POSTA } from '../src/mail/diagnosi.js';
import { portaChiusa, smtpFinto, type Copione } from './smtp-finto.js';

/** Sends one message to the scripted server and returns what went wrong (null — it left). */
async function errore(copione: Copione, opzioni: { tls?: boolean } = {}): Promise<unknown> {
  const server = await smtpFinto(copione);
  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: server.port,
    secure: false,
    ...(opzioni.tls ? { requireTLS: true } : { ignoreTLS: true }),
    auth: { user: 'login@smtp-brevo.com', pass: 'chiave-di-prova' },
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 3000,
  });
  try {
    await transport.verify();
    await transport.sendMail({
      from: 'no-reply@carbonstealth.eu',
      to: 'destinatario@example.it',
      subject: 'Prova',
      text: 'Prova',
    });
    return null;
  } catch (error) {
    return error;
  } finally {
    transport.close();
    await server.close();
  }
}

describe('the diagnosis of a failed email', () => {
  it('lets a message through the scripted server (the script itself works)', async () => {
    assert.equal(await errore({}), null);
  });

  it('names the login when the server refuses the credentials', async () => {
    const d = diagnosiPosta(await errore({ AUTH: '535 5.7.8 Authentication failed' }));
    assert.equal(d.fase, 'accesso');
    assert.equal(d.codice, 'EAUTH');
    assert.equal(d.risposta, 535);
    assert.equal(d.testo, '535 5.7.8 Authentication failed');
  });

  it('keeps the reply of a server that refuses the address of the machine', async () => {
    const d = diagnosiPosta(await errore({ AUTH: '525 5.7.1 Unauthorized IP address' }));
    assert.equal(d.fase, 'accesso');
    assert.equal(d.risposta, 525);
    assert.match(d.testo ?? '', /Unauthorized IP address/);
  });

  it('names the sender, the recipient and the message', async () => {
    const mittente = diagnosiPosta(await errore({ MAIL: '550 5.7.1 Sender not valid' }));
    assert.equal(mittente.fase, 'mittente');
    assert.equal(mittente.risposta, 550);
    const destinatario = diagnosiPosta(await errore({ RCPT: '550 5.1.1 User unknown' }));
    assert.equal(destinatario.fase, 'destinatario');
    const messaggio = diagnosiPosta(await errore({ corpo: '554 5.7.1 Message rejected' }));
    assert.equal(messaggio.fase, 'messaggio');
    assert.equal(messaggio.risposta, 554);
  });

  it('names the encryption when STARTTLS is refused', async () => {
    const d = diagnosiPosta(await errore({}, { tls: true }));
    assert.equal(d.fase, 'tls');
    assert.equal(d.codice, 'ETLS');
  });

  it('names the connection when nothing answers, with the system code', async () => {
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: await portaChiusa(),
      secure: false,
      connectionTimeout: 3000,
    });
    const d = diagnosiPosta(
      await transport.verify().then(
        () => null,
        (e: unknown) => e,
      ),
    );
    transport.close();
    assert.equal(d.fase, 'connessione');
    assert.equal(d.origine, 'ECONNREFUSED');
    assert.equal(d.risposta, null);
    assert.equal(d.testo, null);
  });

  it('does not call it a connection problem when the server answered with a refusal', async () => {
    const d = diagnosiPosta(await errore({ saluto: '554 5.7.1 Service unavailable' }));
    assert.equal(d.fase, 'altro');
    assert.equal(d.risposta, 554);
    assert.match(d.testo ?? '', /Service unavailable/);
  });

  it('reads the certificate errors of a TLS port as encryption', () => {
    for (const originalCode of ['DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_SSL_WRONG_VERSION_NUMBER'])
      assert.equal(diagnosiPosta({ code: 'ESOCKET', originalCode, command: 'CONN' }).fase, 'tls');
    assert.equal(diagnosiPosta({ code: 'ETIMEDOUT', command: 'CONN' }).fase, 'connessione');
    assert.equal(diagnosiPosta({ code: 'EDNS', command: 'CONN' }).fase, 'connessione');
  });

  it('never trusts the shape of what was thrown', () => {
    for (const cosa of [null, undefined, 'boom', 42, {}, { code: 5, response: { a: 1 } }]) {
      const d = diagnosiPosta(cosa);
      assert.equal(d.fase, 'altro');
      assert.equal(d.codice, 'EERRORE');
      assert.equal(d.risposta, null);
      assert.equal(d.testo, null);
    }
    assert.equal(diagnosiPosta({ code: 'not a code!' }).codice, 'EERRORE');
  });

  it('keeps the reply on one short line, without control characters', () => {
    const d = diagnosiPosta({
      code: 'EAUTH',
      command: 'AUTH PLAIN',
      responseCode: 535,
      response: `535-5.7.8 riga uno\r\n535 5.7.8 riga\tdue\u0000\u001b[31m ${'x'.repeat(600)}`,
    });
    assert.ok(d.testo);
    assert.doesNotMatch(d.testo, /[\u0000-\u001f\u007f]/);
    assert.ok(d.testo.length <= 300);
    assert.match(d.testo, /^535-5\.7\.8 riga uno 535 5\.7\.8 riga due/);
  });

  it('has a known step for every diagnosis', () => {
    assert.deepEqual(
      [...FASI_POSTA].sort(),
      ['accesso', 'altro', 'connessione', 'destinatario', 'messaggio', 'mittente', 'tls'].sort(),
    );
  });
});
