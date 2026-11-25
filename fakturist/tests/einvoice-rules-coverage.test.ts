import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildEInvoice, type InvoiceInput, type Profile } from '../src/einvoice/index.js';
import { domestic, notRegistered, reverseCharge } from './fixtures/einvoice-samples.js';

/**
 * Характеризиращи тестове за правилата, които нямаха нито един тест: за всяко — документ, който го
 * нарушава (точно `{rule, severity, path}`), и документ, който минава. Гледа се само изброеното правило:
 * другите правила на същия документ не са предмет на теста.
 */
type Hit = { rule: string; severity: string; path: string };

function hits(input: InvoiceInput, rule: string, profile: Profile = 'en16931'): Hit[] {
  return buildEInvoice(input, { profile })
    .issues.filter((issue) => issue.rule === rule)
    .map(({ rule, severity, path }) => ({ rule, severity, path }));
}

/** Вътреобщностна доставка (категория K) — пълна и валидна; тестовете махат по едно поле. */
const intraCommunity: InvoiceInput = {
  ...domestic,
  number: '0000000130',
  allowanceCharges: [],
  buyer: reverseCharge.buyer,
  delivery: {
    date: '2026-11-10',
    address: { city: 'Milano', countryCode: 'IT', street: 'Via Roma 1', postalCode: '20121' },
  },
  vatExemptions: [
    { category: 'K', reason: 'Вътреобщностна доставка, чл. 7 ЗДДС', reasonCode: 'VATEX-EU-IC' },
  ],
  lines: [
    {
      id: '1',
      quantity: '4',
      unitCode: 'H87',
      netPrice: '25',
      name: 'Етикети за рафт, палет',
      vat: { category: 'K', rate: '0' },
      allowanceCharges: [],
      attributes: [],
    },
  ],
};

describe('BG-03: ЕИК на получателя (българска страна)', () => {
  test('невалидна контролна цифра на ЕИК на получателя е фатална грешка по buyer.legalId', () => {
    const input = { ...domestic, buyer: { ...domestic.buyer, legalId: '131063189' } };
    assert.deepEqual(hits(input, 'BG-03'), [
      { rule: 'BG-03', severity: 'fatal', path: 'buyer.legalId' },
    ]);
  });

  test('валиден ЕИК на получателя минава', () => {
    assert.deepEqual(hits(domestic, 'BG-03'), []);
  });

  test('чужда държава на получателя: ЕИК не се проверява по българските правила', () => {
    const input = { ...domestic, buyer: { ...reverseCharge.buyer, legalId: '131063189' } };
    assert.deepEqual(hits(input, 'BG-03'), []);
  });

  test('същият невалиден ЕИК при доставчика е BG-02, не BG-03', () => {
    const input = { ...domestic, seller: { ...domestic.seller, legalId: '208725181' } };
    assert.deepEqual(hits(input, 'BG-03'), []);
    assert.deepEqual(hits(input, 'BG-02'), [
      { rule: 'BG-02', severity: 'fatal', path: 'seller.legalId' },
    ]);
  });
});

describe('BR-AE-02: обратно начисляване иска идентификатор на получателя', () => {
  test('без ДДС номер и без ЕИК на получателя — грешка по buyer.vatId', () => {
    const input = { ...reverseCharge, buyer: { ...reverseCharge.buyer, vatId: undefined } };
    assert.deepEqual(hits(input, 'BR-AE-02'), [
      { rule: 'BR-AE-02', severity: 'fatal', path: 'buyer.vatId' },
    ]);
  });

  test('с ДДС номер на получателя минава', () => {
    assert.deepEqual(hits(reverseCharge, 'BR-AE-02'), []);
  });

  test('регистрационен идентификатор (BT-47) вместо ДДС номер също стига', () => {
    const input = {
      ...reverseCharge,
      buyer: { ...reverseCharge.buyer, vatId: undefined, legalId: '12345678' },
    };
    assert.deepEqual(hits(input, 'BR-AE-02'), []);
  });

  test('без ред с обратно начисляване правилото не се задейства', () => {
    const input = {
      ...domestic,
      buyer: { ...domestic.buyer, vatId: undefined, legalId: undefined },
    };
    assert.deepEqual(hits(input, 'BR-AE-02'), []);
  });
});

