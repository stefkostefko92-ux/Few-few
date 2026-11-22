// Менюто на админ панела — подредено по ЗАДАЧАТА на човека, не по таблиците в
// базата. Чист модул (без React и без база): ползва го AdminShell, а тестът
// (nav.test.ts) пази всеки раздел да е в менюто точно веднъж.
import { RESOURCES } from "@/lib/admin/resources";

export type NavIcon =
  | "dashboard"
  | "complaint"
  | "dump"
  | "phoneOff"
  | "message"
  | "megaphone"
  | "listing"
  | "help"
  | "memory"
  | "volunteer"
  | "car"
  | "images"
  | "cross"
  | "book"
  | "phone"
  | "store"
  | "pharmacy"
  | "zap"
  | "shield"
  | "calendar"
  | "news"
  | "import"
  | "send"
  | "chart"
  | "search"
  | "globe"
  | "banner"
  | "qr"
  | "mail"
  | "assistant"
  | "mobile"
  | "settings"
  | "users"
  | "audit";

export type NavItem = {
  href: string;
  label: string;
  /** Кратко какво има вътре — подсказка и материал за търсенето в менюто. */
  hint: string;
  icon: NavIcon;
  /** Ключ в броячите „чака действие“ (layout.tsx → computePending). */
  pendingKey?: string;
  adminOnly?: boolean;
};

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const DASHBOARD: NavItem = {
  href: "/admin",
  label: "Табло",
  hint: "Обзор, седмицата, какво чака",
  icon: "dashboard",
};

