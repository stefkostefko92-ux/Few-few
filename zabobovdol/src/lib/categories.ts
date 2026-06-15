// Човешки етикети за изброимите типове (enum) — на български.

export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  HEALTH: "Здраве",
  ADMIN: "Администрация",
  UTILITY: "Комунални услуги",
  TRANSPORT: "Транспорт",
  SOCIAL: "Социални услуги",
  EMERGENCY: "Спешни",
  EDUCATION: "Образование",
  OTHER: "Друго",
};

export const BUSINESS_CATEGORY_LABELS: Record<string, string> = {
  SHOP: "Магазин",
  FOOD: "Храна и заведения",
  SERVICE: "Услуги",
  CRAFT: "Занаяти",
  AGRO: "Земеделие",
  TOURISM: "Туризъм",
  HEALTH: "Здраве и красота",
  OTHER: "Друго",
};

export const LISTING_TYPE_LABELS: Record<string, string> = {
  OFFER: "Продавам / предлагам",
  WANTED: "Купувам / търся",
  JOB: "Работа",
  REALESTATE: "Имоти",
  FREE: "Подарявам",
  EVENT: "Събитие",
  OTHER: "Друго",
};

export const HELP_KIND_LABELS: Record<string, string> = {
  NEED: "Търси помощ",
  OFFER: "Предлага помощ / дарение",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  EDITOR: "Редактор",
};

export function labelFor(
  map: Record<string, string>,
  key: string | null | undefined,
): string {
  if (!key) return "—";
  return map[key] ?? key;
}
