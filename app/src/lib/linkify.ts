// Превръща телефони и имейли в обикновен текст в „сегменти", които интерфейсът
// рендерира като реални връзки (tel: / mailto:). Така възрастен човек може да
// набере номер с едно докосване, вместо да го преписва. Чиста логика без UI —
// за да е лесна за тестване.

export type LinkSegment = {
  kind: "text" | "tel" | "mailto";
  text: string;
  href?: string;
};

// Имейл, дълъг телефон (с +359/0 и 7–11 цифри със separator-и) и кратки спешни
// номера (112, 150, 160, 166). Подредбата в алтернативата има значение.
const EMAIL = "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}";
const PHONE = "(?:\\+359|00359|0)(?:[\\s\\-/]?\\d){7,11}";
const SHORT = "(?:112|150|160|166)";

function buildRe(): RegExp {
  // \b около краткия номер, за да не хваща части от по-дълги числа/години.
  return new RegExp(`(${EMAIL})|(${PHONE})|\\b(${SHORT})\\b`, "g");
}

export function linkifySegments(input: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  const re = buildRe();
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
