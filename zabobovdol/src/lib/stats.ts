import "server-only";
import { prisma } from "@/lib/prisma";
import { sofiaDay } from "@/lib/stats-core";

export { sofiaDay, normalizePath, normalizeSource, isBot } from "@/lib/stats-core";

// Агрегатна статистика БЕЗ лични данни. Записва се само: ден (по София),
// метрика, нормализиран път и източник — и броят. Никакъв IP адрес, user agent,
// хеш или идентификатор. Затова не е нужна бисквитка или съгласие за проследяване:
// нищо не се чете и не се пише в устройството на посетителя.

// +n за (днес, метрика, път, източник). Никога не хвърля — броенето не бива да
// чупи страницата или действието.
export async function bump(metric: string, path = "", source = "", n = 1): Promise<void> {
  const day = sofiaDay();
  try {
    await prisma.dailyStat.upsert({
      where: { day_metric_path_source: { day, metric, path, source } },
      create: { day, metric, path, source, count: n },
      update: { count: { increment: n } },
    });
  } catch {
    /* второстепенно */
  }
}
