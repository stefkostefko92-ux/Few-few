// Съпоставяне на седалището (hq) на всяко предприятие към една от 28-те области.
//
// ВАЖНО: показваме къде е РЕГИСТРИРАНО седалището, а не къде оперира
// предприятието. Много холдинги със седалище в София работят в цялата страна —
// затова картата отразява административната регистрация, не икономическия отпечатък.

import { ENTERPRISES } from "./enterprises";
import { OBLAST_PATHS } from "./oblasti-geo";
import type { Enterprise } from "./types";

/** Каноничните имена на областите (както в geo-данните). */
export const OBLAST_NAMES = OBLAST_PATHS.map((o) => o.name);

/**
 * Населено място / община → област. Ключовете са в долен регистър без
 * пунктуация. Покрива всички седалища в каталога плюс честите разночетения.
 */
const SETTLEMENT_TO_OBLAST: Record<string, string> = {
  // Областни центрове (съвпадат с името на областта)
  благоевград: "Благоевград",
  бургас: "Бургас",
  варна: "Варна",
  "велико търново": "Велико Търново",
  видин: "Видин",
  враца: "Враца",
  габрово: "Габрово",
  добрич: "Добрич",
  кърджали: "Кърджали",
  кюстендил: "Кюстендил",
  ловеч: "Ловеч",
  монтана: "Монтана",
  пазарджик: "Пазарджик",
  перник: "Перник",
  плевен: "Плевен",
  пловдив: "Пловдив",
  разград: "Разград",
  русе: "Русе",
  силистра: "Силистра",
  сливен: "Сливен",
  смолян: "Смолян",
  софия: "София (столица)",
  "стара загора": "Стара Загора",
  търговище: "Търговище",
  хасково: "Хасково",
  шумен: "Шумен",
  ямбол: "Ямбол",
  // Други населени места, срещащи се в каталога → тяхната област
  сопот: "Пловдив",
  крумово: "Пловдив",
  созопол: "Бургас",
  раднево: "Стара Загора",
  ковачево: "Стара Загора",
  козлодуй: "Враца",
  "горна оряховица": "Велико Търново",
  коньовец: "Шумен",
};

/** Маркери, че седалището не сочи една конкретна област (национален обхват). */
const NATIONAL_MARKERS = ["цялата страна", "университетски центрове"];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[„“"«».,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Връща името на областта за дадено седалище, или `null` ако седалището е с
 * национален обхват / не може да се определи еднозначно.
 */
export function oblastForHq(hq?: string): string | null {
  if (!hq) return null;
  const norm = normalize(hq);

  // 1) Водещото населено място (преди запетая/наклонена/скоба/тире) има
  //    приоритет — регистрираното седалище печели дори при „клонове в цялата
  //    страна“ (напр. „София (клонове в цялата страна)“ → София).
  const lead = norm.split(/[/,(—-]/)[0].trim().replace(/^с\s+/, "");
  if (SETTLEMENT_TO_OBLAST[lead]) return SETTLEMENT_TO_OBLAST[lead];

  // 2) Изричен национален обхват без конкретно седалище.
  if (NATIONAL_MARKERS.some((m) => norm.includes(m))) return null;

  // 3) Изрична област/община в текста, напр. „с. Ковачево, общ. Раднево“.
  for (const key of Object.keys(SETTLEMENT_TO_OBLAST)) {
    if (norm.includes(key)) return SETTLEMENT_TO_OBLAST[key];
  }
  return null;
}

export type OblastAggregate = {
  name: string;
  code: string;
  count: number;
  enterprises: Enterprise[];
};

/** Групира каталога по област (сортирано по брой предприятия, низходящо). */
export function enterprisesByOblast(): {
  byName: Map<string, OblastAggregate>;
  national: Enterprise[];
  ranked: OblastAggregate[];
} {
  const byName = new Map<string, OblastAggregate>();
  for (const o of OBLAST_PATHS) {
    byName.set(o.name, { name: o.name, code: o.code, count: 0, enterprises: [] });
  }
  const national: Enterprise[] = [];
  for (const e of ENTERPRISES) {
    const name = oblastForHq(e.hq);
    if (!name) {
      national.push(e);
      continue;
    }
    const agg = byName.get(name);
    if (agg) {
      agg.enterprises.push(e);
      agg.count += 1;
    }
  }
  const ranked = [...byName.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "bg"),
  );
  return { byName, national, ranked };
}
