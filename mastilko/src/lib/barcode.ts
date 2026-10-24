// Проверка на стойност за баркод ПРЕДИ да го нарисуваме — с ясна причина.
//
// Досега JsBarcode просто не рисуваше при невалидна стойност и баркодът
// изчезваше без обяснение. Най-честата грешка е грешна контролна цифра на
// EAN-13 (последната цифра от опаковката, преписана грешно) — тук казваме
// каква трябва да е. Чиста логика, без DOM — тества се с node:test.

export const BARCODE_TYPES = ["CODE128", "EAN13", "EAN8", "UPC", "ITF14", "CODE39"] as const;
export type BarcodeType = (typeof BARCODE_TYPES)[number];

/** Контролна цифра по GS1 (EAN-13, EAN-8, UPC-A, ITF-14) за данните без нея. */
export function gs1CheckDigit(data: string): number {
  let sum = 0;
  // Отдясно наляво: тегла 3, 1, 3, 1…
  for (let i = 0; i < data.length; i++) {
    const d = Number(data[data.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

// [дължина без контролна цифра, дължина с нея]
const GS1: Partial<Record<BarcodeType, [number, number, string]>> = {
  EAN13: [12, 13, "EAN-13"],
  EAN8: [7, 8, "EAN-8"],
  UPC: [11, 12, "UPC-A"],
  ITF14: [13, 14, "ITF-14"],
};

export interface BarcodeCheck {
  ok: boolean;
  /** Обяснение за човека — грешка, или (при ok) бележка като добавена контролна цифра. */
  message?: string;
}

export function checkBarcode(type: BarcodeType, raw: string): BarcodeCheck {
  const v = raw.trim();
  if (!v) return { ok: false };

  const gs1 = GS1[type];
  if (gs1) {
    const [short, full, name] = gs1;
    if (!/^\d+$/.test(v)) return { ok: false, message: `${name} приема само цифри.` };
    if (v.length === short) {
      return { ok: true, message: `Контролната цифра ${gs1CheckDigit(v)} се добавя автоматично.` };
    }
    if (v.length !== full) {
      return { ok: false, message: `${name} иска ${short} или ${full} цифри (въведени: ${v.length}).` };
    }
    const want = gs1CheckDigit(v.slice(0, short));
    if (Number(v[short]) !== want) {
      return {
        ok: false,
        message: `Грешна контролна цифра: последната трябва да е ${want}, не ${v[short]}. Провери кода от опаковката.`,
      };
    }
    return { ok: true };
  }

  if (type === "CODE39") {
    if (!/^[0-9A-Z \-.$/+%]+$/.test(v)) {
      return { ok: false, message: "Code 39 приема главни латински букви, цифри, интервал и - . $ / + %." };
    }
    return { ok: true };
  }

  // CODE128: печатими ASCII знаци — кирилицата не се кодира.
  if (!/^[\x20-\x7E]+$/.test(v)) {
    return { ok: false, message: "Code 128 приема латиница, цифри и знаци — без кирилица." };
  }
  return { ok: true };
}
