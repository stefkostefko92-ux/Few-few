// Чисти (без странични ефекти) типове и парсер за данните от СИГМА.
// Изведени отделно от transparency.ts, за да са лесно тестваеми (без
// зависимост от база данни или сървърен контекст).

// Кодът на институцията в СИГМА може да се различава от ЕИК/БУЛСТАТ; затова
// го правим заменяем през обкръжението. Стойността по подразбиране е
// ЕИК/БУЛСТАТ на Община Дупница (за потвърждение срещу sigma.midt.bg).
export const SIGMA_AUTHORITY_ID = process.env.SIGMA_AUTHORITY_ID || "000261369"; // ОБЩИНА ДУПНИЦА
export const SIGMA_AUTHORITY_URL = `https://sigma.midt.bg/authorities/${SIGMA_AUTHORITY_ID}`;

export type Supplier = {
  rank: number;
  name: string;
  amount: string;
  contracts?: string;
  share?: string;
};
export type Category = { name: string; amount: string; share?: string };

export type Transparency = {
  authority: string;
  authorityId: string;
  totalValue: string;
  contractsCount: number;
  period: string;
  topSuppliers: Supplier[];
  categories: Category[];
  sourceUrl: string;
  updatedAt: string; // ISO дата на снимката
};

export function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Извлича обобщените данни от HTML страницата на институция в СИГМА.
export function parseSigmaHtml(html: string): Omit<Transparency, "updatedAt"> {
  // Ключови показатели: <dt>Етикет</dt><dd>Стойност</dd>
  const facts: Record<string, string> = {};
  for (const m of html.matchAll(/<dt>([^<]+)<\/dt>\s*<dd>([^<]+)<\/dd>/g)) {
    facts[clean(m[1])] = clean(m[2]);
  }

  // Топ изпълнители: редове на таблица с парична клетка.
  const suppliers: Supplier[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      clean(c[1]),
    );
    if (cells.length >= 3 && /€/.test(cells[2] ?? "") && /^\d+$/.test(cells[0] ?? "")) {
      suppliers.push({
        rank: Number(cells[0]),
        name: cells[1],
        amount: cells[2],
        contracts: cells[3] || undefined,
        share: cells[4] || undefined,
      });
    }
    if (suppliers.length >= 10) break;
  }

  const contractsRaw = facts["Брой договори"] ?? "";
  return {
    authority: "Община Дупница",
    authorityId: SIGMA_AUTHORITY_ID,
    totalValue: facts["Обща стойност"] ?? "",
    contractsCount: Number((contractsRaw.match(/\d+/g) ?? []).join("")) || 0,
    period: facts["Период"] ?? "",
    topSuppliers: suppliers,
    categories: [],
    sourceUrl: SIGMA_AUTHORITY_URL,
  };
}
