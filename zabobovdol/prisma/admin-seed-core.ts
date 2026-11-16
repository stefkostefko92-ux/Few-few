// Какво да прави seed-ът с администратора от .env (ADMIN_EMAIL). Чиста функция
// (тест: src/lib/__tests__/account.test.ts). След смяна на имейла от „Моят
// профил“ в .env остава старият — без това правило `--seed` би създал ВТОРИ
// администратор със старите имейл и парола.
export type AdminSeedPlan = "update" | "create" | "skip";

export function adminSeedPlan(s: { existsByEmail: boolean; adminCount: number }): AdminSeedPlan {
  if (s.existsByEmail) return "update";
  return s.adminCount === 0 ? "create" : "skip";
}
