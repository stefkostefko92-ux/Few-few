import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DocumentPaymentError,
  PAYABLE_TYPES,
  PaymentFormSchema,
  amountCents,
  paymentState,
} from '../src/documents/payments.js';

/**
 * Парите по документ (SPEC 52) — само чистите части на `src/documents/payments.ts`: превръщането на
 * въведената сума в цели центове, състоянието по сбор и разчитането на формата. Записът на плащане
 * (`recordPaymentInTx`, `removePaymentInTx`) иска транзакция на PostgreSQL и е в интеграционните тестове.
 */
describe('amountCents: текст → цели центове (BigInt, без float)', () => {
  test('цели суми и суми с 1–2 знака след точката', () => {
    assert.equal(amountCents('0'), 0n);
    assert.equal(amountCents('1'), 100n);
    assert.equal(amountCents('12.5'), 1250n);
    assert.equal(amountCents('12.50'), 1250n);
    assert.equal(amountCents('0.01'), 1n);
    assert.equal(amountCents('0.10'), 10n);
    assert.equal(amountCents('114.69'), 11469n);
  });

  test('сума, която като float се бърка (0.1 + 0.2, 1.15 × 100), е точна', () => {
    assert.equal(amountCents('0.30'), 30n);
    assert.equal(amountCents('1.15'), 115n);
    assert.equal(amountCents('4.35'), 435n);
  });

  test('големи суми не губят точност над 2^53 цента', () => {
    assert.equal(amountCents('999999999999999.99'), 99999999999999999n);
    assert.equal(amountCents('90071992547409.93'), 9007199254740993n);
  });

  test('отрицателната сума се превръща без отказ — отказът е в записа на плащането', () => {
    assert.equal(amountCents('-5'), -500n);
    assert.equal(amountCents('-0.01'), -1n);
  });

  test('повече от 2 знака след точката — отказ, а не тихо закръгляне', () => {
    assert.throws(() => amountCents('1.005'), /повече от 2 знака/);
    assert.throws(() => amountCents('0.001'), /повече от 2 знака/);
  });

  test('невалиден текст — отказ', () => {
    for (const bad of ['', 'abc', '1,5', '1.', '.5', '1e3', '1.2.3', '--1', '1234567890123456']) {
      assert.throws(() => amountCents(bad), /Невалидно десетично число/, JSON.stringify(bad));
    }
  });
});

describe('paymentState: неплатено / частично / платено по сбора', () => {
  test('нула платено е неплатено', () => {
    assert.equal(paymentState(0n, 1000n), 'UNPAID');
  });

  test('един цент от 1000 е частично; 999 от 1000 е още частично', () => {
    assert.equal(paymentState(1n, 1000n), 'PARTIAL');
    assert.equal(paymentState(999n, 1000n), 'PARTIAL');
  });

  test('точно сумата за плащане е платено (границата е включена)', () => {
    assert.equal(paymentState(1000n, 1000n), 'PAID');
  });

  test('надплащане също е PAID — състоянието не различава „повече от сумата“', () => {
    assert.equal(paymentState(1001n, 1000n), 'PAID');
    assert.equal(paymentState(10_000_000n, 1n), 'PAID');
  });

  test('отрицателен сбор е неплатено, не частично', () => {
    assert.equal(paymentState(-1n, 1000n), 'UNPAID');
    assert.equal(paymentState(-1000n, 1000n), 'UNPAID');
  });

  test('нулева сума за плащане: нищо платено е неплатено, всяко плащане е платено', () => {
    assert.equal(paymentState(0n, 0n), 'UNPAID');
    assert.equal(paymentState(1n, 0n), 'PAID');
  });

  test('отрицателна сума за плащане (кредитно известие): платено при всяко положително плащане', () => {
    assert.equal(paymentState(0n, -500n), 'UNPAID');
    assert.equal(paymentState(1n, -500n), 'PAID');
  });

  test('много големи стойности не губят точност', () => {
    const payable = 9_007_199_254_740_993n;
    assert.equal(paymentState(payable - 1n, payable), 'PARTIAL');
    assert.equal(paymentState(payable, payable), 'PAID');
  });

  test('частичните плащания, събрани наново, водят до PAID точно при последния цент', () => {
    const payable = amountCents('114.69');
    const parts = [amountCents('50.00'), amountCents('64.68'), amountCents('0.01')];
    let paid = 0n;
    const states = parts.map((part) => paymentState((paid += part), payable));
    assert.deepEqual(states, ['PARTIAL', 'PARTIAL', 'PAID']);
  });
});

