import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_PDF_STYLE, PDF_TEMPLATES, resolvePdfStyle } from '../src/documents/pdf-style.js';
import { renderPdf } from '../src/documents/pdf.js';
import { isPdfLanguage, labeler } from '../src/documents/pdf-labels.js';
import { calculate } from '../src/einvoice/calculate.js';
import { InvoiceInputSchema } from '../src/einvoice/model.js';
import { SAMPLES } from './fixtures/einvoice-samples.js';

/**
 * Език на PDF-а: „bg“ — само български; „bg-en“ — български И английски (ЗСч, чл. 5, ал. 1 — българският
 * остава, английският е до него). XML-ът не зависи от езика.
 */
const FONT_ROOT = process.env['PDF_FONT_ROOT'] ?? '/usr/share/fonts/truetype';
const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('речникът: български — без промяна; двуезичен — „български / english“; непознат — само български', () => {
  const bg = labeler('bg');
  const both = labeler('bg-en');
  assert.equal(bg('Получател'), 'Получател');
  assert.equal(both('Получател'), 'Получател / Customer');
  assert.equal(both('Ед. цена', '\n'), 'Ед. цена\nUnit price');
  assert.equal(both('м²'), 'м²');
  assert.equal(both('нещо непознато'), 'нещо непознато');
  assert.ok(isPdfLanguage('bg-en'));
  assert.ok(!isPdfLanguage('en'), 'само английски не се допуска');
});

test('двуезичният PDF носи и двата езика във всеки шаблон; българският — без английски', async (t) => {
  if (!hasPdftotext) return t.skip('няма pdftotext');
  const input = InvoiceInputSchema.parse(SAMPLES['reverseCharge']);
  const dir = mkdtempSync(join(tmpdir(), 'fakturist-lang-'));
  for (const template of PDF_TEMPLATES) {
    const style = resolvePdfStyle({ ...DEFAULT_PDF_STYLE, template }, null, FONT_ROOT);
    const meta = {
      number: input.number,
      chainIndex: 1n,
      sha256: 'b'.repeat(64),
      signature: 'подпис',
      issuedVia: { firm: 'Кантора ООД', mandateRef: 'Пълномощно № 1' },
    };
    const text = async (language: 'bg' | 'bg-en') => {
      const file = join(dir, `${template}-${language}.pdf`);
      writeFileSync(file, await renderPdf(input, calculate(input), { ...meta, language }, style));
      return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    };
    const both = await text('bg-en');
    for (const required of [
      'ФАКТУРА',
      'INVOICE',
      'ПОЛУЧАТЕЛ / CUSTOMER',
      'ДОСТАВЧИК / SUPPLIER',
      'Issue date',
      'За плащане / Amount',
      'bank transfer',
      'За плащане',
      'Issued by Кантора ООД',
      'Пълномощно № 1',
    ]) {
      assert.ok(both.includes(required), `${template}: „${required}“`);
    }
    const bgOnly = await text('bg');
    assert.ok(bgOnly.includes('ФАКТУРА'));
    for (const absent of ['INVOICE', 'CUSTOMER', 'Amount', 'bank transfer']) {
      assert.ok(!bgOnly.includes(absent), `${template}: „${absent}“ не е в българския`);
    }
  }
});
