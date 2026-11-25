import "server-only";
import { prisma } from "@/lib/prisma";
import { getAdSettings } from "@/lib/settings";
import { sofiaDay } from "@/lib/stats-core";
import {
  AD_PAGES,
  bannersInMonth,
  buildAdReport,
  lastMonths,
  monthStart,
  type MonthReport,
  type StatRow,
} from "@/lib/ad-report";

export type AdReportData = {
  months: MonthReport[];
  priceEur: number;
  activeBanners: number;
  /** false, ако таблицата със статистиката още я няма или базата не отговаря. */
  available: boolean;
};

// Месечният отчет за рекламодателя от агрегатите в DailyStat. Чете само брой
// на ден (метрика + път) — нищо за отделни посетители.
export async function loadAdReport(months = 6): Promise<AdReportData> {
  const today = sofiaDay();
  const keys = lastMonths(today, months);
  const from = monthStart(keys[keys.length - 1]);
  const { priceEur } = await getAdSettings();

  let banners: Date[] = [];
  try {
    const rows = await prisma.banner.findMany({
      where: { published: true },
      select: { createdAt: true },
    });
    banners = rows.map((r) => r.createdAt);
  } catch {
    /* без банери — отчетът пак показва прегледите */
  }

  let rows: StatRow[] = [];
  let available = true;
  try {
    const grouped = await prisma.dailyStat.groupBy({
      by: ["day", "metric", "path"],
      where: {
        day: { gte: from },
        metric: { in: ["view", "banner_click"] },
        path: { in: [...AD_PAGES] },
      },
      _sum: { count: true },
    });
    rows = grouped.map((g) => ({
      day: g.day,
      metric: g.metric,
      path: g.path,
      count: g._sum.count ?? 0,
    }));
  } catch {
    available = false;
  }

  return {
    months: buildAdReport(rows, {
      today,
      months,
      priceEur,
      bannersFor: (m) => bannersInMonth(banners, m),
    }),
    priceEur,
    activeBanners: banners.length,
    available,
  };
}
