// Кой вижда страницата на платен продукт (курс/членство) — чисто, тества се.
// Платилият купувач пази достъпа си, дори продуктът да е архивиран, профилът
// да е свален от публикация (по-нисък план) или анонимизиран (изтрит акаунт с
// продажби): съдържанието е платено (Дир. 2019/770). Банът (bannedAt) спира
// всички — решава се в заявката.
export function canViewPaidProduct(input: {
  productActive: boolean;
  profilePublished: boolean;
  hasAccess: boolean;
}): boolean {
  return input.hasAccess || (input.productActive && input.profilePublished);
}
