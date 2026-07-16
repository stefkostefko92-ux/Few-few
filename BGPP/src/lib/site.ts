// Централна конфигурация на сайта.
export const SITE = {
  name: "БГ Държавни предприятия",
  shortName: "BGPP",
  slogan: "Къде влизат и къде излизат парите на държавните предприятия",
  description:
    "Независим справочник за прозрачност: кои са държавните предприятия в България, кой ги контролира и по какъв начин влизат и излизат парите им. С връзки към официалните регистри за проверка.",
  url: "https://bgpp.carbonstealth.eu",
  locale: "bg_BG",
  author: "Carbon Stealth VCC",
  authorUrl: "https://carbonstealth.eu",
} as const;

export type NavItem = { href: string; label: string };

export const NAV: NavItem[] = [
  { href: "/predpriyatiya", label: "Предприятия" },
  { href: "/kartina", label: "Картината" },
  { href: "/regioni", label: "По области" },
  { href: "/parichni-potoci", label: "Паричните потоци" },
  { href: "/koncentraciya", label: "Концентрация" },
  { href: "/sluchai", label: "Случаи" },
  { href: "/konflikti", label: "Конфликт на интереси" },
  { href: "/istochnici", label: "Източници" },
  { href: "/metodologiya", label: "Методология" },
];
