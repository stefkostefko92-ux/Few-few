// The owner's 24 October 2026 pass: the push-button panels in a section of their own, chosen when needed
// ("Bottoniere da sostituire?" — a note on "Sì"), in the print selection, in the company's order and on
// the landing drawing like every other section.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { SEARCHABLE, SECTIONS } from '../src/schede/fields.js';
import { ORDINABILI } from '../src/schede/ordine.js';
import { stampaFromBody } from '../src/schede/stampa.js';
import { parseScheda } from '../src/schede/validation.js';
import { sheetLegend } from '../src/site/landing.js';

const minimal = { data: '2026-10-24', matricola: '33871' };
const t = translatorFor('it');

function parsedOrFail(body: Record<string, unknown>) {
  const result = parseScheda(body);
  if (!result.ok) assert.fail(`expected a valid sheet, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

describe('the push-button panels', () => {
  it('ask whether they are to replace, and take the note only on "Sì"', () => {
    const note = 'Bottoniere di piano in acciaio, pulsanti a fungo.';
    const yes = parsedOrFail({ ...minimal, bottoniereSostituire: 'si', bottoniereNote: note });
    assert.deepEqual([yes.bottoniereSostituire, yes.bottoniereNote], [true, note]);
    for (const bottoniereSostituire of ['no', '']) {
      const data = parsedOrFail({ ...minimal, bottoniereSostituire, bottoniereNote: note });
      assert.equal(data.bottoniereNote, null, bottoniereSostituire);
    }
    const tooLong = parseScheda({
      ...minimal,
      bottoniereSostituire: 'si',
      bottoniereNote: 'x'.repeat(4001),
    });
    assert.equal(!tooLong.ok && tooLong.errors.bottoniereNote, 'tooLong');
  });

  it('are a section of their own, before the notes, named as the owner wrote it', () => {
    const keys = SECTIONS.map((s) => s.key);
    assert.equal(keys.indexOf('bottoniere'), keys.indexOf('note') - 1);
    assert.equal(t('scheda.section.bottoniere'), 'Bottoniere');
    assert.equal(t('scheda.question.bottoniereSostituire'), 'Bottoniere da sostituire?');
    assert.equal(t('scheda.field.bottoniereNote'), 'Note bottoniere');
    assert.ok((SEARCHABLE as readonly string[]).includes('bottoniereNote'));
    // The note on the panels in service and the old measures stay in the notes.
    const note = SECTIONS.find((s) => s.key === 'note')!.fields.map((f) => f.key);
    assert.ok(note.includes('noteBottoniere') && note.includes('bottoniereMisure'));
  });

  it('can be left out of the print, moved in the company order and found on the landing drawing', () => {
    assert.ok(stampaFromBody({}).includes('bottoniere'));
    assert.ok((ORDINABILI as readonly string[]).includes('bottoniere'));
    const legend = sheetLegend(t).find((s) => s.key === 'bottoniere');
    assert.equal(legend?.title, 'Bottoniere');
    const shaft = readFileSync('views/site/_shaft.ejs', 'utf8');
    for (const section of SECTIONS) {
      assert.match(
        shaft,
        new RegExp(`\\n\\s+${section.key}: \\[\\[`),
        `a marker for ${section.key}`,
      );
    }
  });
});
