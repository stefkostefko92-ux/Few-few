// Примерен PDF (за преглед на оформлението): npx tsx scripts/sample-pdf.ts <изход.pdf> [пример]
import { writeFileSync } from 'node:fs';
import { renderPdf } from '../src/documents/pdf.js';
import { calculate } from '../src/einvoice/calculate.js';
import { InvoiceInputSchema } from '../src/einvoice/model.js';
import { BRAND } from '../src/brand.js';
import { SAMPLES } from '../tests/fixtures/einvoice-samples.js';

const out = process.argv[2] ?? 'sample.pdf';
const name = (process.argv[3] ?? 'domestic') as keyof typeof SAMPLES;
const input = InvoiceInputSchema.parse(SAMPLES[name]);
const pdf = await renderPdf(input, calculate(input), {
  number: input.number,
  chainIndex: 124n,
  sha256: '5c8dcf6316764475a1f09c2e7c41e90ad2085b71aa31ffb3c0b7d2f9e6a4c818',
  signature: BRAND.signature,
  issuedVia: null,
  fontDir: process.env['PDF_FONT_DIR'] ?? '/usr/share/fonts/truetype/dejavu',
});
writeFileSync(out, pdf);
console.log(`${out}: ${pdf.length} байта`);
