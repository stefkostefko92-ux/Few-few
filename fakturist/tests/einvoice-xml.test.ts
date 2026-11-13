import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEInvoice } from '../src/einvoice/index.js';
import {
  creditNote,
  domestic,
  foreignCurrency,
  notRegistered,
  zeroRated,
} from './fixtures/einvoice-samples.js';

function built(input: unknown, profile: 'en16931' | 'peppol' = 'en16931') {
  const result = buildEInvoice(input, { profile });
  if (!result.ok) throw new Error(result.issues.map((i) => i.rule).join(', '));
  return result;
}

/** Елементите идват в реда на XSD-то — проверява реда на подадените имена в текста. */
function inOrder(xml: string, names: string[]): boolean {
  let at = -1;
  for (const name of names) {
    const index = xml.indexOf(`<${name}`, at + 1);
    if (index < 0 || index < at) return false;
    at = index;
  }
  return true;
}

test('UBL: фактурата носи идентификатора на EN 16931 и сумите от изчислението', () => {
  const { ubl } = built(domestic);
  assert.ok(ubl.includes('<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>'));
  assert.ok(ubl.includes('<cbc:ID>0000000124</cbc:ID>'));
  assert.ok(ubl.includes('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>'));
  assert.ok(ubl.includes('<cbc:PayableAmount currencyID="EUR">114.69</cbc:PayableAmount>'));
  assert.ok(ubl.includes('<cbc:TaxAmount currencyID="EUR">18.20</cbc:TaxAmount>'));
  assert.ok(ubl.includes('<cbc:TaxPointDate>2026-11-10</cbc:TaxPointDate>'));
  assert.ok(
    inOrder(ubl, [
      'cbc:CustomizationID',
      'cbc:ID',
      'cbc:IssueDate',
      'cbc:DueDate',
      'cbc:InvoiceTypeCode',
      'cbc:TaxPointDate',
      'cbc:DocumentCurrencyCode',
      'cbc:BuyerReference',
      'cac:AccountingSupplierParty',
      'cac:AccountingCustomerParty',
      'cac:PaymentMeans',
      'cac:AllowanceCharge',
      'cac:TaxTotal',
      'cac:LegalMonetaryTotal',
      'cac:InvoiceLine',
    ]),
  );
});

test('UBL Peppol: ProfileID и CustomizationID на BIS 3.0', () => {
  const { ubl } = built(domestic, 'peppol');
  assert.ok(ubl.includes('urn:fdc:peppol.eu:2017:poacc:billing:3.0'));
  assert.ok(
    ubl.includes('<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>'),
  );
  assert.ok(ubl.includes('<cbc:EndpointID schemeID="9926">BG208725180</cbc:EndpointID>'));
});

test('UBL: кредитното известие е CreditNote с препратка към фактурата', () => {
  const { ubl } = built(creditNote);
  assert.ok(
    ubl.includes('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"'),
  );
  assert.ok(ubl.includes('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>'));
  assert.ok(ubl.includes('<cac:CreditNoteLine>'));
  assert.ok(ubl.includes('<cbc:CreditedQuantity unitCode="H87">1</cbc:CreditedQuantity>'));
  assert.ok(inOrder(ubl, ['cac:BillingReference', 'cac:InvoiceDocumentReference', 'cbc:ID']));
});

test('чужда валута: TaxCurrencyCode EUR и втори TaxTotal в евро; бележка с основата в евро', () => {
  const { ubl, cii } = built(foreignCurrency);
  assert.ok(ubl.includes('<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>'));
  assert.ok(ubl.includes('<cbc:TaxAmount currencyID="EUR">18.45</cbc:TaxAmount>'));
  assert.ok(ubl.includes('основа 92.23 EUR, ДДС 18.45 EUR'));
  assert.ok(cii.includes('<ram:TaxTotalAmount currencyID="EUR">18.45</ram:TaxTotalAmount>'));
});

test('категория O: без ДДС номер в PartyTaxScheme; основанието е в разбивката', () => {
  const { ubl } = built(notRegistered);
  assert.equal(ubl.includes('<cac:PartyTaxScheme>'), false);
  assert.ok(
    ubl.includes(
      '<cbc:TaxExemptionReason>Лицето не е регистрирано по ЗДДС, чл. 113, ал. 9 ЗДДС</cbc:TaxExemptionReason>',
    ),
  );
  // ДДС номерът на получателя остава във фактурата като идентификатор (чл. 114, ал. 1, т. 8 ЗДДС).
  assert.ok(ubl.includes('<cbc:ID>BG131063188</cbc:ID>'));
});

test('нулева ставка: основанието отива в бележката, не в разбивката (BR-Z-10)', () => {
  const { ubl } = built(zeroRated);
  assert.ok(ubl.includes('Основание за нулева ставка: чл. 30 ЗДДС'));
  assert.equal(ubl.includes('<cbc:TaxExemptionReason>'), false);
});

test('CII: контекстът, видът, датите във формат 102 и сумите', () => {
  const { cii } = built(domestic);
  assert.ok(cii.includes('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>'));
  assert.ok(cii.includes('<ram:TypeCode>380</ram:TypeCode>'));
  assert.ok(cii.includes('<udt:DateTimeString format="102">20261112</udt:DateTimeString>'));
  assert.ok(cii.includes('<ram:DuePayableAmount>114.69</ram:DuePayableAmount>'));
  assert.equal(cii.split('<ram:TaxPointDate>').length - 1, 1);
});

test('текстът се екранира — XML не може да се счупи от име на клиент', () => {
  const { ubl, cii } = built({
    ...domestic,
    buyer: { ...domestic.buyer, name: 'A & B <ООД> "Тест"' },
  });
  assert.ok(ubl.includes('A &amp; B &lt;ООД&gt; "Тест"'));
  assert.ok(cii.includes('A &amp; B &lt;ООД&gt; "Тест"'));
});

test('подписът на Фактурист е последният ред на бележката в UBL и CII', async () => {
  const { BRAND } = await import('../src/brand.js');
  const result = buildEInvoice(foreignCurrency, { signature: BRAND.signature });
  if (!result.ok) throw new Error('не се издаде');
  const ublNote = /<cbc:Note>([\s\S]*?)<\/cbc:Note>/.exec(result.ubl)?.[1] ?? '';
  assert.ok(ublNote.endsWith(BRAND.signature), ublNote);
  assert.ok(ublNote.includes('основа 92.23 EUR'), 'подписът не измества бележката за еврото');
  assert.ok(result.cii.includes(BRAND.signature));
  assert.ok(
    BRAND.signature.includes('fakturist.eu') && BRAND.signature.includes('Carbon Stealth VCC'),
  );
  const plain = buildEInvoice(domestic);
  assert.ok(
    plain.ok && !plain.ubl.includes('fakturist.eu'),
    'без подпис, когато мастърът го изчисти',
  );
});
