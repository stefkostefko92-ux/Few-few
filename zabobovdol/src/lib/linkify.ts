// Превръща телефони и имейли в обикновен текст в „сегменти", които интерфейсът
// рендерира като реални връзки (tel: / mailto:). Така възрастен човек може да
// набере номер с едно докосване, вместо да го преписва. Чиста логика без UI —
// за да е лесна за тестване.

export type LinkSegment = {
  kind: "text" | "tel" | "mailto";
  text: string;
  href?: string;
};

export type LinkifyOptions = {
  /** Имейлите като mailto: (по подразбиране — да). */
  email?: boolean;
  /**
   * Кратките номера: „all“ — 112, 150, 160, 166 (по подразбиране); „112“ —
   * само 112; „none“ — никакви. В стъпките на ръководствата е „112“: там
   * „150“ е по-често грамове или градуси, отколкото телефон.
   */
  short?: "all" | "112" | "none";
};

// Опциите за стъпките на ръководствата: само дълги телефони и 112. Примерните
// адреси в стъпките („ime.familia@gmail.com“) не са за писане.
export const STEP_LINKIFY: LinkifyOptions = { email: false, short: "112" };

// Имейл и дълъг телефон (с +359/0 и 7–11 цифри със separator-и).
const EMAIL = "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}";
const PHONE = "(?:\\+359|00359|0)(?:[\\s\\-/]?\\d){7,11}";

// Краткият номер е отделна „дума“ — не част от адрес (112.mvr.bg), диапазон
// (130–150 г.), по-дълго число, дата или мярка (150 г, 160 °C).
const SHORT_BEFORE = "(?<![\\p{L}\\d.,:\\-–—/+])(?<!\\d\\s?[\\-–—]\\s?)";
const SHORT_AFTER =
  "(?![.,:\\-–—/]?[\\p{L}\\d])(?!\\s?[\\-–—]\\s?\\d)" +
  "(?!\\s?(?:°|%|€|(?:г|гр|грама|градуса?|мл|л|кг|км|м|см|мм|лв|ст|евро|лева|ч|мин|сек)(?!\\p{L})))";

const SHORT_NUMBERS: Record<NonNullable<LinkifyOptions["short"]>, string | null> = {
  all: "112|150|160|166",
  "112": "112",
  none: null,
};

function buildRe(opts: LinkifyOptions): RegExp {
  const short = SHORT_NUMBERS[opts.short ?? "all"];
  // Групите са на фиксирани места: 1 — имейл, 2 — дълъг телефон, 3 — кратък.
  // Изключеният вид е празна група, която никога не съвпада („((?!))“), за да
  // не се изместят номерата на другите.
  const never = "((?!))";
  const parts = [
    opts.email === false ? never : `(${EMAIL})`,
    `(${PHONE})`,
    short ? `${SHORT_BEFORE}(${short})${SHORT_AFTER}` : never,
  ];
  return new RegExp(parts.join("|"), "gu");
}

export function linkifySegments(input: string, opts: LinkifyOptions = {}): LinkSegment[] {
  const out: LinkSegment[] = [];
  const re = buildRe(opts);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) {
      out.push({ kind: "text", text: input.slice(last, m.index) });
    }
    const full = m[0];
    if (m[1]) {
      out.push({ kind: "mailto", text: full, href: `mailto:${full}` });
    } else {
      const digits = full.replace(/[^\d+]/g, "");
      out.push({ kind: "tel", text: full, href: `tel:${digits}` });
    }
    last = m.index + full.length;
  }
  if (last < input.length) {
    out.push({ kind: "text", text: input.slice(last) });
  }
  return out;
}
