import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AUDIT_ACTIONS } from '../src/audit.js';
import { ALL_ROLES } from '../src/auth/roles.js';
import { hasKey, keysOf, LOCALES, translate } from '../src/i18n.js';
import { ROOT } from '../src/paths.js';
import { FIELDS, SECTIONS } from '../src/schede/fields.js';
import { MISURA_COLUMNS } from '../src/schede/misure.js';

describe('the dictionary', () => {
  it('is Italian only: one language, one folder', () => {
    assert.deepEqual([...LOCALES], ['it']);
    assert.deepEqual(readdirSync(join(ROOT, 'locales')), ['it']);
  });

  it('has no empty strings and no Cyrillic text', () => {
    for (const key of keysOf('it')) {
      const text = translate('it', key, {});
      assert.notEqual(text.trim(), '', key);
      assert.doesNotMatch(text, /[\u0400-\u04FF]/, key);
    }
  });

  it('names every field, question, section, option, column, role and audit action', () => {
    for (const field of FIELDS) {
      assert.ok(hasKey('it', `scheda.field.${field.key}`), `field ${field.key}`);
      if (field.question) assert.ok(hasKey('it', `scheda.question.${field.key}`), `${field.key}?`);
      if (field.kind === 'checks' || field.kind === 'choice') {
        for (const option of field.options) {
          assert.ok(hasKey('it', `scheda.option.${field.key}.${option}`), option);
        }
      }
    }
    for (const section of SECTIONS) assert.ok(hasKey('it', `scheda.section.${section.key}`));
    for (const column of MISURA_COLUMNS) {
      assert.ok(hasKey('it', `scheda.misure.col.${column.key}`), column.key);
    }
    for (const role of ALL_ROLES) assert.ok(hasKey('it', `role.${role}`), role);
    for (const action of AUDIT_ACTIONS) assert.ok(hasKey('it', `audit.action.${action}`), action);
  });

  it('picks the plural form by count', () => {
    assert.equal(translate('it', 'schede.count', { n: 1 }), '1 scheda');
    assert.equal(translate('it', 'schede.count', { n: 3 }), '3 schede');
    assert.equal(translate('it', 'scheda.unit.persone', { n: 1 }), 'persona');
  });

  it('returns the key itself when a text is missing', () => {
    assert.equal(translate('it', 'nessuna.chiave'), 'nessuna.chiave');
  });

  it('carries the brand in the keywords (at least five, one is Carbon Stealth)', () => {
    const keywords = translate('it', 'meta.keywords')
      .split(',')
      .map((k) => k.trim());
    assert.ok(keywords.length >= 5);
    assert.ok(keywords.includes('Carbon Stealth'));
  });
});
