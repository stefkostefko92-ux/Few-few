import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dec } from '../src/einvoice/decimal.js';
import type { InvoiceInput } from '../src/einvoice/model.js';
import { EXEMPTION_PRESETS } from '../src/documents/exemption-reasons.js';
import { salesJournal, type AmountField } from '../src/export/sales-journal.js';
import { NRA_CODES } from '../src/export/saft/codes.js';
import { zeroRated } from './fixtures/einvoice-samples.js';

/**
 * Готовите основания (BT-120): всяко дава очакваното поле в PRODAGBI.TXT и кода в SAF-T (TAX-IMP v1.0.3).
 * Ако текстът се смени и членът спре да се разпознава, тестът пада, а не дневникът тихо.
 */
const EXPECTED: Record<string, { field: AmountField | null; code: string | null }> = {
  'Обратно начисляване — чл. 21, ал. 2 ЗДДС': { field: '02-17', code: '100217' },
  'Обратно начисляване — чл. 163а, ал. 2 ЗДДС (Приложение № 2, част I)': {
    field: null,
    code: '100227',
  },
  'Обратно начисляване — чл. 163а, ал. 2 ЗДДС (Приложение № 2, част II)': {
    field: null,
    code: '100228',
  },
  'Вътреобщностна доставка — нулева ставка, чл. 53, ал. 1 във връзка с чл. 7 ЗДДС': {
    field: '02-15',
    code: '100215',
  },
  'Нулева ставка — чл. 28 ЗДДС (износ)': { field: '02-14', code: '100214' },
  'Нулева ставка — чл. 30 ЗДДС (международен транспорт на стоки)': {
    field: '02-14',
    code: '100214',
  },
  'Нулева ставка — чл. 140 ЗДДС (обща туристическа услуга)': { field: '02-16', code: '100216' },
  'Нулева ставка — чл. 146, ал. 1 ЗДДС (облагане на маржа)': { field: '02-16', code: '100216' },
  'Нулева ставка — чл. 173, ал. 1 ЗДДС (международен договор)': { field: '02-16', code: '100216' },
  'Място на изпълнение извън страната — чл. 69, ал. 2 ЗДДС': { field: '02-18', code: '100218' },
  'Доставчикът не е регистриран по ЗДДС — данък не се посочва (чл. 113, ал. 9 ЗДДС)': {
    field: null,
    code: null,
  },
};

test('всяко готово основание има очакване — и обратно', () => {
  assert.deepEqual(EXEMPTION_PRESETS.map((p) => p.text).sort(), Object.keys(EXPECTED).sort());
});

test('при обратно начисляване текстът съдържа „обратно начисляване“ (чл. 114, ал. 4, BG-07)', () => {
  for (const p of EXEMPTION_PRESETS.filter((x) => x.category === 'AE')) {
    assert.match(p.text, /обратно начисляване/i, p.text);
  }
});

test('поле в PRODAGBI.TXT и код в SAF-T за всяко основание', () => {
  for (const preset of EXEMPTION_PRESETS) {
    const expected = EXPECTED[preset.text]!;
    const rate = preset.category === 'O' ? undefined : '0';
    const input: InvoiceInput = {
      ...zeroRated,
      vatExemptions: [{ category: preset.category, reason: preset.text }],
      lines: zeroRated.lines.map((l) => ({ ...l, vat: { category: preset.category, rate } })),
    };
    const journal = salesJournal({
      vatNumber: 'BG208725180',
      period: '202611',
      documents: [
        {
          number: input.number,
          typeCode: '380',
          status: 'ISSUED',
          issueDate: new Date(`${input.issueDate}T00:00:00Z`),
          cancelledAt: null,
          input,
        },
      ],
    });
    if (expected.field) {
      assert.equal(journal.totals[expected.field], 120000n, `${preset.text} → ${expected.field}`);
    } else {
      assert.equal(journal.records, 0, `${preset.text} → за ръчно`);
    }
    const code = NRA_CODES.vatTaxCode(
      preset.category,
      rate === undefined ? null : dec(rate),
      preset.text,
    );
    assert.equal(code, expected.code, `${preset.text} → ${expected.code}`);
  }
});
