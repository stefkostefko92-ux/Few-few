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
// Дупница, взети от официалната платформа СИГМА (МИДТ, отворени данни).
// Пазим кеширана СНИМКА в базата (SiteSetting), за да не зависим на живо от
// външен сайт. Обновява се по график през /api/ingest-transparency.

export { SIGMA_AUTHORITY_ID, SIGMA_AUTHORITY_URL };
export type { Supplier, Category, Transparency } from "@/lib/sigma-parse";

const SETTING_KEY = "transparency_sigma";

// Напълно автоматично обновяване: щом кешираната снимка остарее (или липсва),
// сами я обновяваме във фонов режим — без cron и без ръчна намеса. Посетителят
// получава кешираното веднага, а свежите данни се теглят за следващия преглед.
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // снимка над 7 дни се смята за остаряла
const MIN_RETRY_MS = 60 * 60 * 1000; // ако СИГМА не отговаря, не пробваме по-често от веднъж на час
let refreshing = false;
let lastAttempt = 0;

function snapshotAgeMs(snap: Transparency | null): number {
  if (!snap?.updatedAt) return Infinity;
  const t = Date.parse(snap.updatedAt);
  return Number.isNaN(t) ? Infinity : Date.now() - t;
}

// Стартира неблокиращо обновяване във фонов режим, ако е нужно.
function maybeRefresh(snap: Transparency | null): void {
  const stale = snapshotAgeMs(snap) > STALE_MS;
  if (!stale) return;
  if (refreshing) return;
  if (Date.now() - lastAttempt < MIN_RETRY_MS) return;
  refreshing = true;
  lastAttempt = Date.now();
  void (async () => {
    try {
      const fresh = await fetchSigmaSnapshot();
      if (fresh) await saveTransparency(fresh);
    } catch {
      /* мълчаливо — пробваме пак при следващо посещение след MIN_RETRY_MS */
    } finally {
      refreshing = false;
    }
  })();
}

export async function getTransparency(): Promise<Transparency | null> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
    const snap = row?.value ? (JSON.parse(row.value) as Transparency) : null;
    // Обновяваме във фонов режим при остаряла/липсваща снимка (не блокира страницата).
    maybeRefresh(snap);
    return snap;
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
