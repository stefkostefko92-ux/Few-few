import { ENTERPRISES } from "@/data/enterprises";
import { SECTORS } from "@/data/sectors";
import { PRINCIPALS } from "@/data/principals";
import type { Enterprise } from "@/data/types";

// Обобщени показатели за началната страница и филтрите. Чисто изведени от
// каталога, без външни зависимости.

export function totalEnterprises(): number {
  return ENTERPRISES.length;
}

export function countBySector(): { key: string; name: string; count: number }[] {
  return SECTORS.map((s) => ({
    key: s.key,
    name: s.name,
    count: ENTERPRISES.filter((e) => e.sector === s.key).length,
  })).filter((x) => x.count > 0);
}

export function countByPrincipal(): {
  key: string;
  name: string;
  count: number;
}[] {
  return PRINCIPALS.map((p) => ({
    key: p.key,
    name: p.name,
    count: ENTERPRISES.filter((e) => e.principal === p.key).length,
  })).filter((x) => x.count > 0);
}

/** Брой предприятия, за които посочваме официален уебсайт. */
export function withWebsite(): number {
  return ENTERPRISES.filter((e) => e.website).length;
}

/** Предприятия с отбелязан структурен конфликт на интереси. */
export function withConflicts() {
  return ENTERPRISES.filter((e) => e.conflicts && e.conflicts.length > 0);
}

/** Общ брой изброени дъщерни дружества/поделения в холдингите. */
export function totalSubsidiaries(): number {
  return ENTERPRISES.reduce((n, e) => n + (e.subsidiaries?.length ?? 0), 0);
}

// ── Индекс на прозрачност ────────────────────────────────────────────────────
// Честен, прост индикатор за ПУБЛИЧНА ПРОСЛЕДИМОСТ (не оценка за управление).
// Всеки критерий е проверим от публично достъпното. Максимум 5 точки.
export type TransparencyCriterion = { label: string; ok: boolean };
export type Transparency = {
  score: number;
  max: number;
  criteria: TransparencyCriterion[];
  label: string;
};

export function transparency(e: Enterprise): Transparency {
  const criteria: TransparencyCriterion[] = [
    { label: "Официален сайт", ok: !!e.website },
    { label: "ЕИК в регистъра", ok: !!e.eik },
    { label: "Публикувани финансови данни", ok: !!e.financial },
    { label: "Публични обществени поръчки", ok: e.sector !== "otbrana" },
    { label: "Няколко независими източника", ok: e.sources.length >= 3 },
  ];
  const score = criteria.filter((c) => c.ok).length;
  const max = criteria.length;
  const label = score >= 4 ? "добра" : score >= 2 ? "средна" : "ниска";
  return { score, max, criteria, label };
}
