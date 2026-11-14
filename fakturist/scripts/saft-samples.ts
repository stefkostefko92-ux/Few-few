// Пише данните за SAF-T от примерните документи (tests/fixtures/einvoice-samples.ts) в samples/saft/ —
// входът на проверката срещу XSD 1.0.3 на НАП (scripts/conformance/run.mjs, docs/saf-t/).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { saftBundle } from '../src/export/saft/bundle.js';
import { NRA_CODES } from '../src/export/saft/codes.js';
import type { SaftDocument } from '../src/export/saft/model.js';
import {
  creditNote,
  domestic,
  finalWithAdvance,
  foreignCurrency,
  reverseCharge,
} from '../tests/fixtures/einvoice-samples.js';

const documents: SaftDocument[] = [
  domestic,
  foreignCurrency,
  creditNote,
  finalWithAdvance,
  reverseCharge,
].map((input) => ({ number: input.number, typeCode: input.typeCode, status: 'ISSUED', input }));
const bundle = saftBundle({
  documents,
  // Кредитно начално салдо — проверява и другия клон на избора в Customer.
  balances: new Map([['10131063188', { openingCents: -1250n, closingCents: 54032n }]]),
  accounts: { receivable: '411', revenue: '703' },
  codes: NRA_CODES,
  relatedParties: ['131063188'],
});
const out = join(process.cwd(), 'samples', 'saft');
mkdirSync(out, { recursive: true });
for (const file of bundle.files) writeFileSync(join(out, file.name), file.xml);
console.log(`samples/saft: ${bundle.files.length} файла, ${bundle.included} документа`);
if (bundle.files.length !== 5) process.exit(1);
