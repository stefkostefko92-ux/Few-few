import "server-only";
import { prisma } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";

// „Прозрачност на общината" — обобщени данни за обществените поръчки на
// община Бобов дол, взети от официалната платформа СИГМА (МИДТ, отворени данни).
// Пазим кеширана СНИМКА в базата (SiteSetting), за да не зависим на живо от
// външен сайт. Обновява се по график през /api/ingest-transparency.

export const SIGMA_AUTHORITY_ID = "000261363"; // ОБЩИНА БОБОВ ДОЛ
export const SIGMA_AUTHORITY_URL = `https://sigma.midt.bg/authorities/${SIGMA_AUTHORITY_ID}`;
const SETTING_KEY = "transparency_sigma";

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

export async function getTransparency(): Promise<Transparency | null> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row?.value) return null;
    return JSON.parse(row.value) as Transparency;
  } catch {
    return null;
  }
}

export async function saveTransparency(data: Transparency): Promise<void> {
  await setSetting(SETTING_KEY, JSON.stringify(data));
}

function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Извлича обобщените данни от HTML страницата на СИГМА (сървърно).
export function parseSigmaHtml(html: string): Omit<Transparency, "updatedAt"> {
  // Ключови показатели: <dt>Етикет</dt><dd>Стойност</dd>
  const facts: Record<string, string> = {};
  for (const m of html.matchAll(/<dt>([^<]+)<\/dt>\s*<dd>([^<]+)<\/dd>/g)) {
    facts[clean(m[1])] = clean(m[2]);
  }

  // Топ изпълнители: редове на таблица с парична клетка (class="money").
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
    authority: "Община Бобов дол",
    authorityId: SIGMA_AUTHORITY_ID,
    totalValue: facts["Обща стойност"] ?? "",
    contractsCount: Number((contractsRaw.match(/\d+/g) ?? []).join("")) || 0,
    period: facts["Период"] ?? "",
    topSuppliers: suppliers,
    categories: [],
    sourceUrl: SIGMA_AUTHORITY_URL,
  };
}

// Тегли страницата на СИГМА и връща свежа снимка (за /api/ingest-transparency).
export async function fetchSigmaSnapshot(): Promise<Transparency | null> {
  try {
    const res = await fetch(SIGMA_AUTHORITY_URL, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const parsed = parseSigmaHtml(html);
    if (!parsed.totalValue || parsed.contractsCount === 0) return null; // подозрителна снимка
    return { ...parsed, updatedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
