-- v39 — АФИЛИЕЙТ ПРОГРАМАТА СЕ МАХА ИЗЦЯЛО (решение на собственика, 07.08.2026)
--
-- Програмата беше рекламирана („20% за 12 месеца"), но НИКОГА не е начислявала:
-- `AffiliateReferral` не се създаваше никъде в кода, значи блокът за комисиона в
-- stripe.js беше мъртъв, а /api/affiliate/me винаги показваше 0 €. Маршрутите
-- бяха изключени още преди пускането. Вместо да се дострои, функцията отпада.
--
-- ЗАГУБА НА ДАННИ: таблиците се изтриват. Приемливо е, защото:
--   • affiliate_referrals и referral_commissions са ПРАЗНИ по конструкция —
--     нито един ред не е бил създаван от кода;
--   • affiliate_codes може да съдържа автоматично създадени кодове (правеха се
--     при първо отваряне на страницата), но те нямат нито едно начисление;
--   • Stripe не е активиран, значи няма реални плащания, вързани за тях.
-- Финансовите записи (payment_logs) НЕ се пипат — те са отделни и носят
-- 7-годишното задължение.

ALTER TABLE "users"   DROP COLUMN IF EXISTS "referralCode";
ALTER TABLE "users"   DROP COLUMN IF EXISTS "referredByCode";
ALTER TABLE "users"   DROP COLUMN IF EXISTS "stripeConnectedAccountId";
ALTER TABLE "servers" DROP COLUMN IF EXISTS "referredByCode";

DROP TABLE IF EXISTS "referral_commissions";
DROP TABLE IF EXISTS "affiliate_referrals";
DROP TABLE IF EXISTS "affiliate_codes";
