// ДДС параметрите на еднократния checkout в магазина (DIGITAL/COURSE).
// Чиста логика — shop.ts ги прилага, тестват се без Stripe (TAX.md).
//
// - Адрес за фактуриране — задължителен: мястото на доставка на електронна
//   услуга е при купувача; адресът е доказателство по чл. 24е, б. „а“ Регл.
//   282/2011 и източникът на Purchase.buyerCountry (OSS запис). Второто
//   доказателство (държава на картата/банката или IP) още НЕ се записва —
//   виж TAX.md „Отворени точки“.
// - ДДС номер НЕ се събира: Stripe Tax прилага обратно начисляване по
//   ФОРМАТА на номера, независимо от VIES (docs.stripe.com/billing/customer/tax-ids),
//   а гост сесията няма customer, върху който номерът да е проверен
//   предварително. Без проверен номер купувачът е некомерсиален (чл. 18(2)
//   Регл. 282/2011) → с ДДС; цената е крайна, затова сумата не се мени.
// - tax_code по вид продукт (docs.stripe.com/tax/tax-codes): DIGITAL са
//   разнородни файлове → общият код за електронни услуги; COURSE е записан
//   курс (уроци с текст и YouTube/Vimeo вграждане, без сваляне) → „On demand
//   Online Courses — pre-recorded … (streamed)“. Живи курсове не се продават
//   (Общите условия ги забраняват); ако се допуснат — друг код и вероятно
//   не електронна услуга (без чл. 9а) → за консултант.

export type OneOffProductType = 'DIGITAL' | 'COURSE';

export const SHOP_TAX_CODES: Readonly<Record<OneOffProductType, string>> = {
  DIGITAL: 'txcd_10000000', // General - Electronically Supplied Services
  COURSE: 'txcd_20060158', // On demand Online Courses - pre-recorded (streamed)
};

export interface ShopOneOffTaxParams {
  /** Разлива се в line_items[].price_data. */
  price: { tax_behavior?: 'inclusive' };
  /** Разлива се в line_items[].price_data.product_data. */
  product: { tax_code?: string };
  /** Разлива се в параметрите на сесията. */
  session: {
    automatic_tax?: { enabled: true };
    billing_address_collection: 'required';
  };
}

export function shopOneOffTaxParams(
  type: OneOffProductType,
  taxEnabled: boolean,
): ShopOneOffTaxParams {
  if (!taxEnabled) {
    return { price: {}, product: {}, session: { billing_address_collection: 'required' } };
  }
  return {
    price: { tax_behavior: 'inclusive' },
    product: { tax_code: SHOP_TAX_CODES[type] },
    session: { automatic_tax: { enabled: true }, billing_address_collection: 'required' },
  };
}
