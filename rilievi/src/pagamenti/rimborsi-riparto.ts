/**
 * Разпределянето на едно връщане по поръчките в Revolut (условията 2026-11-13, чл. 12.9 — „sullo stesso mezzo di
 * pagamento“): Revolut връща най-много платеното по всяка поръчка. При надграждане стойността на новия план
 * включва кредита от по-старите плащания (чл. 12.4) — дължимото може да е повече от платеното по последната
 * поръчка; остатъкът отива върху поръчките, от които идва кредитът, в подадения ред. Каквото не се побира в никоя
 * (`restoCent`), се връща с превод и се отбелязва на ръка. Без база — само числа.
 */
export interface OrdinePagato {
  id: string;
  /** Платеното по поръчката (с ДДС), в центове. */
  pagatoCent: number;
  /** Вече върнатото или в ход по същата поръчка. */
  giaRimborsatoCent: number;
}

export interface Riparto {
  parti: Array<{ id: string; cent: number }>;
  restoCent: number;
}

export function ripartisci(importoCent: number, ordini: readonly OrdinePagato[]): Riparto {
  if (!Number.isSafeInteger(importoCent) || importoCent <= 0) return { parti: [], restoCent: 0 };
  let resto = importoCent;
  const parti: Riparto['parti'] = [];
  const visti = new Set<string>();
  for (const o of ordini) {
    if (resto === 0) break;
    if (visti.has(o.id)) continue;
    visti.add(o.id);
    const libero = Math.max(
      0,
      Math.trunc(o.pagatoCent) - Math.max(0, Math.trunc(o.giaRimborsatoCent)),
    );
    const cent = Math.min(resto, libero);
    if (cent > 0) {
      parti.push({ id: o.id, cent });
      resto -= cent;
    }
  }
  return { parti, restoCent: resto };
}
