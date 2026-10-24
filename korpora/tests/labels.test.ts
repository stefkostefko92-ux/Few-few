import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, translatorFor } from '../src/i18n.js';
import { customerLabel, displayLabel, LABEL } from '../src/labels.js';

test('history labels are stored as tokens and shown in the language of the page', () => {
  assert.equal(displayLabel(LABEL.system, translatorFor('bg')), 'система');
  assert.equal(displayLabel(LABEL.system, translatorFor('en')), 'system');
  assert.equal(displayLabel(customerLabel('c123'), translatorFor('en')), 'customer c123');
  assert.equal(displayLabel(customerLabel('c123'), translatorFor('it')), 'cliente c123');
  assert.equal(
    displayLabel(LABEL.cancelledByCustomer, translatorFor('it')),
    'annullato dal cliente',
  );
  assert.equal(displayLabel(LABEL.withdrawal, translatorFor('bg')), 'отказ от договора');
  assert.equal(displayLabel(LABEL.createdByStaff, translatorFor('en')), 'created by the team');
});

test('every label the system writes has a translation in every language', () => {
  for (const locale of LOCALES) {
    const t = translatorFor(locale);
    for (const token of Object.values(LABEL)) {
      const shown = displayLabel(token, t);
      assert.ok(
        shown && !shown.startsWith('@') && !shown.startsWith('label.'),
        `${locale} ${token}`,
      );
    }
  }
});

test('a person’s name and unknown tokens stay as written', () => {
  const t = translatorFor('en');
  assert.equal(displayLabel('Мария Петрова <m@example.bg>', t), 'Мария Петрова <m@example.bg>');
  assert.equal(displayLabel('@toString', t), '@toString');
  assert.equal(displayLabel('@constructor:x', t), '@constructor:x');
  assert.equal(displayLabel(null, t), '');
});
