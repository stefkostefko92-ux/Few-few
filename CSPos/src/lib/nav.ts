// Модел на навигацията — чиста логика, без React (тества се без браузър).
//
// Менюто е групирано по работата в магазина, не по устройството на кода:
// каса → смяна и пари → стоки → контрол → система. Видимостта следва ролята
// (CASHIER < MANAGER < ADMIN) и одиторския профил (Прил. № 29, т. 19): одиторът
// вижда като ролята си, но не и екраните, чиято единствена работа е да пишат.

import type { RoleKey } from "./constants";

export type NavIcon =
  | "register"
  | "price"
  | "shift"
  | "products"
  | "promotions"
  | "inventory"
  | "dashboard"
  | "reports"
  | "journal"
  | "settings";

export interface NavItem {
  href: string;
  label: string;
  /** Едно изречение за какво служи — за търсачката на командите. */
  hint: string;
  icon: NavIcon;
  minRole: RoleKey;
  /** Екранът съществува само за да пише (продажба, смяна) — скрит за одитора. */
  writeOnly?: boolean;
  keywords: string[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "till",
    label: "Каса",
    items: [
      {
        href: "/pos",
        label: "Продажби",
        hint: "Маркиране, плащане и фискален бон",
        icon: "register",
        minRole: "CASHIER",
        writeOnly: true,
        keywords: ["каса", "бон", "продажба", "маркиране", "плащане", "сторно"],
      },
      {
        href: "/check",
        label: "Проверка на цена",
        hint: "Цена и наличност по баркод",
        icon: "price",
        minRole: "CASHIER",
        keywords: ["цена", "баркод", "скенер", "наличност"],
      },
    ],
  },
  {
    id: "money",
    label: "Смяна и пари",
    items: [
      {
        href: "/shifts",
        label: "Смени и наличност",
        hint: "Откриване, служебни суми, X и Z отчет",
        icon: "shift",
        minRole: "CASHIER",
        writeOnly: true,
        keywords: ["смяна", "наличност", "служебно", "z отчет", "x отчет", "каса"],
      },
    ],
  },
  {
    id: "goods",
    label: "Стоки",
    items: [
      {
        href: "/products",
        label: "Номенклатура",
        hint: "Стоки, цени, баркодове и данъчни групи",
        icon: "products",
        minRole: "MANAGER",
        keywords: ["стоки", "артикули", "цени", "баркод", "ддс", "група"],
      },
      {
        href: "/promotions",
        label: "Промоции",
        hint: "Отстъпки по период, час и количество",
        icon: "promotions",
        minRole: "MANAGER",
        keywords: ["промоция", "отстъпка", "акция"],
      },
      {
        href: "/inventory",
        label: "Склад и доставки",
        hint: "Доставки, ревизии, брак и срокове на годност",
        icon: "inventory",
        minRole: "MANAGER",
        keywords: ["склад", "доставка", "ревизия", "брак", "годност", "доставчик"],
      },
    ],
  },
  {
    id: "control",
    label: "Контрол",
    items: [
      {
        href: "/dashboard",
        label: "Табло",
        hint: "Оборот и тенденции за деня",
        icon: "dashboard",
        minRole: "MANAGER",
        keywords: ["табло", "оборот", "статистика"],
      },
      {
        href: "/reports",
        label: "Справки",
        hint: "Справки по Прил. № 29, НАП експорт и отчети",
        icon: "reports",
        minRole: "MANAGER",
        keywords: ["справка", "отчет", "нап", "експорт", "ддс", "продажби"],
      },
      {
        href: "/journal",
        label: "Одиторски дневник",
        hint: "Всяко действие с оператор, дата и час",
        icon: "journal",
        minRole: "MANAGER",
        keywords: ["дневник", "одит", "журнал", "лог", "анулиране"],
      },
    ],
  },
  {
    id: "system",
    label: "Система",
    items: [
      {
        href: "/settings",
        label: "Настройки",
        hint: "Фирма, обект, устройства, оператори, лиценз",
        icon: "settings",
        minRole: "ADMIN",
        keywords: ["настройки", "фирма", "фу", "терминал", "оператори", "лиценз", "ддс ставки"],
      },
    ],
  },
];

const ROLE_ORDER: Record<RoleKey, number> = { CASHIER: 0, MANAGER: 1, ADMIN: 2 };

export function canSee(item: NavItem, role: RoleKey, readOnly: boolean): boolean {
  if (ROLE_ORDER[role] < ROLE_ORDER[item.minRole]) return false;
  if (readOnly && item.writeOnly) return false;
  return true;
}

/** Групите с видимите за сесията елементи; празните групи отпадат. */
export function visibleNav(role: RoleKey, readOnly: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, role, readOnly)) })).filter(
    (g) => g.items.length > 0
  );
}

export function flatNav(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}

/** Най-дългото съвпадение на префикс — „/products/123“ осветява „Номенклатура“. */
export function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const i of items) {
    const hit = pathname === i.href || pathname.startsWith(`${i.href}/`);
    if (hit && (!best || i.href.length > best.length)) best = i.href;
  }
  return best;
}

function norm(s: string): string {
  return s.toLocaleLowerCase("bg-BG").normalize("NFC").trim();
}

/**
 * Търсачка на командите: начало на името > част от името > ключова дума/описание.
 * Празна заявка → всички в реда на менюто.
 */
export function matchNav(query: string, items: NavItem[]): NavItem[] {
  const q = norm(query);
  if (!q) return items;
  const scored: Array<{ item: NavItem; score: number; order: number }> = [];
  items.forEach((item, order) => {
    const label = norm(item.label);
    let score = 0;
    if (label.startsWith(q)) score = 3;
    else if (label.includes(q)) score = 2;
    else if (item.keywords.some((k) => norm(k).includes(q)) || norm(item.hint).includes(q)) score = 1;
    if (score > 0) scored.push({ item, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.item);
}
