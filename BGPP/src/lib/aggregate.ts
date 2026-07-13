import { ENTERPRISES } from "@/data/enterprises";
import { SECTORS } from "@/data/sectors";
import { PRINCIPALS } from "@/data/principals";

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