describe('BR-CO-9: ДДС номерът започва с код на държава', () => {
  test('ДДС номер на доставчика без префикс — грешка по seller.vatId', () => {
    const input = { ...domestic, seller: { ...domestic.seller, vatId: '208725180' } };
    assert.deepEqual(hits(input, 'BR-CO-9'), [
      { rule: 'BR-CO-9', severity: 'fatal', path: 'seller.vatId' },
    ]);
  });

  test('ДДС номер на получателя без префикс — грешка по buyer.vatId', () => {
    const input = { ...domestic, buyer: { ...domestic.buyer, vatId: '131063188' } };
    assert.deepEqual(hits(input, 'BR-CO-9'), [
      { rule: 'BR-CO-9', severity: 'fatal', path: 'buyer.vatId' },
    ]);
  });

  test('и двете страни без префикс — две грешки, доставчикът първи', () => {
    const input = {
      ...domestic,
      seller: { ...domestic.seller, vatId: '208725180' },
      buyer: { ...domestic.buyer, vatId: '131063188' },
    };
    assert.deepEqual(
      hits(input, 'BR-CO-9').map((hit) => hit.path),
      ['seller.vatId', 'buyer.vatId'],
    );
  });

  test('ДДС номера с префикс (BG, IT) минават', () => {
    assert.deepEqual(hits(domestic, 'BR-CO-9'), []);
    assert.deepEqual(hits(reverseCharge, 'BR-CO-9'), []);
  });
});

describe('BR-IC-02 / BR-IC-11 / BR-IC-12: вътреобщностна доставка (категория K)', () => {
  test('пълната вътреобщностна доставка не нарушава нито едно от трите', () => {
    for (const rule of ['BR-IC-02', 'BR-IC-11', 'BR-IC-12']) {
      assert.deepEqual(hits(intraCommunity, rule), [], rule);
    }
    assert.ok(buildEInvoice(intraCommunity).ok);
  });

  test('BR-IC-02: без ДДС номер на получателя — грешка по buyer.vatId', () => {
    const input = { ...intraCommunity, buyer: { ...intraCommunity.buyer, vatId: undefined } };
    assert.deepEqual(hits(input, 'BR-IC-02'), [
      { rule: 'BR-IC-02', severity: 'fatal', path: 'buyer.vatId' },
    ]);
  });

  test('BR-IC-11: без дата на доставката и без период — грешка по delivery.date', () => {
    const input = {
      ...intraCommunity,
      delivery: { address: intraCommunity.delivery!.address },
    };
    assert.deepEqual(hits(input, 'BR-IC-11'), [
      { rule: 'BR-IC-11', severity: 'fatal', path: 'delivery.date' },
    ]);
  });

  test('BR-IC-11: периодът на фактуриране замества датата на доставката', () => {
    const input: InvoiceInput = {
      ...intraCommunity,
      delivery: { address: intraCommunity.delivery!.address },
      invoicingPeriod: { start: '2026-11-01', end: '2026-11-30' },
    };
    assert.deepEqual(hits(input, 'BR-IC-11'), []);
  });

  test('BR-IC-11: период само с край не стига — иска се начало', () => {
    const input: InvoiceInput = {
      ...intraCommunity,
      delivery: { address: intraCommunity.delivery!.address },
      invoicingPeriod: { end: '2026-11-30' },
    };
    assert.deepEqual(hits(input, 'BR-IC-11'), [
      { rule: 'BR-IC-11', severity: 'fatal', path: 'delivery.date' },
    ]);
  });

  test('BR-IC-12: без държава на доставката — грешка по delivery.address.countryCode', () => {
    const input = { ...intraCommunity, delivery: { date: '2026-11-10' } };
    assert.deepEqual(hits(input, 'BR-IC-12'), [
      { rule: 'BR-IC-12', severity: 'fatal', path: 'delivery.address.countryCode' },
    ]);
  });

  test('без доставка изобщо — и трите правила се оплакват, всяко със своя път', () => {
    const { delivery: _delivery, ...rest } = intraCommunity;
    const input: InvoiceInput = { ...rest, buyer: { ...rest.buyer, vatId: undefined } };
    assert.deepEqual(
      [...hits(input, 'BR-IC-02'), ...hits(input, 'BR-IC-11'), ...hits(input, 'BR-IC-12')],
      [
        { rule: 'BR-IC-02', severity: 'fatal', path: 'buyer.vatId' },
        { rule: 'BR-IC-11', severity: 'fatal', path: 'delivery.date' },
        { rule: 'BR-IC-12', severity: 'fatal', path: 'delivery.address.countryCode' },
      ],
    );
  });

  test('вътрешна фактура (категория S) не е обект на правилата за вътреобщностна доставка', () => {
    for (const rule of ['BR-IC-02', 'BR-IC-11', 'BR-IC-12']) {
      assert.deepEqual(hits(domestic, rule), [], rule);
    }
  });
});

