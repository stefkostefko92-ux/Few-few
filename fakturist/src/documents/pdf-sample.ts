import { InvoiceInputSchema, type InvoiceInput } from '../einvoice/model.js';

/**
 * Образецът за „Изглед на документите“: доставчикът е самата фирма, получателят и редовете са примерни.
 * Номерът е „ОБРАЗЕЦ“ — не е издаден документ, не влиза във веригата и не се праща никъде.
 */
export function sampleInvoice(org: {
  legalName: string;
  eik: string | null;
  vatNumber: string | null;
  addressStreet: string;
  addressCity: string;
  postalCode: string;
  iban: string | null;
}): InvoiceInput {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  return InvoiceInputSchema.parse({
    number: '0000000000',
    typeCode: '380',
    issueDate: today,
    dueDate: due,
    currency: 'EUR',
    seller: {
      name: org.legalName,
      legalId: org.eik ?? undefined,
      vatId: org.vatNumber ?? undefined,
      address: {
        street: org.addressStreet,
        city: org.addressCity,
        postalCode: org.postalCode,
        countryCode: 'BG',
      },
    },
    buyer: {
      name: 'Примерен клиент ООД',
      legalId: '131063188',
      vatId: 'BG131063188',
      address: { street: 'бул. „Витоша“ 1', city: 'София', postalCode: '1000', countryCode: 'BG' },
    },
    payment: org.iban ? { meansCode: '30', accountId: org.iban } : undefined,
    notes: ['Образец на изгледа — не е издаден документ.'],
    lines: [
      {
        id: '1',
        name: 'Счетоводно обслужване, месечна такса',
        quantity: '1',
        unitCode: 'MON',
        netPrice: '150.00',
        vat: { category: org.vatNumber ? 'S' : 'O', rate: org.vatNumber ? '20' : undefined },
      },
      {
        id: '2',
        name: 'Консултация',
        quantity: '2.5',
        unitCode: 'HUR',
        netPrice: '40.00',
        vat: { category: org.vatNumber ? 'S' : 'O', rate: org.vatNumber ? '20' : undefined },
      },
    ],
  });
}
