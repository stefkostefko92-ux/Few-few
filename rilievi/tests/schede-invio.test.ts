// The saved scheda by email from the portal (the owner, 13 November 2026: "Искам да имам опция да изпращам
// запазената вече scheda по емайл директно от портала"). What is checked here, without a database: the form
// (an address, an optional message), the size the PDF may have as an attachment, and the email itself — who
// sends, which plant, the PDF attached, the reply going to the person who sent it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { schedaMail } from '../src/mail/templates-schede.js';
import { invioSchema, MAX_PDF_EMAIL, troppoGrande } from '../src/schede/invio.js';

describe('the scheda by email', () => {
  it('needs a valid address and takes an optional message', () => {
    assert.equal(invioSchema.safeParse({}).success, false);
    assert.equal(invioSchema.safeParse({ email: 'non-un-indirizzo' }).success, false);
    assert.equal(invioSchema.safeParse({ email: 'a@b.it\r\nBcc: x@y.z' }).success, false);
    assert.equal(invioSchema.safeParse({ email: `${'a'.repeat(250)}@b.it` }).success, false);
    const solo = invioSchema.parse({ email: '  cliente@example.it ' });
    assert.equal(solo.email, 'cliente@example.it');
    assert.equal(solo.messaggio, undefined);
    const con = invioSchema.parse({
      email: 'cliente@example.it',
      messaggio: '  Riga 1\r\nRiga 2  ',
    });
    assert.equal(con.messaggio, 'Riga 1\nRiga 2');
    assert.equal(
      invioSchema.safeParse({ email: 'cliente@example.it', messaggio: 'x'.repeat(2001) }).success,
      false,
    );
    // The browser counts a line break as one character and sends two (CRLF): 2000 typed characters with
    // line breaks are accepted, as the field promises (the review of 13 November 2026).
    const righe = Array.from({ length: 40 }, () => 'x'.repeat(49)).join('\r\n');
    assert.equal(righe.replace(/\r\n/g, '\n').length, 1999);
    assert.ok(righe.length > 2000);
    assert.equal(
      invioSchema.safeParse({ email: 'cliente@example.it', messaggio: righe }).success,
      true,
    );
  });

  it('keeps the attachment under what the mail provider takes', () => {
    assert.equal(MAX_PDF_EMAIL, 4 * 1024 * 1024);
    assert.equal(troppoGrande(MAX_PDF_EMAIL), false);
    assert.equal(troppoGrande(MAX_PDF_EMAIL + 1), true);
  });

  it('says who sends which plant, attaches the PDF and answers to the sender', () => {
    const pdf = Buffer.from('%PDF-1.7 prova');
    const mail = schedaMail({
      to: 'cliente@example.it',
      replyTo: 'tecnico@ascensori.example',
      impianto: 'Impianto n° 880011',
      indirizzo: 'Via Roma 1, Torino',
      azienda: 'Ascensori Prova S.r.l.',
      mittente: 'Mario Rossi',
      messaggio: 'Come da accordi.',
      pdf,
      filename: 'scheda-880011-2026-11-13.pdf',
    });
    assert.equal(mail.to, 'cliente@example.it');
    assert.equal(mail.replyTo, 'tecnico@ascensori.example');
    assert.match(mail.subject, /Impianto n° 880011/);
    assert.match(mail.subject, /Ascensori Prova S\.r\.l\./);
    assert.match(mail.text, /Mario Rossi/);
    assert.match(mail.text, /Via Roma 1, Torino/);
    assert.match(mail.text, /Come da accordi\./);
    assert.deepEqual(mail.attachments, [
      { filename: 'scheda-880011-2026-11-13.pdf', content: pdf, contentType: 'application/pdf' },
    ]);
    // Without a message and without an address of the plant: nothing empty is left in the text.
    const breve = schedaMail({
      to: 'cliente@example.it',
      replyTo: 'tecnico@ascensori.example',
      impianto: 'Impianto n° 12',
      indirizzo: null,
      azienda: 'Ascensori Prova S.r.l.',
      mittente: 'Mario Rossi',
      messaggio: null,
      pdf,
      filename: 'scheda-12.pdf',
    });
    assert.doesNotMatch(breve.text, /\n{3,}|undefined|null|\{\w+\}/);
    assert.doesNotMatch(breve.subject, /[\r\n]/);
  });

  it('never lets a line break of the plant into the subject', () => {
    const mail = schedaMail({
      to: 'cliente@example.it',
      replyTo: 'tecnico@ascensori.example',
      impianto: 'Via Roma 1\r\nBcc: altri@example.it',
      indirizzo: null,
      azienda: 'Ascensori\nProva',
      mittente: 'Mario Rossi',
      messaggio: null,
      pdf: Buffer.alloc(1),
      filename: 'scheda.pdf',
    });
    assert.doesNotMatch(mail.subject, /[\r\n]/);
  });
});