describe('BR-O-02 / BR-O-11: доставка извън обхвата на ДДС (категория O)', () => {
  test('BR-O-02: доставчик с ДДС номер при категория O — грешка по seller.vatId', () => {
    const input = {
      ...notRegistered,
      seller: { ...notRegistered.seller, vatId: 'BG208725180' },
    };
    assert.deepEqual(hits(input, 'BR-O-02'), [
      { rule: 'BR-O-02', severity: 'fatal', path: 'seller.vatId' },
    ]);
  });

  test('BR-O-02: доставчик без ДДС номер (чл. 113, ал. 9) минава', () => {
    assert.deepEqual(hits(notRegistered, 'BR-O-02'), []);
    assert.deepEqual(hits(notRegistered, 'BR-O-11'), []);
    assert.ok(buildEInvoice(notRegistered).ok);
  });

  test('BR-O-11: ред с категория O заедно с друга категория — грешка по lines', () => {
    const input: InvoiceInput = {
      ...notRegistered,
      lines: [...notRegistered.lines, { ...domestic.lines[0]!, id: '2' }],
    };
    assert.deepEqual(hits(input, 'BR-O-11'), [
      { rule: 'BR-O-11', severity: 'fatal', path: 'lines' },
    ]);
  });

  test('BR-O-11: два реда само с категория O минават', () => {
    const input: InvoiceInput = {
      ...notRegistered,
      lines: [...notRegistered.lines, { ...notRegistered.lines[0]!, id: '2' }],
    };
    assert.deepEqual(hits(input, 'BR-O-11'), []);
  });

  test('без категория O и двете правила мълчат', () => {
    assert.deepEqual(hits(domestic, 'BR-O-02'), []);
    assert.deepEqual(hits(domestic, 'BR-O-11'), []);
  });
});

describe('BR-S-05: стандартна категория иска ставка над 0', () => {
  const withSecondLine = (vat: { category: 'S'; rate?: string }): InvoiceInput => ({
    ...domestic,
    lines: [domestic.lines[0]!, { ...domestic.lines[1]!, vat }],
  });

  test('ставка 0 при категория S — грешка с индекса на реда в пътя', () => {
    assert.deepEqual(hits(withSecondLine({ category: 'S', rate: '0' }), 'BR-S-05'), [
      { rule: 'BR-S-05', severity: 'fatal', path: 'lines.1.vat.rate' },
    ]);
  });

  test('липсваща ставка при категория S — същата грешка', () => {
    assert.deepEqual(hits(withSecondLine({ category: 'S' }), 'BR-S-05'), [
      { rule: 'BR-S-05', severity: 'fatal', path: 'lines.1.vat.rate' },
    ]);
  });

  test('ставки 20 и 9 минават', () => {
    assert.deepEqual(hits(domestic, 'BR-S-05'), []);
  });

  test('най-малката положителна ставка 0.01 минава', () => {
    assert.deepEqual(hits(withSecondLine({ category: 'S', rate: '0.01' }), 'BR-S-05'), []);
  });

  test('нулева ставка при категория Z не е нарушение на BR-S-05', () => {
    const input: InvoiceInput = {
      ...domestic,
      lines: [{ ...domestic.lines[0]!, vat: { category: 'Z', rate: '0' } }],
    };
    assert.deepEqual(hits(input, 'BR-S-05'), []);
  });
});

describe('PEPPOL-EN16931-R020: електронен адрес на доставчика (само профил Peppol)', () => {
  const noSellerAddress: InvoiceInput = {
    ...domestic,
    seller: { ...domestic.seller, electronicAddress: undefined },
  };

  test('профил Peppol без е-адрес на доставчика — грешка по seller.electronicAddress', () => {
    assert.deepEqual(hits(noSellerAddress, 'PEPPOL-EN16931-R020', 'peppol'), [
      { rule: 'PEPPOL-EN16931-R020', severity: 'fatal', path: 'seller.electronicAddress' },
    ]);
  });

  test('профил Peppol с е-адрес на доставчика минава', () => {
    assert.deepEqual(hits(domestic, 'PEPPOL-EN16931-R020', 'peppol'), []);
    assert.ok(buildEInvoice(domestic, { profile: 'peppol' }).ok);
  });

  test('профил EN 16931 не иска е-адрес — същият документ е годен за издаване', () => {
    assert.deepEqual(hits(noSellerAddress, 'PEPPOL-EN16931-R020', 'en16931'), []);
    assert.ok(buildEInvoice(noSellerAddress, { profile: 'en16931' }).ok);
  });

  test('липсата на е-адрес на получателя е отделно правило (R010) със свой път', () => {
    const input = { ...domestic, buyer: { ...domestic.buyer, electronicAddress: undefined } };
    assert.deepEqual(hits(input, 'PEPPOL-EN16931-R020', 'peppol'), []);
    assert.deepEqual(hits(input, 'PEPPOL-EN16931-R010', 'peppol'), [
      { rule: 'PEPPOL-EN16931-R010', severity: 'fatal', path: 'buyer.electronicAddress' },
    ]);
  });
});
