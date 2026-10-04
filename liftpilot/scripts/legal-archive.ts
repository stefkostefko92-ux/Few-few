// The text of the terms in force, kept for good: legal/terms/<TERMS_VERSION>/<locale>.txt, written once and never
// overwritten (a changed text needs a new TERMS_VERSION; src/lib/__tests__/legal.test.ts fails until it has one).
//   npm run legal:archive
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../src/i18n/locales';
import { TERMS_VERSION } from '../src/lib/legal';
import { legalText } from '../src/lib/legal-text';

const dir = join(process.cwd(), 'legal', 'terms', TERMS_VERSION);
mkdirSync(dir, { recursive: true });
let failed = false;
for (const locale of LOCALES) {
  const file = join(dir, `${locale}.txt`), text = legalText(locale);
  const sha = createHash('sha256').update(text, 'utf8').digest('hex');
  if (!existsSync(file)) {
    writeFileSync(file, text, 'utf8');
    process.stdout.write(`written ${file} sha256 ${sha}\n`);
  } else if (readFileSync(file, 'utf8') === text) {
    process.stdout.write(`unchanged ${file} sha256 ${sha}\n`);
  } else {
    process.stderr.write(`${file} differs from the text in force: raise TERMS_VERSION in src/lib/legal.ts instead of changing a kept version\n`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
