// The version of the software (the owner, 12 November 2026: "Смени версията на софтуера ни и започни да я
// тълкуваш като versione 3.0. След всеки patch вдигаш цифрата след 3, при големи добавяния вдигаш цялостното
// ниво"): MAJOR.MINOR in one place, package.json in step (npm wants three numbers: MAJOR.MINOR.0), shown at the
// foot of the portal and of the site, on the calculation sheets and in the structured data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { ROOT } from '../src/paths.js';
import { VERSIONE_SOFTWARE } from '../src/versione.js';

describe('the version of the software', () => {
  it('is MAJOR.MINOR, from 3.0 on, and package.json follows it', () => {
    assert.match(VERSIONE_SOFTWARE, /^[1-9]\d*\.\d+$/);
    const [major] = VERSIONE_SOFTWARE.split('.').map(Number);
    assert.ok(major! >= 3);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    assert.equal(pkg.version, `${VERSIONE_SOFTWARE}.0`);
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages['']?.version, pkg.version);
  });

  it('is written on the calculation sheets and at the foot of the pages', () => {
    const t = translatorFor('it');
    assert.match(
      t('calcoli.piede.generato', {
        versione: VERSIONE_SOFTWARE,
        build: 'b',
        nome: 'n',
        quando: 'q',
        impronta: 'r',
      }),
      new RegExp(`Rilievi Impianti ${VERSIONE_SOFTWARE.replace('.', '\\.')} `),
    );
    assert.equal(
      t('versione.piede', { versione: VERSIONE_SOFTWARE }),
      `Versione ${VERSIONE_SOFTWARE}`,
    );
  });
});
