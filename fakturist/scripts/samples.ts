// Пише примерните документи (tests/fixtures/einvoice-samples.ts) като UBL 2.1 и CII в samples/ —
// входът на официалната проверка (scripts/conformance/run.mjs). Профил: първият аргумент (en16931 | peppol).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEInvoice, type Profile } from '../src/einvoice/index.js';
import { SAMPLES } from '../tests/fixtures/einvoice-samples.js';

const profile = (process.argv[2] ?? 'en16931') as Profile;
const out = join(process.cwd(), 'samples', profile);
mkdirSync(out, { recursive: true });
let failed = 0;
for (const [name, input] of Object.entries(SAMPLES)) {
  // Peppol иска референция на купувача — примерите я имат; ако правилата откажат, това е грешка.
  const result = buildEInvoice(input, { profile });
  if (!result.ok) {
    failed += 1;
    console.error(`${name}: ${result.issues.map((i) => `${i.rule} ${i.path}`).join(', ')}`);
    continue;
  }
  writeFileSync(join(out, `${name}.ubl.xml`), result.ubl);
  writeFileSync(join(out, `${name}.cii.xml`), result.cii);
}
console.log(`samples/${profile}: ${Object.keys(SAMPLES).length - failed} документа`);
if (failed > 0) process.exit(1);
