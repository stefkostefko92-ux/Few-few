// A free note at the end of the sections of the sheet (the owner, 11 November 2026): "In Funi e tiranti
// metti campo di testo Note funi, tiranti e contrappeso … In Impianto metti campo di testo Note impianto".
// "Note impianto" already existed in "Note e lavori": it moved to "Impianto", same column, so what was
// written stays. Every note is a multi-line text, searchable, read from the form like the other notes.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { SEARCHABLE, SECTIONS } from '../src/schede/fields.js';
import { parseScheda } from '../src/schede/validation.js';

const t = translatorFor('it');

const NOTE = [
  ['impianto', 'noteImpianto', 'Note impianto'],
  ['ubicazione', 'ubicazioneNote', 'Note ubicazione e accesso'],
  ['tipologia', 'tipologiaNote', 'Note tipologia'],
  ['funi', 'funiNote', 'Note funi, tiranti e contrappeso'],
  ['limitatore', 'limitatoreNote', 'Note limitatore, tenditore, funicella'],
  ['allarme', 'allarmeNote', 'Note allarme e telesoccorso'],
] as const;

describe('the note of a section', () => {
  it('closes each of the six sections, with the name the owner gave it', () => {
    for (const [section, key, label] of NOTE) {
      const fields = SECTIONS.find((s) => s.key === section)!.fields;
      const last = fields.at(-1)!;
      assert.equal(last.key, key, section);
      assert.equal(last.kind, 'textarea', key);
      assert.equal('maxLength' in last && last.maxLength, 4000, key);
      assert.equal('wide' in last && last.wide, true, key);
      assert.ok(!('when' in last), `${key} is always shown`);
      assert.equal(t(`scheda.field.${key}`), label);
      assert.ok((SEARCHABLE as readonly string[]).includes(key), `${key} is searchable`);
    }
  });

  it('"Note impianto" left "Note e lavori": one field with that name in the sheet', () => {
    const owners = SECTIONS.filter((s) =>
      s.fields.some((f: { key: string }) => f.key === 'noteImpianto'),
    );
    assert.deepEqual(
      owners.map((s) => s.key),
      ['impianto'],
    );
  });

  it('is read from the form like the other notes: line breaks kept, control characters gone', () => {
    const form: Record<string, string> = { data: '2026-11-11', indirizzo: 'Via Roma 1, Milano' };
    for (const [, key] of NOTE) form[key] = `${key}\r\nseconda riga\u0007 `;
    const parsed = parseScheda(form);
    if (!parsed.ok) assert.fail(JSON.stringify(parsed.errors));
    for (const [, key] of NOTE) assert.equal(parsed.data[key], `${key}\nseconda riga`, key);
  });
});