describe('PaymentFormSchema: формата за отбелязване на плащане', () => {
  const parse = (value: unknown) => PaymentFormSchema.safeParse(value);
  const ok = (amount: string) => {
    const result = parse({ amount, paidOn: '2026-11-13' });
    return result.success ? result.data.amount : null;
  };

  test('сумата се чисти: интервали и десетична запетая стават точка', () => {
    assert.equal(ok('114.69'), '114.69');
    assert.equal(ok('114,69'), '114.69');
    assert.equal(ok('  114,69  '), '114.69');
    assert.equal(ok('1 114,69'), '1114.69');
    assert.equal(ok('7'), '7');
    assert.equal(ok('7,5'), '7.5');
  });

  test('почистената сума се разчита от amountCents без отказ', () => {
    assert.equal(amountCents(ok('1 114,69')!), 111469n);
  });

  test('отрицателна, с 3 знака, с хилядна точка, празна, нечислова сума — отказ', () => {
    for (const bad of ['-5', '-0,01', '1,005', '1.000,50', '', '  ', 'abc', '1e3', '5.', '.5']) {
      assert.equal(ok(bad), null, JSON.stringify(bad));
    }
  });

  test('сума над 15 цифри — отказ (таванът на десетичното число)', () => {
    assert.equal(ok('1234567890123456'), null);
    assert.equal(ok('123456789012345'), '123456789012345');
  });

  test('сума 0 минава през формата — отказът „amount“ идва от записа (сума ≤ 0)', () => {
    assert.equal(ok('0'), '0');
    assert.equal(ok('0,00'), '0.00');
  });

  test('датата е във формат ГГГГ-ММ-ДД; други формати — отказ', () => {
    for (const good of ['2026-11-13', '2026-01-01']) {
      assert.equal(parse({ amount: '1', paidOn: good }).success, true, good);
    }
    for (const bad of ['13.11.2026', '2026-1-1', '2026/11/13', '', '2026-11-13T00:00:00Z']) {
      assert.equal(parse({ amount: '1', paidOn: bad }).success, false, bad);
    }
  });

  test('невъзможна дата (2026-02-30) минава формата — проверява я записът с isIsoDate', () => {
    assert.equal(parse({ amount: '1', paidOn: '2026-02-30' }).success, true);
  });

  test('бележката се подрязва, празната става undefined, над 200 знака — отказ', () => {
    const base = { amount: '1', paidOn: '2026-11-13' };
    const trimmed = parse({ ...base, note: '  по банков път  ' });
    assert.ok(trimmed.success);
    assert.equal(trimmed.data.note, 'по банков път');
    const empty = parse({ ...base, note: '   ' });
    assert.ok(empty.success);
    assert.equal(empty.data.note, undefined);
    const missing = parse(base);
    assert.ok(missing.success);
    assert.equal(missing.data.note, undefined);
    assert.equal(parse({ ...base, note: 'я'.repeat(200) }).success, true);
    assert.equal(parse({ ...base, note: 'я'.repeat(201) }).success, false);
  });

  test('липсваща сума или дата — отказ', () => {
    assert.equal(parse({ paidOn: '2026-11-13' }).success, false);
    assert.equal(parse({ amount: '1' }).success, false);
  });
});

describe('какво се плаща и грешките', () => {
  test('само фактура (380) и дебитно известие (383) са за плащане', () => {
    assert.deepEqual([...PAYABLE_TYPES], ['380', '383']);
  });

  test('DocumentPaymentError носи кода си и е Error', () => {
    for (const code of ['notFound', 'notPayable', 'amount', 'date', 'source'] as const) {
      const error = new DocumentPaymentError(code);
      assert.ok(error instanceof Error);
      assert.equal(error.code, code);
      assert.equal(error.message, code);
    }
  });
});
