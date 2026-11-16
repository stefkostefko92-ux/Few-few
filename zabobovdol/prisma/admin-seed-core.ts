// Какво да прави seed-ът с администратора от .env (ADMIN_EMAIL). Чиста функция
// (тест: src/lib/__tests__/account.test.ts). След смяна на имейла от „Моят
// профил“ в .env остава старият — без това правило `--seed` би създал ВТОРИ
// администратор със старите имейл и парола. И НИКОГА не повишава роля: редактор,
// който си е сложил освободения ADMIN_EMAIL, остава редактор (Кодаджията, 16.11.2026).
export type AdminSeedPlan = "update" | "create" | "skip";

export function adminSeedPlan(s: { existingRole: "ADMIN" | "EDITOR" | null; adminCount: number }): AdminSeedPlan {
  if (s.existingRole === "ADMIN") return "update";
  if (s.existingRole === null && s.adminCount === 0) return "create";
  return "skip";
}
