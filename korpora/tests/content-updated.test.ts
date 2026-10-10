import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_UPDATED } from '../src/company.js';
import { LOCALES } from '../src/i18n.js';
import { ROOT } from '../src/paths.js';
import { priceTable } from '../src/plans/pricing.js';

/**
 * What the landing says — its texts in every language and the price list — fingerprinted on the day in
 * CONTENT_UPDATED. That date is the sitemap's lastmod, the WebPage's dateModified and the brochure's price
 * date, and it is set by hand; this keeps it from going stale when the content changes.
 */
const RECORDED = {
  updated: '2026-10-10',
  sha256: '08400cf4a61a8fa62c64ba0d5dd8af111ebb63e17ab32bc9a6e223ce6909cfe3',
};

function fingerprint(): string {
  const hash = createHash('sha256');
  for (const locale of LOCALES) {
    // parsed, so that reformatting the file is not a change of content
    const texts: unknown = JSON.parse(
      readFileSync(join(ROOT, 'locales', locale, 'landing.json'), 'utf8'),
    );
    hash.update(JSON.stringify(texts));
  }
  hash.update(JSON.stringify(priceTable()));
  return hash.digest('hex');
}

test('the landing date moves when its content does', () => {
  assert.equal(
    fingerprint(),
    RECORDED.sha256,
    'the landing texts or prices changed: set CONTENT_UPDATED in src/company.ts to the day of the change and record that date and the new fingerprint here',
  );
  assert.equal(CONTENT_UPDATED, RECORDED.updated, 'CONTENT_UPDATED belongs to another fingerprint');
});
