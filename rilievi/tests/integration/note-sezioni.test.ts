// The notes at the end of six sections against a real database (the owner, 11 November 2026): saved with
// the sheet, shown on its page, found by the search, printed in their section; "Note impianto" — whose
// section is not printed on its own — under the plate of the print and the PDF, even when "Note e lavori"
// is left out of the print.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const NOTE = {
  noteImpianto: 'Impianto del 1978, targa ossidata',
  ubicazioneNote: 'Chiavi del locale dal portiere',
  tipologiaNote: 'Porte di piano verniciate di recente',
  funiNote: 'Contrappeso con due blocchi mancanti',
  limitatoreNote: 'Funicella sfilacciata vicino al tenditore',
  allarmeNote: 'Combinatore GSM senza credito',
};

describe('the notes of the sections', () => {
  it('are saved, shown, searched and printed — "Note impianto" under the plate', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      data: '2026-11-11',
      indirizzo: 'Via delle Note 7, Milano',
      matricola: `NS${Date.now().toString().slice(-7)}`,
      ...NOTE,
      // Every section in the print except "Note e lavori".
      'stampa-_': '1',
      stampa: ['ubicazione', 'tipologia', 'funi', 'limitatore', 'allarme'],
    });
    assert.equal(reply.status, 303);
    const id = /^\/schede\/([a-z0-9]+)$/.exec(reply.location)![1]!;

    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    for (const [key, value] of Object.entries(NOTE))
      assert.equal(row[key as keyof typeof NOTE], value, key);

    const page = await browser.get(`/schede/${id}`);
    for (const value of Object.values(NOTE)) assert.ok(page.body.includes(value), value);

    const found = await browser.get('/schede?q=funicella+sfilacciata');
    assert.ok(found.body.includes(`/schede/${id}`), 'the search reads the notes');

    const print = await browser.get(`/schede/${id}/stampa`);
    for (const value of Object.values(NOTE)) assert.ok(print.body.includes(value), value);
    assert.ok(
      print.body.indexOf(NOTE.noteImpianto) < print.body.indexOf('<h2>Ubicazione e accesso</h2>'),
      'the note of the lift is under the plate, before the first section',
    );

    const pdf = await browser.get(`/schede/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
  });

  it('leave the print without "Note impianto" when it is empty', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      data: '2026-11-11',
      indirizzo: 'Via Senza Note 1, Milano',
    });
    const id = /^\/schede\/([a-z0-9]+)$/.exec(reply.location)![1]!;
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.doesNotMatch(print.body, /paper__nota-impianto/);
  });
});
