// Чиста логика на откритата продажба: какво е анулирано между две състояния на екрана.
// Ред се разпознава по `uid` (даден от екрана), не по стока — една стока може да е на
// няколко реда (тегловни, заключени цени).

export interface DraftLineKey {
  uid: string;
  productId: string;
  qtyMilli: number;
}

/**
 * Анулирани количества (Прил. № 29, т. 12): премахнат ред → цялото количество;
 * намалено количество → разликата. Увеличение и нов ред не са анулиране.
 */
export function diffCancellations(prev: DraftLineKey[], next: DraftLineKey[]): DraftLineKey[] {
  const byUid = new Map(next.map((l) => [l.uid, l]));
  const out: DraftLineKey[] = [];
  for (const p of prev) {
    const n = byUid.get(p.uid);
    const remaining = n && n.productId === p.productId ? n.qtyMilli : 0;
    if (remaining < p.qtyMilli) out.push({ uid: p.uid, productId: p.productId, qtyMilli: p.qtyMilli - remaining });
  }
  return out;
}
