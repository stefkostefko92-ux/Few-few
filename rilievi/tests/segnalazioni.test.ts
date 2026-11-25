// The public form to report illegal content (art. 16 of Regulation (EU) 2022/2065; terms 2026-11-13, art. 25.5).
// Acceptance criteria (art. 16(2)): where the content is, why it is illegal, the name and email of the person —
// EXCEPT for the offences of arts. 3–7 of Directive 2011/93/EU (art. 16(2)(c)) —, the statement of good faith.
// A bot that fills the trap gets no hint; nothing over the limits is kept; control characters never reach a mail.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { leggiSegnalazione, LIMITI_SEGNALAZIONE, TRAPPOLA } from '../src/segnalazioni/form.js';

const valida = {
  dove: 'https://rilievi.carbonstealth.eu/schede/abc — la terza foto della sezione Quadro',
  motivo: 'La foto ritrae me e la mia targa senza alcuna base di legge.',
  nome: '  Maria   Rossi ',
  email: ' Maria.Rossi@Example.IT ',
  buonaFede: 'si',
};

describe('the report of illegal content', () => {
  it('is read, trimmed and normalised', () => {
    const r = leggiSegnalazione(valida);
    assert.equal(r.kind, 'ok');
    assert.deepEqual(r.kind === 'ok' && r.dati, {
      dove: valida.dove,
      motivo: valida.motivo,
      nome: 'Maria Rossi',
      email: 'maria.rossi@example.it',
      minori: false,
    });
  });

  it('asks for where, why, who and the statement of good faith', () => {
    const r = leggiSegnalazione({ dove: ' ', motivo: 'breve', nome: '', email: 'non-una-email' });
    assert.equal(r.kind, 'invalid');
    assert.deepEqual(r.kind === 'invalid' && r.errori, {
      dove: 'dove',
      motivo: 'motivo',
      nome: 'nome',
      email: 'email',
      buonaFede: 'buonaFede',
    });
    // What was written comes back to the form, the tick does not.
    assert.equal(r.kind === 'invalid' && r.valori.email, 'non-una-email');
    assert.equal(r.kind === 'invalid' && r.valori.buonaFede, false);
  });

  it('lets name and email empty only for child sexual abuse material (art. 16(2)(c))', () => {
    const senza = { dove: valida.dove, motivo: valida.motivo, buonaFede: 'si', minori: 'si' };
    const r = leggiSegnalazione(senza);
    assert.equal(r.kind, 'ok');
    assert.deepEqual(r.kind === 'ok' && [r.dati.nome, r.dati.email, r.dati.minori], [
      null,
      null,
      true,
    ]);
    // An email that is written must still be an email.
    const male = leggiSegnalazione({ ...senza, email: 'x@' });
    assert.deepEqual(male.kind === 'invalid' && male.errori, { email: 'email' });
  });

  it('gives a bot no hint and keeps nothing over the limits', () => {
    assert.deepEqual(leggiSegnalazione({ ...valida, [TRAPPOLA]: 'http://spam.example' }), {
      kind: 'spam',
    });
    const lungo = leggiSegnalazione({
      ...valida,
      dove: 'x'.repeat(LIMITI_SEGNALAZIONE.dove + 1),
      motivo: 'y'.repeat(LIMITI_SEGNALAZIONE.motivo + 1),
    });
    assert.deepEqual(lungo.kind === 'invalid' && lungo.errori, { dove: 'dove', motivo: 'motivo' });
    // Control characters and header tricks: the name is one line, the texts keep only their line breaks.
    const sporco = leggiSegnalazione({
      ...valida,
      nome: 'Maria\r\nBcc: altri@example.it',
      motivo: 'Riga uno\u0000\u0007\r\nRiga due — abbastanza lunga per essere un motivo.',
    });
    assert.equal(sporco.kind === 'ok' && sporco.dati.nome, 'Maria Bcc: altri@example.it');
    assert.equal(
      sporco.kind === 'ok' && sporco.dati.motivo,
      'Riga uno\nRiga due — abbastanza lunga per essere un motivo.',
    );
    for (const strano of [null, 42, {}, []])
      assert.equal(leggiSegnalazione({ ...valida, dove: strano }).kind, 'invalid');
  });
});
