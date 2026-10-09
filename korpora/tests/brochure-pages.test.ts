import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { drilling, type BrochureContext } from '../print/pages.js';
import { LOCALES, translatorFor } from '../src/i18n.js';
import { loadEngine } from '../src/services/engine.js';
import { landingAssets } from '../src/services/landing-assets.js';

// the base catalogue, as for the brochure without data/catalog.json
before(() => loadEngine(fileURLToPath(new URL('./no-such-catalog.json', import.meta.url))));

/** Only what the drilling page reads: the texts, the numbers, the door from the engine, the title block. */
function contextFor(locale: (typeof LOCALES)[number]): BrochureContext {
  return {
    locale,
    t: translatorFor(locale),
    num: (value: number) => String(value),
    assets: landingAssets(),
    url: { site: 'https://korpora.example', label: 'korpora.example', terms: '' },
    logo: 'data:,',
  } as unknown as BrochureContext;
}

test('the brochure marks the drawings’ Bulgarian label with lang="bg" and escapes the text around it', () => {
  for (const locale of LOCALES) {
    const page = drilling(contextFor(locale));
    assert.ok(page, `${locale}: the example has a door`);
    // with a role, or the tagged PDF drops the language (Chromium keeps it only on such elements)
    assert.ok(
      page.includes('<span lang="bg" role="term">наш избор</span>'),
      `${locale}: the label`,
    );
    assert.equal(page.split('наш избор').length - 1, 1, `${locale}: once, only inside the mark`);
    assert.ok(!page.includes('\u0000'), `${locale}: no split marker left`);
  }
});
