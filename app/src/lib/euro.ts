// Фиксиран официален курс лев/евро.
export const BGN_PER_EUR = 1.95583;

export function bgnToEur(bgn: number): number {
  return bgn / BGN_PER_EUR;
}

export function eurToBgn(eur: number): number {
  return eur * BGN_PER_EUR;
}

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
