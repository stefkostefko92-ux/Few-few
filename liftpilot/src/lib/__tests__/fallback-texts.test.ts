// The global error page cannot load the messages (it replaces the root layout): its words are copied in
// src/lib/fallback-texts.ts and must stay those of messages/it.json. The owner's credit is on every page that has no
// footer of its own: the global error page and the 404 outside the language segment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import it from '../../../messages/it.json';
import { GLOBAL_ERROR_TEXTS as T } from '../fallback-texts';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);

test('la pagina di errore globale: le parole di it.json', () => {
  assert.equal(T.title, it.errors.errorTitle);
  assert.equal(T.text, it.errors.errorText);
  assert.equal(`${T.code}{code}`, it.errors.errorCode);
  assert.equal(T.retry, it.errors.retry);
  assert.equal(T.home, it.errors.toHome);
  assert.equal(`${T.mail[0]}{email}${T.mail[1]}`, it.errors.reportMail);
});

test('la firma di Carbon Stealth: su ogni pagina di errore e sul 404 fuori dalla lingua', () => {
  const credit = readFileSync(path.join(root, 'src/components/Credit.tsx'), 'utf8');
  assert.match(credit, /lang="en"/);
  assert.match(credit, /Created and Designed by\{' '\}\s*<a href="https:\/\/carbonstealth\.eu" target="_blank" rel="noopener">Carbon Stealth VCC<\/a>/);
  for (const file of ['src/app/global-error.tsx', 'src/app/not-found.tsx', 'src/components/FooterView.tsx']) {
    assert.match(readFileSync(path.join(root, file), 'utf8'), /<Credit \/>/, file);
  }
  // the error page of the language segment draws the footer, the application's sits inside the shell (with its footer)
  assert.match(readFileSync(path.join(root, 'src/app/[locale]/error.tsx'), 'utf8'), /<FooterView /);
  assert.match(readFileSync(path.join(root, 'src/app/[locale]/app/layout.tsx'), 'utf8'), /footer=\{<Footer \/>\}/);
});
