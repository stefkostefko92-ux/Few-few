// Проверени местни фирми и кантори в Дупница (телефони и адреси от официални
// регистри и указатели). Това е статичен, проверен каталог — показва се на
// страницата „Местен бизнес" дори без база данни. Всеки запис има източник.

export type LocalBusiness = {
  name: string;
  category: string;
  description?: string;
  address?: string;
  phones: { number: string; label?: string }[];
  website?: string;
  sources: string[];
};

export const BUSINESS_CATEGORIES = [
  "Нотариуси",
  "Аптеки",
] as const;

export const LOCAL_BUSINESSES: LocalBusiness[] = [
  // --- Нотариуси (Нотариална камара на РБ) ---
  {
    name: "Нотариус Деница Гърнева",
    category: "Нотариуси",
    description: "Нотариус с район на действие Районен съд — Дупница.",
    address: "ул. „Николаевска“ 16",
    phones: [
      { number: "0701 512 21" },
      { number: "0898 519 555", label: "мобилен" },
    ],
    website: "https://notariusgarneva.bg/",
    sources: ["https://www.notary-chamber.bg/"],
  },
  {
    name: "Нотариус Ася Радкова-Тодорова",
    category: "Нотариуси",
    address: "ул. „Солун“ 1, ет. 1",
    phones: [{ number: "0701 511 20" }],
    sources: ["https://www.notary-chamber.bg/", "https://www.notariusi.info/нотариуси/дупница"],
  },
  {
    name: "Нотариус Ефтим Китов",
    category: "Нотариуси",
    address: "ул. „Солун“ 5",
    phones: [{ number: "0701 510 46" }],
    sources: ["https://www.notary-chamber.bg/", "https://www.notariusi.info/нотариуси/дупница"],
  },
  {
    name: "Нотариус Сийка Милева",
    category: "Нотариуси",
    address: "ул. „Христо Ботев“ 5",
    phones: [{ number: "0701 510 03" }],
    sources: ["https://www.notary-chamber.bg/", "https://www.notariusi.info/нотариуси/дупница"],
  },
  {
    name: "Нотариус Луиза Стоева",
    category: "Нотариуси",
    address: "ул. „Солун“ 1",
    phones: [{ number: "0701 516 00" }],
    sources: ["https://www.notary-chamber.bg/", "https://www.notariusi.info/нотариуси/дупница"],
  },

  // --- Аптеки (освен денонощната, която е на отделна страница) ---
  {
    name: "Аптека Вива",
    category: "Аптеки",
    description: "Аптека в центъра на Дупница.",
    address: "ул. „Самуил“ 8",
    phones: [{ number: "0701 455 54" }],
    website: "https://aptekiviva.bg/",
    sources: ["https://aptekiviva.bg/page/locations", "https://spravochnik.framar.bg/аптеки/2530-дупница-град"],
  },
  {
    name: "Аптека Sopharmacy (до Kaufland)",
    category: "Аптеки",
    address: "ул. „Свети Иван Рилски“ 96А",
    phones: [{ number: "0882 440 081" }],
    sources: ["https://www.doc.bg/apteka/5889"],
  },
];

export function businessesByCategory(): { category: string; items: LocalBusiness[] }[] {
  return BUSINESS_CATEGORIES.map((category) => ({
    category,
    items: LOCAL_BUSINESSES.filter((b) => b.category === category),
  })).filter((g) => g.items.length > 0);
}
