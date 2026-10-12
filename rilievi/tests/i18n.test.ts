import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIT_ACTIONS } from '../src/audit.js';
import { ALL_ROLES } from '../src/auth/roles.js';
import { hasKey, keysOf, LOCALES, localeFromHeader, translate } from '../src/i18n.js';
import { FIELDS, SECTIONS } from '../src/schede/fields.js';
import { MISURA_COLUMNS } from '../src/schede/misure.js';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  it('have the same keys in Italian (the source), Bulgarian and English', () => {
    const source = keysOf('it');
    for (const locale of LOCALES) assert.deepEqual(keysOf(locale), source, locale);
  });

  it('use the same {placeholders} in every language and no empty strings', () => {
    for (const key of keysOf('it')) {
      const expected = placeholders(translate('it', key, {}));
      for (const locale of LOCALES) {
        const text = translate(locale, key, {});
        assert.notEqual(text.trim(), '', `${locale}:${key}`);
        assert.deepEqual(placeholders(text), expected, `${locale}:${key}`);
      }
    }
  });

  it('name every field, question, section, option, column, role and audit action', () => {
    for (const locale of LOCALES) {
      for (const field of FIELDS) {
        assert.ok(hasKey(locale, `scheda.field.${field.key}`), `${locale} field ${field.key}`);
        if (field.question) {
          assert.ok(hasKey(locale, `scheda.question.${field.key}`), `${locale} ${field.key}?`);
        }
        if (field.kind === 'checks' || field.kind === 'choice') {
          for (const option of field.options) {
            assert.ok(
              hasKey(locale, `scheda.option.${field.key}.${option}`),
              `${locale} ${option}`,
            );
          }
        }
      }
      for (const section of SECTIONS) assert.ok(hasKey(locale, `scheda.section.${section.key}`));
      for (const column of MISURA_COLUMNS) {
        assert.ok(hasKey(locale, `scheda.misure.col.${column.key}`), `${locale} ${column.key}`);
      }
      for (const role of ALL_ROLES) assert.ok(hasKey(locale, `role.${role}`), `${locale} ${role}`);
      for (const action of AUDIT_ACTIONS)
        assert.ok(hasKey(locale, `audit.action.${action}`), action);
    }
  });

  it('pick the plural form by count', () => {
    assert.equal(translate('it', 'schede.count', { n: 1 }), '1 scheda');
    assert.equal(translate('it', 'schede.count', { n: 3 }), '3 schede');
    assert.equal(translate('bg', 'schede.count', { n: 3 }), '3 карти');
    assert.equal(translate('en', 'scheda.unit.persone', { n: 1 }), 'person');
  });

  it('carry the brand in the keywords (at least five, one is Carbon Stealth)', () => {
    for (const locale of LOCALES) {
      const keywords = translate(locale, 'meta.keywords')
        .split(',')
        .map((k) => k.trim());
      assert.ok(keywords.length >= 5, locale);
      assert.ok(keywords.includes('Carbon Stealth'), locale);
    }
  });

  it('default to Italian and follow the browser language', () => {
    assert.equal(localeFromHeader(undefined), 'it');
    assert.equal(localeFromHeader('bg-BG,bg;q=0.9,en;q=0.5'), 'bg');
    assert.equal(localeFromHeader('de-DE,en;q=0.8'), 'en');
    assert.equal(localeFromHeader('fr-FR'), 'it');
  });
});
