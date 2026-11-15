// K1 (ядро: пари/ДДС): заварени абонати с непроверен `eu_vat` номер върху
// customer-а получават 0% ДДС при всяко подновяване (Stripe Tax гледа само
// формата). preparePlanCheckout чисти само при нов checkout → еднократен
// sweep по всички User.stripeCustomerId; dry-run по подразбиране.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CustomerTaxIdView } from '../plan-checkout';
import { sweepUnverifiedVatTaxIds, type VatSweepPorts } from '../vat-taxid-sweep';

function fake(taxIds: Record<string, CustomerTaxIdView[]>, failOn: Set<string> = new Set()) {
  const deleted: string[] = [];
  const listed: string[] = [];
  const ports: VatSweepPorts = {
    async listCustomerTaxIds(customerId) {
      listed.push(customerId);
      if (failOn.has(customerId)) throw new Error(`stripe down for ${customerId}`);
      return taxIds[customerId] ?? [];
    },
    async deleteCustomerTaxId(customerId, taxId) {
      deleted.push(`${customerId}/${taxId}`);
    },
  };
  return { ports, deleted, listed };
}

const VAT = (id: string, status: string | null): CustomerTaxIdView => ({
  id,
  type: 'eu_vat',
  verification: status === null ? null : { status },
});

test('V1 dry-run (по подразбиране): отчита непроверените, нищо не трие', async () => {
  const f = fake({ cus_a: [VAT('txi_p', 'pending'), VAT('txi_v', 'verified')] });
  const r = await sweepUnverifiedVatTaxIds(['cus_a'], f.ports, { apply: false });
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(r, [{ customerId: 'cus_a', taxIds: ['txi_p'] }]);
});

test('V2 --apply: трие само eu_vat ≠ verified; verified и други типове остават', async () => {
  const f = fake({
    cus_a: [
      VAT('txi_p', 'pending'),
      VAT('txi_u', 'unverified'),
      VAT('txi_x', 'unavailable'),
      VAT('txi_n', null),
      VAT('txi_v', 'verified'),
      { id: 'txi_gb', type: 'gb_vat', verification: { status: 'pending' } },
    ],
    cus_b: [VAT('txi_ok', 'verified')],
  });
  const r = await sweepUnverifiedVatTaxIds(['cus_a', 'cus_b'], f.ports, { apply: true });
  assert.deepEqual(f.deleted, ['cus_a/txi_p', 'cus_a/txi_u', 'cus_a/txi_x', 'cus_a/txi_n']);
  assert.deepEqual(r, [
    { customerId: 'cus_a', taxIds: ['txi_p', 'txi_u', 'txi_x', 'txi_n'] },
    { customerId: 'cus_b', taxIds: [] },
  ]);
});

test('V3 грешка от Stripe при един customer не спира останалите и се връща', async () => {
  const f = fake({ cus_b: [VAT('txi_p', 'pending')] }, new Set(['cus_a']));
  const r = await sweepUnverifiedVatTaxIds(['cus_a', 'cus_b'], f.ports, { apply: true });
  assert.deepEqual(f.deleted, ['cus_b/txi_p']);
  assert.equal(r[0]?.customerId, 'cus_a');
  assert.match(r[0]?.error ?? '', /stripe down/);
  assert.deepEqual(r[1], { customerId: 'cus_b', taxIds: ['txi_p'] });
});

test('V4 повторен customer id се обработва веднъж; празните се прескачат', async () => {
  const f = fake({ cus_a: [VAT('txi_p', 'pending')] });
  await sweepUnverifiedVatTaxIds(['cus_a', 'cus_a', ''], f.ports, { apply: true });
  assert.deepEqual(f.listed, ['cus_a']);
  assert.deepEqual(f.deleted, ['cus_a/txi_p']);
});
