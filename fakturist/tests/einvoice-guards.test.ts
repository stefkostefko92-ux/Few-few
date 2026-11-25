import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEInvoice,
  InvoiceInputSchema,
  IssueInputSchema,
  type InvoiceInput,
} from '../src/einvoice/index.js';
import { salesJournal } from '../src/export/sales-journal.js';
import { hasForbiddenChars } from '../src/http/body-guard.js';
import {
  creditNote,
  domestic,
  finalWithAdvance,
  foreignCurrency,
} from './fixtures/einvoice-samples.js';

/**
 * Пазачите по прегледа от 16.11.2026: делител нула (курс, базово количество) → 400, не 500; процент
 * извън 0–100; фактура с отрицателна сума (BG-11); дата на фактурата в известието (BG-06, чл. 115, ал. 4);
 * управляващи знаци във входа (PostgreSQL отказва 0x00 → беше 500).
 */
const rules = (input: InvoiceInput) => buildEInvoice(input).issues.map((issue) => issue.rule);
const parseError = (input: unknown) => {
  const parsed = IssueInputSchema.safeParse(input);
  return parsed.success ? null : parsed.error.issues.map((issue) => issue.message);
};

test('курс 0 и базово количество 0 се отказват от модела — не стигат до делението', () => {
  assert.deepEqual(parseError({ ...foreignCurrency, eurExchangeRate: '0' }), ['Трябва да е над 0']);
  assert.deepEqual(parseError({ ...foreignCurrency, eurExchangeRate: '0.000000' }), [
    'Трябва да е над 0',
  ]);
  const line = { ...domestic.lines[0]!, priceBaseQuantity: '0' };
  assert.deepEqual(parseError({ ...domestic, lines: [line] }), ['Трябва да е над 0']);
  assert.equal(parseError({ ...foreignCurrency, eurExchangeRate: '1.0842' }), null);
  // Без модела (както преди) делението хвърляше „Деление на нула“; сега buildEInvoice връща грешка, не хвърля.
  assert.doesNotThrow(() => buildEInvoice({ ...foreignCurrency, eurExchangeRate: '0' }));
});

test('процентът на отстъпка е от 0 до 100', () => {
  const withPercent = (percent: string): InvoiceInput => ({
    ...domestic,
    lines: [
      {
        ...domestic.lines[0]!,
        allowanceCharges: [{ isCharge: false, percent, reason: 'Отстъпка' }],
      },
    ],
  });
  assert.deepEqual(parseError(withPercent('150')), ['Процентът е от 0 до 100']);
  assert.deepEqual(parseError(withPercent('-10')), ['Процентът е от 0 до 100']);
  assert.equal(parseError(withPercent('10')), null);
  assert.equal(parseError(withPercent('100')), null);
  // Надбавката може да е над 100 % (EN 16931 не я ограничава), но не под 0.
  const charge = (percent: string): InvoiceInput => ({
    ...domestic,
    lines: [
      {
        ...domestic.lines[0]!,
        allowanceCharges: [{ isCharge: true, percent, reason: 'Спешна доставка' }],
      },
    ],
  });
  assert.equal(parseError(charge('150')), null);
  assert.deepEqual(parseError(charge('-5')), ['Процентът не може да е отрицателен']);
});

test('BG-11: фактура с отрицателна сума не се издава; известието и приспаднатият аванс минават', () => {
  const negative: InvoiceInput = {
    ...domestic,
    lines: [{ ...domestic.lines[0]!, quantity: '-5' }],
  };
  assert.ok(rules(negative).includes('BG-11'));
  assert.ok(!rules(domestic).includes('BG-11'));
  assert.ok(!rules(finalWithAdvance).includes('BG-11'), 'окончателна с приспаднат аванс');
  assert.ok(!rules(creditNote).includes('BG-11'));
});

test('BG-06: известието носи и датата на фактурата (чл. 115, ал. 4 ЗДДС)', () => {
  const withoutDate: InvoiceInput = {
    ...creditNote,
    precedingInvoices: [{ number: creditNote.precedingInvoices[0]!.number }],
  };
  const issues = buildEInvoice(withoutDate).issues.filter((issue) => issue.rule === 'BG-06');
  assert.deepEqual(
    issues.map((issue) => [issue.path, issue.severity]),
    [['precedingInvoices.0.issueDate', 'fatal']],
  );
  assert.ok(creditNote.precedingInvoices[0]!.issueDate, 'примерът е с дата');
  assert.ok(!rules(creditNote).includes('BG-06'));
});

