// Указател с важни услуги и телефони за Дупница.
//
// ВАЖНО: тук влизат само проверени данни. Всеки телефон носи флаг `verified`.
// Непотвърдените номера (verified: false) се показват с ясно предупреждение,
// за да не подведат потребителя. Източниците са в `sources` (достъп 2026-06-22).
// Данните се поддържат ръчно засега; следваща фаза — администрация през Prisma.

export type ServiceCategory =
  | "EMERGENCY"
  | "HEALTH"
  | "UTILITY"
  | "TRANSPORT"
  | "ADMIN";

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  EMERGENCY: "Спешни",
  HEALTH: "Здраве",
  UTILITY: "Ток, вода, отпадъци",
  TRANSPORT: "Транспорт",
  ADMIN: "Администрация",
};

// Подреден списък на категориите за филтри/секции.
export const CATEGORY_ORDER: ServiceCategory[] = [
  "EMERGENCY",
  "HEALTH",
  "UTILITY",
  "TRANSPORT",
  "ADMIN",
];

export type Phone = {
  number: string; // формат за показване (с интервали)
  label?: string; // напр. „регистратура", „авария"
  verified: boolean; // потвърден ли е от източник
};

export type Service = {
  slug: string;
  name: string;
  category: ServiceCategory;
  description?: string;
  address?: string;
  website?: string;
  hours?: string;
  phones: Phone[];
  sources: string[]; // URL-и, от които е потвърдена информацията
};

export const SERVICES: Service[] = [
  {
    slug: "speshen-telefon-112",
    name: "Спешен телефон 112",
    category: "EMERGENCY",
    description:
      "Единен европейски номер за спешни повиквания — полиция, спешна медицинска помощ и пожарна. Обаждането е безплатно, денонощно.",
    phones: [{ number: "112", verified: true }],
    sources: ["https://112.bg/"],
  },
  {
    slug: "speshna-pomosht-dupnitsa",
    name: "Спешна медицинска помощ — филиал Дупница (ФСМП)",
    category: "HEALTH",
    description:
      "Филиал за спешна медицинска помощ към ЦСМП Кюстендил. При спешност се обаждайте на 112.",
    address: "ул. „Св. Георги“ №2, Дупница",
    phones: [{ number: "112", label: "при спешност", verified: true }],
    sources: ["https://csmp-kn.org/filiali/fsmp-dupnica.html"],
  },
  {
    slug: "mbal-sveti-ivan-rilski-dupnitsa",
    name: "МБАЛ „Св. Иван Рилски“ — Дупница",
    category: "HEALTH",
    description: "Общинската многопрофилна болница в Дупница.",
    website: "https://mbal.org/",
    phones: [{ number: "0701 51827", label: "регистратура", verified: true }],
    sources: ["https://mbal.org/", "https://mbal.org/контакти/"],
  },
  {
    slug: "vik-dupnitsa",
    name: "ВиК Дупница — аварии и водоснабдяване",
    category: "UTILITY",
    description:
      "Водоснабдяване и канализация за Дупница. Денонощен телефон за аварии. Съобщения за аварии се публикуват и на сайта на дружеството.",
    website: "https://vik-dupnitsa.bg/",
    phones: [{ number: "0701 594 20", label: "денонощно — аварии", verified: true }],
    sources: ["https://vik-dupnitsa.bg/contact-us/"],
  },
  {
    slug: "elektrohold-ermzapad",
    name: "Електрохолд (ЕРМ Запад) — прекъсвания на ток",
    category: "UTILITY",
    description:
      "Електроразпределение за област Кюстендил, включително Дупница. Онлайн справка за аварии и планови ремонти по адрес/клиентски номер.",
    website: "https://info.ermzapad.bg/webint/vok/avplan.php",
    phones: [{ number: "0700 10 010", label: "обслужване на клиенти", verified: true }],
    sources: [
      "https://ermzapad.bg/bg/za-klienta/prekusvania/",
      "https://info.ermzapad.bg/webint/vok/avplan.php",
    ],
  },
  {
    slug: "avtogara-dupnitsa",
    name: "Автогара Дупница",
    category: "TRANSPORT",
    description:
      "Информация за междуградски и градски автобусни линии. За актуални разписания се обадете на автогарата.",
    phones: [{ number: "0701 40854", label: "информация", verified: true }],
    sources: [
      "https://bgrazpisanie.com/en/bus_station/dupnitsa",
      "https://www.razpisanie.org/avtogara-dupnitsa/",
    ],
  },
  {
    slug: "obshtina-dupnitsa",
    name: "Община Дупница — официален сайт и е-услуги",
    category: "ADMIN",
    description:
      "Официалният сайт на общината с административни услуги, местни данъци и такси, решения на Общинския съвет и бюджет. Електронните услуги изискват електронен подпис (КЕП).",
    website: "https://www.dupnitsa.bg/",
    phones: [],
    sources: ["https://www.dupnitsa.bg/", "https://www.dupnitsa.bg/section-291-content.html"],
  },
  {
    slug: "taksi-dupnitsa",
    name: "Такси в Дупница",
    category: "TRANSPORT",
    description:
      "Местни таксиметрови компании. Номерата по-долу са от онлайн указатели и все още НЕ са потвърдени от нас — препоръчваме да проверите, преди да разчитате на тях.",
    phones: [
      { number: "0701 52181", label: "Хит такси (непотвърден)", verified: false },
      { number: "0701 50200", label: "Сити такси (непотвърден)", verified: false },
      { number: "0701 52222", label: "Мега такси (непотвърден)", verified: false },
    ],
    sources: [
      "https://taxistars.net/bg/taksi-mrezha/dupnitza.php",
      "https://www.goldenpages.bg/bg/taksita/dupnitsa",
    ],
  },
];
