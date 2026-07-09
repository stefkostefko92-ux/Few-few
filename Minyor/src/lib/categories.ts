// Човешки етикети за изброимите типове (enum) — на български.

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  EDITOR: "Редактор",
};

export const POSITION_LABELS: Record<string, string> = {
  GOALKEEPER: "Вратар",
  DEFENDER: "Защитник",
  MIDFIELDER: "Полузащитник",
  FORWARD: "Нападател",
};

// Подредба на позициите във визуализацията на състава.
export const POSITION_ORDER: string[] = [
  "GOALKEEPER",
  "DEFENDER",
  "MIDFIELDER",
  "FORWARD",
];

export const MATCH_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Предстои",
  FINISHED: "Завършил",
  POSTPONED: "Отложен",
  CANCELLED: "Отменен",
};

export const SPONSOR_TIER_LABELS: Record<string, string> = {
  MAIN: "Основен спонсор",
  PARTNER: "Партньор",
  SUPPORTER: "Поддръжник",
};

export function labelFor(
  map: Record<string, string>,
  key: string | null | undefined,
): string {
  if (!key) return "—";
  return map[key] ?? key;
}