test('управляващ знак в тялото на заявката се хваща — и в ключ, и дълбоко', () => {
  assert.equal(hasForbiddenChars({ buyer: { name: 'ACME\u0000Ltd' } }), true);
  assert.equal(hasForbiddenChars({ lines: [{ name: 'a\u0007' }] }), true);
  assert.equal(hasForbiddenChars({ 'a\u0000': 'x' }), true);
  assert.equal(hasForbiddenChars({ note: 'ред 1\nред 2\tтаб\r\n' }), false);
  assert.equal(hasForbiddenChars('Пекарна „Зора“ ЕООД'), false);
});

test('бележката за лева: фиксираният курс по ЗВЕРБ, не „курса на ЕЦБ“; „Входящи“ я чете', async () => {
  const { BGN_PER_EUR } = await import('../src/einvoice/rules-bg.js');
  const { recoverBgFields } = await import('../src/incoming/check.js');
  const bgn: InvoiceInput = { ...foreignCurrency, currency: 'BGN', eurExchangeRate: BGN_PER_EUR };
  const { calculate } = await import('../src/einvoice/calculate.js');
  const { documentNote } = await import('../src/einvoice/notes.js');
  const noteOf = (input: InvoiceInput) => documentNote(input, calculate(input), undefined) ?? '';
  const note = noteOf(bgn);
  assert.match(note, /В евро по фиксирания курс 1\.95583 BGN\/EUR \(ЗВЕРБ, чл\. 5\)/);
  assert.doesNotMatch(note, /ЕЦБ/);
  const usd = noteOf(foreignCurrency);
  assert.match(usd, /по курса на ЕЦБ 1\.0842 USD\/EUR/);
  const read: Record<string, unknown> = { currency: 'BGN', notes: [note], lines: [] };
  recoverBgFields(read, {} as never);
  assert.equal(read['eurExchangeRate'], BGN_PER_EUR);
});

test('издаден по-рано документ (процент 150, курс 0 при EUR) се разчита за PDF и дневника; ново издаване — отказ', () => {
  const stored = {
    ...domestic,
    eurExchangeRate: '0',
    lines: [
      {
        ...domestic.lines[0]!,
        allowanceCharges: [{ isCharge: false, percent: '150', reason: 'Отстъпка' }],
      },
    ],
  };
  // Записаният вход минава схемата на записа — PDF, PRODAGBI.TXT и SAF-T не падат.
  assert.equal(InvoiceInputSchema.safeParse(stored).success, true);
  assert.doesNotThrow(() =>
    salesJournal({
      vatNumber: 'BG208725180',
      period: domestic.issueDate.slice(0, 7).replace('-', ''),
      documents: [
        {
          number: domestic.number,
          typeCode: '380',
          status: 'ISSUED',
          issueDate: new Date(`${domestic.issueDate}T00:00:00Z`),
          cancelledAt: null,
          input: stored,
        },
      ],
    }),
  );
  // При ново издаване ограниченията важат.
  assert.deepEqual(parseError(stored), ['Трябва да е над 0', 'Процентът е от 0 до 100']);
  assert.ok(buildEInvoice(stored).issues.some((issue) => issue.rule === 'INPUT'));
});

test('входящ файл с курс 0 в бележката — грешка в проверката, не срив', async () => {
  const { calculate } = await import('../src/einvoice/calculate.js');
  const { toUbl } = await import('../src/einvoice/ubl.js');
  const { checkIncoming } = await import('../src/incoming/check.js');
  const xml = toUbl(foreignCurrency, calculate(foreignCurrency), 'en16931', undefined)
    .replace(/курса на ЕЦБ 1\.0842 USD\/EUR/g, 'курса на ЕЦБ 0 USD/EUR')
    .replace(/<cbc:TaxAmount currencyID="EUR">[^<]*<\/cbc:TaxAmount>/g, '');
  assert.match(xml, /курса на ЕЦБ 0 USD/);
  const result = checkIncoming(xml);
  assert.ok(result.issues.some((issue) => issue.path === 'eurExchangeRate'));
});
