// Местната бележка към ръководство („В Бобов дол“) е обикновен текст от
// админа: редове, редове с „•“ за офиси, и „Източник: …, проверено на …“ в
// края на абзаца. Тук я разделяме на блокове, за да се покаже като абзаци,
// истински списък и отделен мета ред за източника. Чиста логика — тества се.

export type LocalNoteBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "source"; text: string };

const BULLET = /^\s*[•\-*–]\s+/u;
// „Източник:“ до края на абзаца — става отделен ред под него.
const SOURCE = /\s*(Източник:\s.+)$/u;

export function parseLocalNote(note: string): LocalNoteBlock[] {
  const out: LocalNoteBlock[] = [];
  const paragraphs = (note ?? "").replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  for (const para of paragraphs) {
    let text: string[] = [];
    let list: string[] = [];
    const flushText = () => {
      if (!text.length) return;
      const joined = text.join(" ").replace(/\s+/g, " ").trim();
      text = [];
      const m = SOURCE.exec(joined);
      const body = m ? joined.slice(0, m.index).trim() : joined;
      if (body) out.push({ kind: "p", text: body });
      if (m) out.push({ kind: "source", text: m[1].trim() });
    };
    const flushList = () => {
      if (list.length) out.push({ kind: "ul", items: list });
      list = [];
    };
    for (const raw of para.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (BULLET.test(line)) {
        flushText();
        list.push(line.replace(BULLET, "").trim());
      } else {
        flushList();
        text.push(line);
      }
    }
    flushList();
    flushText();
  }
  return out;
}
