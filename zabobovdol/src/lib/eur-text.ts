// Сума в евро за показване: „20 €“, „19,50 €“ — запетая за десетичния знак и
// неразделящ интервал преди „€“ (сумата и знакът не се разделят на два реда).
const NBSP = " ";

export function eurText(eur: number): string {
  const whole = Number.isInteger(eur);
  const n = new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(eur);
  return `${n}${NBSP}€`;
}
