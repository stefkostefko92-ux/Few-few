// Сумите и курсът в текстовете — с десетична ЗАПЕТАЯ (bg-BG): „1,95583“,
// „25,56 евро“, „1,96 лв“. Точката („1.95583“) е англоезичен запис.
// Пипа само суми пред валута и фиксирания курс — не датите („23.10.2026“),
// координатите и версиите.

const MONEY_DOT = /(?<![\d.,])(\d+)\.(\d{2,})(?=\s*(?:лв|лева|евро|€|BGN|EUR)(?![\p{L}]))|(?<![\d.,])1\.95583(?!\d)/gu;

/** Има ли сума или курс с десетична точка. */
export function hasDotDecimalMoney(text: string): boolean {
  MONEY_DOT.lastIndex = 0;
  const found = MONEY_DOT.test(text);
  MONEY_DOT.lastIndex = 0;
  return found;
}

/** „1 евро = 1.95583 лева“ → „1 евро = 1,95583 лева“. */
export function toBgMoneyDecimals(text: string): string {
  return text.replace(MONEY_DOT, (m, int?: string, frac?: string) =>
    int !== undefined && frac !== undefined ? `${int},${frac}` : m.replace(".", ","),
  );
}