/** Раздел от RESOURCES (етикетът и правата идват оттам — едно място). */
function res(key: string, icon: NavIcon, hint: string): NavItem {
  const r = RESOURCES.find((x) => x.key === key);
  if (!r) throw new Error(`Няма ресурс „${key}“ в RESOURCES`);
  return {
    href: `/admin/${r.key}`,
    label: r.labelPlural,
    hint,
    icon,
    ...(r.moderated || key === "saobshteniya" || key === "greshni-nomera" ? { pendingKey: r.key } : {}),
    ...(r.adminOnly ? { adminOnly: true } : {}),
  };
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "inbox",
    label: "Входящи",
    items: [
      {
        href: "/admin/signali",
        label: "Сигнали до общината",
        hint: "Сигнали от граждани, препращане към общината",
        icon: "complaint",
        pendingKey: "signali",
        adminOnly: true,
      },
      res("smetishta", "dump", "Нерегламентирани сметища, подадени от хората"),
      res("greshni-nomera", "phoneOff", "Телефони, които хората отбелязват като грешни"),
      res("saobshteniya", "message", "Писма от формата за контакт"),
      {
        href: "/admin/reklami",
        label: "Заявки за реклама",
        hint: "Фирми, които искат реклама на сайта",
        icon: "megaphone",
        pendingKey: "reklami",
        adminOnly: true,
      },
    ],
  },
  {
    id: "community",
    label: "Публикации от хората",
    items: [
      res("listings", "listing", "Обяви — продавам, търся, подарявам"),
      res("help", "help", "Хора, които търсят помощ"),
      res("dobrovolci", "volunteer", "Хора, които предлагат помощ"),
      res("patuvane", "car", "Споделени пътувания"),
      res("galeriya", "images", "Снимки от хората"),
      res("spomeni", "memory", "Спомени за Бобов дол"),
      res("pomeni", "cross", "Некролози и помени"),
    ],
  },
  {
    id: "directory",
    label: "Справочник",
    items: [
      res("faq", "book", "Ръководства стъпка по стъпка"),
      res("services", "phone", "Институции, услуги и телефони"),
      res("business", "store", "Магазини, занаятчии и фирми"),
      res("dezhurstva", "pharmacy", "Графикът на дежурните аптеки"),
      res("prekysvaniya", "zap", "Планирани и аварийни прекъсвания"),
      res("izmami", "shield", "Актуални измами и как да се пазим"),
      res("events", "calendar", "Събития в града"),
    ],
  },
  {
    id: "news",
    label: "Новини и известия",
    items: [
      res("posts", "news", "Новините на сайта"),
      {
        href: "/admin/novini",
        label: "Новини от общината",
        hint: "Внасяне от сайта на общината и одобрение",
        icon: "import",
      },
      {
        href: "/admin/izvestiya",
        label: "Известия (push)",
        hint: "Известия до телефоните на абонатите",
        icon: "send",
        adminOnly: true,
      },
    ],
  },
  {
    id: "insights",
    label: "Анализ",
    items: [
      {
        href: "/admin/statistika",
        label: "Статистика",
        hint: "Посещения и изпълнени задачи",
        icon: "chart",
        adminOnly: true,
      },
      {
        href: "/admin/search-misses",
        label: "Търсения без резултат",
        hint: "Какво търсят хората и не намират",
        icon: "search",
      },
      {
        href: "/admin/indeksirane",
        label: "Търсачки",
        hint: "Google, Bing, индексиране",
        icon: "globe",
        adminOnly: true,
      },
    ],
  },
  {
    id: "site",
    label: "Сайт и настройки",
    items: [
      res("banners", "banner", "Рекламните банери на сайта"),
      res("qr", "qr", "Кратки адреси и QR кодове"),
      {
        href: "/admin/poshta",
        label: "Поща (Brevo)",
        hint: "Откъде тръгват писмата на сайта",
        icon: "mail",
        adminOnly: true,
      },
      {
        href: "/admin/pomoshtnik",
        label: "Дигитален помощник",
        hint: "Чатът на сайта (AI)",
        icon: "assistant",
        adminOnly: true,
      },
      {
        href: "/admin/mobilno",
        label: "Мобилно приложение",
        hint: "Android приложението",
        icon: "mobile",
        adminOnly: true,
      },
      {
        href: "/admin/users",
        label: "Потребители",
        hint: "Кой влиза в панела и с какви права",
        icon: "users",
        adminOnly: true,
      },
      {
        href: "/admin/nastroyki",
        label: "Настройки",
        hint: "Цени, връзки, графици и други",
        icon: "settings",
        adminOnly: true,
      },
      {
        href: "/admin/audit",
        label: "Одит лог",
        hint: "Кой какво е променил",
        icon: "audit",
        adminOnly: true,
      },
    ],
  },
];

/** Групите, видими за ролята (празните отпадат). */
export function navFor(role: "ADMIN" | "EDITOR"): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || role === "ADMIN"),
  })).filter((g) => g.items.length > 0);
}

export const PROFILE: NavItem = {
  href: "/admin/profil",
  label: "Моят профил",
  hint: "Имейл и парола за вход",
  icon: "users",
};

/** Активният раздел за адреса: най-дългото съвпадение (/admin/faq/123 → „Ръководства“). */
export function activeItem(pathname: string, groups: NavGroup[]): { group: NavGroup | null; item: NavItem } | null {
  if (pathname === "/admin") return { group: null, item: DASHBOARD };
  if (pathname === PROFILE.href) return { group: null, item: PROFILE };
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const g of groups)
    for (const i of g.items)
      if ((pathname === i.href || pathname.startsWith(i.href + "/")) && (!best || i.href.length > best.item.href.length))
        best = { group: g, item: i };
  return best;
}

/** Търсене в менюто: без значение главни/малки букви и ъ/ь; по етикет и подсказка. */
export function matchesQuery(item: NavItem, query: string): boolean {
  const norm = (s: string) => s.toLocaleLowerCase("bg-BG").replace(/[„“"()]/g, "").trim();
  const q = norm(query);
  if (!q) return true;
  return q.split(/\s+/).every((w) => norm(`${item.label} ${item.hint}`).includes(w));
}
