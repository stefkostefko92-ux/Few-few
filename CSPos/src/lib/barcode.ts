// Баркодове: EAN-13/EAN-8 контролна цифра + тегловни/ценови баркодове
// с конфигурируема маска (префикси 20–29 са за вътрешно ползване — GS1 RCN).
// БГ конвенция (Microinvest/Еликом/Barsy/iCash): 28 IIIII WWWWW C — PLU 5 цифри,
// тегло 5 цифри в грамове (WW.WWW кг). 29 често се ползва за цена (настройка).

export type EmbeddedKind = "weight" | "price";

export interface BarcodeMaskRule {
  prefix: string; // напр. "28"
  kind: EmbeddedKind;
  pluDigits: number; // обикновено 5
  valueDigits: number; // обикновено 5
  valueDecimals: number; // 3 за тегло (кг), 2 за цена (евро)
}

/** БГ подразбиране: 28 = тегло, 29 = цена. Променя се от Настройки. */
export const DEFAULT_MASK_RULES: BarcodeMaskRule[] = [
  { prefix: "28", kind: "weight", pluDigits: 5, valueDigits: 5, valueDecimals: 3 },
  { prefix: "29", kind: "price", pluDigits: 5, valueDigits: 5, valueDecimals: 2 },
];

/** EAN-13/EAN-8 mod-10 контролна цифра върху всички цифри без последната. */
export function eanCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  // тегла 3/1 отдясно наляво
  const ds = digitsWithoutCheck.split("").reverse();
  for (let i = 0; i < ds.length; i++) {
    const d = parseInt(ds[i]!, 10);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  return eanCheckDigit(code.slice(0, -1)) === parseInt(code.slice(-1)!, 10);
}

export interface EmbeddedBarcode {
  kind: EmbeddedKind;
  plu: number;
  /** тегло в грамове (kind=weight) или цена в евроценти (kind=price) */
  value: number;
  /** количество в millis (1000 = 1 кг) — само при kind=weight */
  qtyMilli: number | null;
}

/**
 * Разпознава тегловен/ценови баркод по маските. Търсенето на артикула е
 * САМО по PLU цифрите; контролната цифра се валидира, ако кодът е EAN-13.
 */
export function parseEmbeddedBarcode(
  code: string,
  rules: BarcodeMaskRule[] = DEFAULT_MASK_RULES
): EmbeddedBarcode | null {
  if (!/^\d{13}$/.test(code)) return null;
  for (const rule of rules) {
    if (!code.startsWith(rule.prefix)) continue;
    const expectedLen = rule.prefix.length + rule.pluDigits + rule.valueDigits + 1;
    if (code.length !== expectedLen) continue;
    if (!isValidEan(code)) continue;
    const plu = parseInt(code.slice(rule.prefix.length, rule.prefix.length + rule.pluDigits), 10);
    const rawValue = parseInt(
      code.slice(rule.prefix.length + rule.pluDigits, expectedLen - 1),
      10
    );
    if (rule.kind === "weight") {
      // rawValue е в най-малката единица на маската (3 десетични → грамове)
      const grams = rawValue * 10 ** (3 - rule.valueDecimals);
      return { kind: "weight", plu, value: grams, qtyMilli: grams };
    }
    // цена: rawValue → евроценти
    const cents = rawValue * 10 ** (2 - rule.valueDecimals);
    return { kind: "price", plu, value: cents, qtyMilli: null };
  }
  return null;
}
