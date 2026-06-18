import "server-only";
import { prisma } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";
import {
  parseSigmaHtml,
  SIGMA_AUTHORITY_ID,
  SIGMA_AUTHORITY_URL,
  type Transparency,
} from "@/lib/sigma-parse";

// „Прозрачност на общината" — обобщени данни за обществените поръчки на община
// Бобов дол, взети от официалната платформа СИГМА (МИДТ, отворени данни).
// Пазим кеширана СНИМКА в базата (SiteSetting), за да не зависим на живо от
// външен сайт. Обновява се по график през /api/ingest-transparency.

export { SIGMA_AUTHORITY_ID, SIGMA_AUTHORITY_URL };
export type { Supplier, Category, Transparency } from "@/lib/sigma-parse";

const SETTING_KEY = "transparency_sigma";

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
