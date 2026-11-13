import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_PDF_STYLE, resolvePdfStyle } from '../src/documents/pdf-style.js';
import { renderPdf } from '../src/documents/pdf.js';
import { breakdownLine, vatCell } from '../src/documents/pdf-format.js';
import { dec } from '../src/einvoice/decimal.js';
import { calculate } from '../src/einvoice/calculate.js';
import { InvoiceInputSchema } from '../src/einvoice/model.js';
import { domestic, reverseCharge } from './fixtures/einvoice-samples.js';

/**
 * Обратно начисляване в PDF-а (Данъчника, 13.11.2026): „не се посочват размерът на данъка и данъчната
 * ставка“ (чл. 114, ал. 4 ЗДДС) — без „0%“ и без „ДДС 0,00“; при S и Z ставката се печата.
 */
const FONT_ROOT = process.env['PDF_FONT_ROOT'] ?? '/usr/share/fonts/truetype';
const L = (text: string) => text;

test('клетката „ДДС“ и редът от разбивката', () => {
  assert.equal(vatCell('S', dec('20')), '20%');
  assert.equal(vatCell('Z', dec('0')), '0%');
  assert.equal(vatCell('AE', dec('0')), 'AE');
  assert.equal(vatCell('E', dec('0')), 'E');
  const group = { taxable: dec('100.00'), vat: dec('0.00') };
  assert.equal(breakdownLine({ category: 'AE', rate: dec('0'), ...group }, L), 'AE: основа 100,00');
  assert.equal(
    breakdownLine({ category: 'S', rate: dec('20'), taxable: dec('100.00'), vat: dec('20.00') }, L),
    'S 20%: основа 100,00, ДДС 20,00',
  );
});

test('PDF с обратно начисляване: без ставка и данък; основанието — да', async (t) => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
  } catch {
    return t.skip('няма pdftotext');
  }
  const dir = mkdtempSync(join(tmpdir(), 'fakturist-ae-'));
  const style = resolvePdfStyle(DEFAULT_PDF_STYLE, null, FONT_ROOT);
  const meta = {
    number: '0000000126',
    chainIndex: 1n,
    sha256: 'c'.repeat(64),
    signature: 'подпис',
    issuedVia: null,
  };
  const text = async (sample: unknown, name: string) => {
    const input = InvoiceInputSchema.parse(sample);
    const file = join(dir, `${name}.pdf`);
    writeFileSync(
      file,
      await renderPdf(input, calculate(input), { ...meta, language: 'bg' }, style),
    );
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  };
  const ae = await text(reverseCharge, 'ae');
  assert.doesNotMatch(ae, /\b0%/, 'без „0%“');
  assert.doesNotMatch(ae, /ДДС 0,00/, 'без „ДДС 0,00“ в разбивката');
  assert.match(ae, /обратно начисляване/i);
  const standard = await text(domestic, 'standard');
  assert.match(standard, /20%/);
  assert.match(standard, /ДДС \d/);
});
