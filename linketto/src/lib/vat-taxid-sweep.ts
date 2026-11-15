// Еднократно почистване на непроверени ДДС номера (TAX.md „ДДС номер и VIES“).
// Stripe Tax прилага обратно начисляване по ФОРМАТА на номера, независимо от
// VIES (docs.stripe.com/billing/customer/tax-ids). preparePlanCheckout маха
// непроверените номера само при НОВ checkout; заварен абонат с номер, събран
// по-рано през tax_id_collection, иначе получава 0% ДДС при всяко подновяване.
// Скрипт: scripts/sweep-unverified-vat-ids.ts (dry-run по подразбиране).
import { unverifiedVatTaxIds, type PlanCheckoutPorts } from './plan-checkout';

export type VatSweepPorts = Pick<PlanCheckoutPorts, 'listCustomerTaxIds' | 'deleteCustomerTaxId'>;

export interface VatSweepResult {
  customerId: string;
  /** Непроверените eu_vat номера (при apply — изтрити, освен при грешка). */
  taxIds: string[];
  error?: string;
}

/**
 * За всеки customer: непроверените `eu_vat` номера → отчет (dry-run) или
 * изтриване (apply). Проверените (`verified`) и другите типове остават.
 * Грешка при един customer не спира останалите и се връща в резултата.
 * Идемпотентно: второ пускане не намира нищо за триене.
 */
export async function sweepUnverifiedVatTaxIds(
  customerIds: readonly string[],
  ports: VatSweepPorts,
  opts: { apply: boolean },
): Promise<VatSweepResult[]> {
  const results: VatSweepResult[] = [];
  for (const customerId of new Set(customerIds.filter(Boolean))) {
    let taxIds: string[] = [];
    try {
      taxIds = unverifiedVatTaxIds(await ports.listCustomerTaxIds(customerId));
      if (opts.apply) {
        for (const taxId of taxIds) await ports.deleteCustomerTaxId(customerId, taxId);
      }
      results.push({ customerId, taxIds });
    } catch (error) {
      results.push({
        customerId,
        taxIds,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
  return results;
}
